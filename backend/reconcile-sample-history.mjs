// Reconcile the existing 30 sample employees from July 1 through September 30, 2026.
// Dry run by default. Pass --apply to write after reviewing the reported scope.
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
const apply = process.argv.includes('--apply');
const sampleTag = 'workpulse-demo-workforce-v1'; // Internal legacy marker; never shown to users.
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const first = '2026-07-01';
const lastCompleted = '2026-09-30';
const weekdays = [0, 1, 2, 3, 4, 5, 6];
const allDates = [];
for (let day = new Date(`${first}T00:00:00Z`); day.toISOString().slice(0, 10) <= lastCompleted; day.setUTCDate(day.getUTCDate() + 1)) allDates.push(day.toISOString().slice(0, 10));
const periodStart = date => `${date.slice(0, 8)}${Number(date.slice(8)) <= 15 ? '01' : '16'}`;
const neutralLabel = value => String(value).replace(/^demo\s+/i, '').replace(/^test\s+/i, '');
const key = (id, date) => `${id}|${date}`;

try {
  await client.connect();
  const db = client.db();
  const employees = await db.collection('employees').find({ seedTag: sampleTag, archived: { $ne: true } }).toArray();
  if (employees.length !== 30) throw new Error(`Expected 30 existing sample employees; found ${employees.length}. No changes made.`);
  const ids = employees.map(employee => employee.id);
  const [setting, attendance, payroll, leave, idleDays] = await Promise.all([
    db.collection('settings').findOne({ key: 'company' }),
    db.collection('attendance').find({ employeeId: { $in: ids }, date: { $gte: first, $lte: lastCompleted } }).toArray(),
    db.collection('payroll_requests').find({ employeeId: { $in: ids }, periodStart: { $gte: first, $lte: lastCompleted } }).toArray(),
    db.collection('leave_requests').find({ employeeId: { $in: ids }, status: 'approved', startDate: { $lte: lastCompleted }, endDate: { $gte: first } }).toArray(),
    db.collection('idle_days').find({ date: { $gte: first, $lte: lastCompleted } }).toArray(),
  ]);
  if (!setting) throw new Error('Company settings not found. No changes made.');
  const overrides = new Map((setting.shift?.scheduleOverrides || []).map(item => [item.date, item]));
  const idle = new Set(idleDays.map(item => item.date));
  const attendanceByKey = new Map(attendance.map(item => [key(item.employeeId, item.date), item]));
  const paidPeriods = new Set(payroll.filter(item => ['paid', 'approved'].includes(item.status)).map(item => key(item.employeeId, item.periodStart)));
  const leaveDates = new Set();
  for (const request of leave) for (const date of request.approvedDates || []) leaveDates.add(key(request.employeeId, date));
  const inserts = [];
  const replacements = [];
  const payrollLabels = [];
  const affectedPeriods = new Set();
  let skippedPaidPeriods = 0;
  const now = new Date();
  for (const employee of employees) for (const date of allDates) {
    if (employee.createdAt && new Date(employee.createdAt).toISOString().slice(0, 10) > date) continue;
    const override = overrides.get(date);
    if (override?.working === false || idle.has(date) || leaveDates.has(key(employee.id, date))) continue;
    const existing = attendanceByKey.get(key(employee.id, date));
    if (existing && !existing.automaticAbsence) continue;
    const period = periodStart(date);
    if (paidPeriods.has(key(employee.id, period))) { skippedPaidPeriods++; continue; }
    // Existing July/August paid history stays as recorded. Fill uncovered days
    // with absence, since no scan exists to support paid hours.
    const september = date.startsWith('2026-09');
    const ordinal = Number(date.slice(8));
    const employeeNumber = ids.indexOf(employee.id);
    const present = september && (employeeNumber * 7 + ordinal * 3) % 13 !== 0;
    const minutes = (employeeNumber * 3 + ordinal * 2) % 12;
    const checkIn = `06:${String(minutes).padStart(2, '0')} AM`;
    const checkOut = `${(employeeNumber + ordinal) % 9 === 0 ? '06' : '05'}:${String((employeeNumber + ordinal) % 9 === 0 ? '30' : '00')} PM`;
    const session = { checkIn, checkOut, workStartTime: '06:00', workStopTime: '18:00', overtimeStopTime: '19:00' };
    const record = { employeeId: employee.id, name: employee.name, role: String(employee.role || 'regular').replace(/^./, letter => letter.toUpperCase()), date, checkIn: present ? checkIn : null, checkOut: present ? checkOut : null, sessions: present ? [session] : [], sessionCount: present ? 1 : 0, status: present ? 'Present' : 'Absent', source: 'historical-sample-reconciliation', seedTag: sampleTag, createdAt: now, updatedAt: now };
    if (existing) replacements.push({ existing, record });
    else inserts.push(record);
    affectedPeriods.add(key(employee.id, period));
  }
  for (const record of payroll) {
    const additions = (record.additions || []).map(item => ({ ...item, label: neutralLabel(item.label) }));
    const quarterlyAdditions = (record.quarterlyAdditions || []).map(item => ({ ...item, label: neutralLabel(item.label) }));
    const carriedQuarterlyAdditions = (record.carriedQuarterlyAdditions || []).map(item => ({ ...item, label: neutralLabel(item.label) }));
    if (JSON.stringify(additions) !== JSON.stringify(record.additions || []) || JSON.stringify(quarterlyAdditions) !== JSON.stringify(record.quarterlyAdditions || []) || JSON.stringify(carriedQuarterlyAdditions) !== JSON.stringify(record.carriedQuarterlyAdditions || [])) payrollLabels.push({ _id: record._id, additions, quarterlyAdditions, carriedQuarterlyAdditions });
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', sampleEmployees: employees.length, dateRange: `${first} through ${lastCompleted}`, existingAttendance: attendance.length, existingPayroll: payroll.length, existingApprovedLeave: leave.length, newAttendance: inserts.length, automaticAbsencesReplaced: replacements.length, paidPeriodDatesSkipped: skippedPaidPeriods, payrollPeriodsToRecalculate: affectedPeriods.size, payrollLabelsToNeutralize: payrollLabels.length, savedShift: { start: setting.shift?.startTime, stop: setting.shift?.workStopTime, overtimeStop: setting.shift?.autoClockOutTime, workDays: setting.shift?.workDays }, schedule: 'Sunday through Saturday, with existing holiday/rest-day exceptions' }, null, 2));
  if (!apply) process.exitCode = 0;
  else {
    await db.collection('settings').updateOne({ _id: setting._id }, { $set: { 'shift.workDays': 7, 'shift.workWeekdays': weekdays, 'shift.startTime': '06:00', 'shift.workStopTime': '18:00', 'shift.autoClockOutTime': '19:00' } });
    await db.collection('attendance').updateMany({ employeeId: { $in: ids }, source: 'historical-sample-reconciliation', 'sessions.0': { $exists: true } }, { $set: { 'sessions.$[].overtimeStopTime': '19:00' } });
    if (inserts.length) await db.collection('attendance').insertMany(inserts, { ordered: false });
    if (replacements.length) await db.collection('attendance').bulkWrite(replacements.map(({ existing, record }) => ({ replaceOne: { filter: { _id: existing._id, automaticAbsence: true }, replacement: { _id: existing._id, ...record } } })), { ordered: false });
    if (payrollLabels.length) await db.collection('payroll_requests').bulkWrite(payrollLabels.map(({ _id, ...fields }) => ({ updateOne: { filter: { _id }, update: { $set: fields } } })), { ordered: false });
    const { getSettings, preparePayrollRecord } = await import('./src/routes/api.js');
    const settings = await getSettings(db);
    let recalculated = 0;
    for (const employee of employees) for (const period of ['2026-07-01', '2026-07-16', '2026-08-01', '2026-08-16', '2026-09-01', '2026-09-16', '2026-10-01']) {
      if (!affectedPeriods.has(key(employee.id, period)) && period !== '2026-10-01') continue;
      const existing = await db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart: period });
      if (existing && !['processing', 'rejected', 'carried_over'].includes(existing.status)) continue;
      if (!existing && period !== '2026-10-01') continue;
      await preparePayrollRecord(db, employee, period, settings);
      recalculated++;
    }
    console.log(JSON.stringify({ completed: true, recalculatedPayrollRecords: recalculated }));
  }
} finally {
  await client.close();
}
