import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { getSettings, preparePayrollRecord } from './src/routes/api.js';
import { payrollTransaction } from './src/payroll-transaction.js';
import { payrollCoversDate, hasRecordedWork } from './src/leave-approval.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
const tag = 'otp-employee-records-v1';
const today = '2026-10-07';
const dayKeys = (start, end) => {
  const dates = [];
  for (let date = new Date(`${start}T12:00:00Z`); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) dates.push(date.toISOString().slice(0, 10));
  return dates;
};

try {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const account = await db.collection('employee_accounts').findOne({ email: 'employee@gmail.com', otpBypass: true });
  if (!account || account.employeeId !== 'EMP-OTP-001') throw new Error('Expected the newly created employee account. Refusing to modify another employee.');
  let employee = await db.collection('employees').findOne({ id: account.employeeId, email: account.email });
  if (!employee) throw new Error('Employee profile not found');
  const settings = await getSettings(db);
  const scheduled = date => settings.shift.scheduleOverrides.find(entry => entry.date === date)?.working
    ?? settings.shift.workWeekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
  const existingAttendance = await db.collection('attendance').find({ employeeId: employee.id }).toArray();
  const existingLeave = await db.collection('leave_requests').find({ employeeId: employee.id }).toArray();
  const payroll = await db.collection('payroll_requests').find({ employeeId: employee.id }).toArray();
  const eligible = date => scheduled(date)
    && !payroll.some(record => (['paid', 'approved'].includes(record.status) || record.paidAt || record.settledBy) && payrollCoversDate(record, date))
    && !existingLeave.some(record => record.seedTag !== tag && ['pending', 'approved'].includes(record.status) && (record.requestedDates?.includes(date) || (!record.requestedDates?.length && record.startDate <= date && record.endDate >= date)))
    && !existingAttendance.some(record => record.date === date && record.seedTag !== tag && (!record.automaticAbsence || hasRecordedWork(record)));
  const dates = dayKeys('2026-09-21', '2026-10-06').filter(eligible);
  const future = dayKeys('2026-10-08', '2026-10-20').filter(eligible).filter((_, index) => index % 2 === 0).slice(0, 3);
  if (!dates.length) throw new Error('No eligible sample dates; existing records were preserved.');
  const approvedDate = dates.at(-1);
  const now = new Date();
  let insertedAttendance = 0;
  await payrollTransaction(db, async tx => {
    const profile = await tx.collection('employees').updateOne({ id: employee.id, hourlyRate: 0 }, { $set: { hourlyRate: 100, updatedAt: now } });
    if (profile.modifiedCount) employee = { ...employee, hourlyRate: 100 };
    for (const [index, date] of dates.entries()) {
      const status = date === approvedDate ? 'OnLeave' : index === 2 ? 'Absent' : 'Present';
      const working = status === 'Present';
      const checkIn = working ? index === 4 ? '07:00 AM' : '06:00 AM' : null;
      const checkOut = working ? '03:00 PM' : null;
      const sessions = working ? [{ checkIn, checkOut, checkInAt: `${date}T${index === 4 ? '07' : '06'}:00:00+08:00`, checkOutAt: `${date}T15:00:00+08:00`, captureMethod: 'sample-record' }] : [];
      const record = { employeeId: employee.id, name: employee.name, role: 'Regular', date, status, checkIn, checkOut, sessions, sessionCount: sessions.length, seedTag: tag, captureMethod: 'sample-record', note: 'Sample record for testing the employee account.', updatedAt: now };
      const old = await tx.collection('attendance').findOne({ employeeId: employee.id, date });
      if (old) {
        if (old.seedTag === tag) continue;
        if (!old.automaticAbsence || hasRecordedWork(old)) throw new Error(`Attendance changed for ${date}; seed cancelled.`);
        await tx.collection('attendance').updateOne({ _id: old._id, automaticAbsence: true, updatedAt: old.updatedAt ?? { $exists: false } }, { $set: record, $unset: { automaticAbsence: '', idleDay: '' } });
      } else await tx.collection('attendance').insertOne({ ...record, createdAt: now });
      insertedAttendance++;
    }
    for (const [suffix, selected, status] of [['APPROVED', [approvedDate], 'approved'], ['PENDING', future, 'pending']]) {
      if (!selected.length) continue;
      await tx.collection('leave_requests').updateOne({ id: `LR-OTP-${suffix}`, employeeId: employee.id }, { $setOnInsert: {
        id: `LR-OTP-${suffix}`, employeeId: employee.id, employeeName: employee.name, role: 'Regular', initials: 'TE',
        leaveType: suffix === 'APPROVED' ? 'Sick Leave' : 'Personal Leave', startDate: selected[0], endDate: selected.at(-1),
        requestedDates: selected, approvedDates: status === 'approved' ? selected : [], totalDays: selected.length,
        reason: 'Sample leave request for testing this employee account.', status, seedTag: tag,
        createdAt: new Date(`${today}T09:00:00+08:00`), ...(status === 'approved' ? { reviewedAt: now } : {}),
      } }, { upsert: true });
    }
  });
  for (const periodStart of ['2026-09-16', '2026-10-01']) {
    const result = await preparePayrollRecord(db, employee, periodStart, settings);
    if (result.created) await db.collection('payroll_requests').updateOne({ id: result.record.id }, { $set: { seedTag: tag } });
  }
  const counts = await Promise.all(['attendance', 'leave_requests', 'payroll_requests'].map(async name => ({ collection: name, records: await db.collection(name).countDocuments({ employeeId: employee.id }) })));
  console.log(JSON.stringify({ employee: account.email, employeeId: employee.id, newAttendanceRecords: insertedAttendance, counts, payrollPaid: false }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
