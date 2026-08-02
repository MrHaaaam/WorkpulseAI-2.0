import { Router } from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { verifySecret } from './auth.js';

const router = Router();

const defaultSettings = {
  shift: { enabled: false, startTime: '09:00', maxHours: 8, breakMinutes: 60, workDays: 5 },
  lateness: { enabled: false, graceMinutes: 15, lateThresholdMinutes: 30, penaltyRate: 1 },
  leave: { enabled: false, casualDays: 10, sickDays: 10, frequency: 'monthly', carryOverDays: 5 },
};

function parseAttendanceTime(date, time) {
  if (!date || !time) return null;
  const match = String(time).match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3]?.toUpperCase() === 'PM' && hour < 12) hour += 12;
  if (match[3]?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  const result = new Date(`${date}T00:00:00`);
  if (Number.isNaN(result.getTime())) return null;
  result.setHours(hour, Number(match[2]), 0, 0);
  return result;
}

function formatAttendanceTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export async function getSettings(db) {
  const stored = await db.collection('settings').findOne({ key: 'company' });
  return {
    shift: { ...defaultSettings.shift, ...(stored?.shift ?? {}) },
    lateness: { ...defaultSettings.lateness, ...(stored?.lateness ?? {}) },
    leave: { ...defaultSettings.leave, ...(stored?.leave ?? {}) },
  };
}

export async function enforceAutomaticClockOut(db, settings) {
  if (!settings.shift.enabled || !(Number(settings.shift.maxHours) > 0)) return;
  const openRecords = await db.collection('attendance').find({ $or: [{ checkOut: null }, { checkOut: '' }, { checkOut: { $exists: false } }] }).toArray();
  const now = new Date();
  await Promise.all(openRecords.map(async (record) => {
    const checkIn = parseAttendanceTime(record.date, record.checkIn);
    if (!checkIn) return;
    const automaticOut = new Date(checkIn.getTime() + Number(settings.shift.maxHours) * 60 * 60 * 1000);
    if (automaticOut > now) return;
    await db.collection('attendance').updateOne({ _id: record._id }, { $set: { checkOut: formatAttendanceTime(automaticOut), autoClockedOut: true, updatedAt: now } });
  }));
}

router.get('/settings', async (_req, res) => {
  try { res.json(await getSettings(mongoose.connection.db)); }
  catch { res.status(500).json({ error: 'Failed to fetch settings' }); }
});

router.put('/settings', async (req, res) => {
  try {
    const incoming = req.body ?? {};
    const normalized = {
      shift: incoming.shift?.enabled ? { ...defaultSettings.shift, ...incoming.shift, enabled: true } : { ...defaultSettings.shift, enabled: false },
      lateness: incoming.lateness?.enabled ? { ...defaultSettings.lateness, ...incoming.lateness, enabled: true } : { ...defaultSettings.lateness, enabled: false },
      leave: incoming.leave?.enabled ? { ...defaultSettings.leave, ...incoming.leave, enabled: true } : { ...defaultSettings.leave, enabled: false },
    };
    await mongoose.connection.db.collection('settings').updateOne({ key: 'company' }, { $set: { ...normalized, updatedAt: new Date() } }, { upsert: true });
    await enforceAutomaticClockOut(mongoose.connection.db, normalized);
    res.json(normalized);
  } catch { res.status(500).json({ error: 'Failed to save settings' }); }
});

// Uses the existing mongoose connection; documents are fetched directly from collections.
// This avoids needing mongoose schemas for now.

router.get('/employees', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ error: 'MongoDB connection not ready' });

    const settings = await getSettings(db);
    await enforceAutomaticClockOut(db, settings);
    const employees = await db.collection('employees').find({ archived: { $ne: true } }).toArray();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 14);
    periodStart.setHours(0, 0, 0, 0);
    const attendance = await db.collection('attendance').find({}).toArray();

    res.json(
      employees.map((e) => {
        const records = attendance.filter((record) => record.employeeId === e.id && new Date(record.date) >= periodStart);
        const maxHours = settings.shift.enabled ? Number(settings.shift.maxHours) : Infinity;
        const hoursWorked = records.reduce((total, record) => {
          const checkIn = parseAttendanceTime(record.date, record.checkIn);
          const checkOut = parseAttendanceTime(record.date, record.checkOut);
          if (!checkIn || !checkOut) return total;
          const rawHours = Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3600000);
          const breakHours = settings.shift.enabled ? Number(settings.shift.breakMinutes || 0) / 60 : 0;
          return total + Math.max(0, Math.min(rawHours, maxHours) - breakHours);
        }, 0);
        const hourlyRate = e.role === 'extra' ? 40 : 50;
        const calculatedGross = Math.round(hoursWorked * hourlyRate * 100) / 100;
        return ({
        id: e.id,
        name: e.name,
        role: e.role,
        grossSalary: records.length ? calculatedGross : Number(e.grossSalary ?? 0),
        hoursWorked: records.length ? hoursWorked : e.hoursWorked,
        hourlyRate,
        payrollPeriodDays: 15,
        status: e.status,
        casualLeave: e.casualLeave ?? { total: 10, used: 0 },
        sickLeave: e.sickLeave ?? { total: 10, used: 0 },
        biometricStatus: e.biometricStatus ?? 'none',
        email: e.email,
        phone: e.phone,
        address: e.address,
        identifiers: e.identifiers ?? [],
      });})
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

router.post('/employees', async (req, res) => {
  try {
    const employee = req.body;
    if (!employee?.id || !employee?.name) return res.status(400).json({ error: 'Employee ID and name are required' });
    const exists = await mongoose.connection.db.collection('employees').findOne({ id: employee.id });
    if (exists) return res.status(409).json({ error: 'Employee ID already exists' });
    await mongoose.connection.db.collection('employees').insertOne({ ...employee, createdAt: new Date(), updatedAt: new Date() });
    res.status(201).json(employee);
  } catch { res.status(500).json({ error: 'Failed to create employee' }); }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const employee = req.body;
    const result = await mongoose.connection.db.collection('employees').updateOne({ id: req.params.id }, { $set: { ...employee, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
  } catch { res.status(500).json({ error: 'Failed to update employee' }); }
});

async function authenticatedAdmin(req, passwordRequired = false) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const db = mongoose.connection.db;
  const tokenDigest = crypto.createHash('sha256').update(token).digest('hex');
  const session = await db.collection('admin_sessions').findOne({ tokenDigest, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const admin = await db.collection('admin_accounts').findOne({ _id: session.adminId, active: true });
  if (!admin) return null;
  if (passwordRequired && !(await verifySecret(req.body?.password ?? '', admin.passwordHash))) return null;
  return admin;
}

router.post('/employees/:id/archive', async (req, res) => {
  try {
    if (!(await authenticatedAdmin(req, true))) return res.status(401).json({ error: 'Incorrect password or expired session' });
    const result = await mongoose.connection.db.collection('employees').findOneAndUpdate({ id: req.params.id, archived: { $ne: true } }, { $set: { archived: true, status: 'inactive', archivedAt: new Date(), updatedAt: new Date() } }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ error: 'Employee not found or already archived' });
    res.json({ id: result.id, status: result.status, archived: true });
  } catch { res.status(500).json({ error: 'Failed to archive employee' }); }
});

router.get('/archived-employees', async (req, res) => {
  try {
    if (!(await authenticatedAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });
    res.json(await mongoose.connection.db.collection('employees').find({ archived: true }).sort({ archivedAt: -1 }).toArray());
  } catch { res.status(500).json({ error: 'Failed to fetch archived employees' }); }
});

router.post('/employees/:id/unarchive', async (req, res) => {
  try {
    if (!(await authenticatedAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });
    const result = await mongoose.connection.db.collection('employees').findOneAndUpdate({ id: req.params.id, archived: true }, { $set: { archived: false, status: 'active', unarchivedAt: new Date(), updatedAt: new Date() }, $unset: { archivedAt: '' } }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ error: 'Archived employee not found' });
    res.json(result);
  } catch { res.status(500).json({ error: 'Failed to restore employee' }); }
});

router.get('/payroll-requests', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ error: 'MongoDB connection not ready' });

    const payrollRequests = await db.collection('payroll_requests').find({}).sort({ createdAt: -1, _id: -1 }).toArray();

    res.json(
      payrollRequests.map((p) => ({
        id: p.id,
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        amount: p.amount,
        status: p.status,
        currentAmount: p.currentAmount,
        carryOverAmount: p.carryOverAmount,
        periodStart: p.periodStart,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payroll requests' });
  }
});

function currentPayrollPeriodStart() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() <= 15 ? 1 : 16);
  start.setHours(0, 0, 0, 0);
  return start;
}

router.post('/payroll-requests', async (req, res) => {
  try {
    const { employeeId } = req.body ?? {};
    const currentAmount = Math.max(0, Number(req.body?.currentAmount || 0));
    if (!employeeId) return res.status(400).json({ error: 'Employee ID is required' });
    const db = mongoose.connection.db;
    const employee = await db.collection('employees').findOne({ id: employeeId });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const periodStartDate = currentPayrollPeriodStart();
    const periodStart = periodStartDate.toISOString().slice(0, 10);
    const existing = await db.collection('payroll_requests').findOne({ employeeId, periodStart });
    if (existing) return res.json(existing);

    const outstanding = await db.collection('payroll_requests').find({
      employeeId,
      status: { $in: ['processing', 'rejected'] },
      rolledInto: { $exists: false },
      $or: [{ periodStart: { $lt: periodStart } }, { periodStart: { $exists: false } }],
    }).toArray();
    const carryOverAmount = outstanding.reduce((sum, payroll) => sum + Number(payroll.amount || 0), 0);
    const id = `PR-${Date.now()}-${employeeId}`;
    const payroll = { id, employeeId, employeeName: employee.name, currentAmount, carryOverAmount, amount: currentAmount + carryOverAmount, periodStart, periodDays: 15, status: 'processing', createdAt: new Date() };
    await db.collection('payroll_requests').insertOne(payroll);
    if (outstanding.length) await db.collection('payroll_requests').updateMany({ _id: { $in: outstanding.map((item) => item._id) } }, { $set: { status: 'carried_over', rolledInto: id, rolledAt: new Date() } });
    res.status(201).json(payroll);
  } catch { res.status(500).json({ error: 'Failed to process payroll' }); }
});

router.patch('/payroll-requests/:id/confirm-payment', async (req, res) => {
  try {
    const result = await mongoose.connection.db.collection('payroll_requests').findOneAndUpdate(
      { id: req.params.id, status: 'processing' },
      { $set: { status: 'paid', paidAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Processing payroll record not found' });
    res.json({ id: result.id, status: result.status });
  } catch { res.status(500).json({ error: 'Failed to confirm payment' }); }
});

router.patch('/payroll-requests/:id/reject-payment', async (req, res) => {
  try {
    const result = await mongoose.connection.db.collection('payroll_requests').findOneAndUpdate(
      { id: req.params.id, status: 'processing' },
      { $set: { status: 'rejected', rejectedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Processing payroll record not found' });
    res.json({ id: result.id, status: result.status });
  } catch { res.status(500).json({ error: 'Failed to mark payroll as not paid' }); }
});

router.post('/payroll/:employeeId/email-summary', async (req, res) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return res.status(503).json({ error: 'Email delivery is not configured' });
    const employee = await mongoose.connection.db.collection('employees').findOne({ id: req.params.employeeId });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (!employee.email) return res.status(400).json({ error: 'Add an email address to this employee profile first' });
    const settings = await getSettings(mongoose.connection.db);
    await enforceAutomaticClockOut(mongoose.connection.db, settings);
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 14);
    periodStart.setHours(0, 0, 0, 0);
    const records = await mongoose.connection.db.collection('attendance').find({ employeeId: employee.id }).toArray();
    const periodRecords = records.filter((record) => new Date(record.date) >= periodStart);
    const maxHours = settings.shift.enabled ? Number(settings.shift.maxHours) : Infinity;
    const hoursWorked = periodRecords.reduce((total, record) => {
      const checkIn = parseAttendanceTime(record.date, record.checkIn);
      const checkOut = parseAttendanceTime(record.date, record.checkOut);
      if (!checkIn || !checkOut) return total;
      const rawHours = Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3600000);
      const breakHours = settings.shift.enabled ? Number(settings.shift.breakMinutes || 0) / 60 : 0;
      return total + Math.max(0, Math.min(rawHours, maxHours) - breakHours);
    }, 0);
    const hourlyRate = employee.role === 'extra' ? 40 : 50;
    const gross = periodRecords.length ? Math.round(hoursWorked * hourlyRate * 100) / 100 : Number(employee.grossSalary ?? 0);
    const identifiers = Array.isArray(employee.identifiers) ? employee.identifiers.filter((item) => item?.type && item?.value) : [];
    const additionLines = identifiers.filter((item) => Number(item.amount) > 0).map((item) => [String(item.type), Number(item.amount)]);
    const total = additionLines.reduce((sum, item) => sum + item[1], 0);
    const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
    const identifierText = identifiers.length ? `\nProfile identifiers:\n${identifiers.map((item) => `${item.type}: ${item.value}`).join('\n')}` : '';
    const activePayroll = await mongoose.connection.db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart: currentPayrollPeriodStart().toISOString().slice(0, 10) });
    const carryOver = Number(activePayroll?.carryOverAmount || 0);
    const text = `Payroll Summary (15-day period)\nEmployee: ${employee.name}\nEmployee ID: ${employee.id}${identifierText}\nHours Worked: ${hoursWorked.toFixed(2)}\nHourly Rate: ${money(hourlyRate)}\n\nGross Salary: ${money(gross)}\n${additionLines.map(([label, value]) => `${label}: +${money(value)}`).join('\n')}\nTotal Additions: +${money(total)}\nUnpaid Balance Carried Forward: +${money(carryOver)}\nNet Salary: ${money(gross + total + carryOver)}`;
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD } });
    await transport.sendMail({ from: `Workpulse AI <${process.env.SMTP_USER}>`, to: employee.email, subject: `Payroll Summary - ${employee.name}`, text });
    res.json({ message: `Payroll summary sent to ${employee.email}` });
  } catch (error) {
    console.error('Payroll email failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to email payroll summary' });
  }
});

router.get('/leave-requests', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ error: 'MongoDB connection not ready' });

    const leaveRequests = await db.collection('leave_requests').find({}).toArray();

    res.json(
      leaveRequests.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        role: r.role,
        leaveType: r.leaveType,
        startDate: r.startDate,
        endDate: r.endDate,
        totalDays: r.totalDays,
        reason: r.reason,
        status: r.status,
        avatarUrl: undefined,
        initials: r.initials,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

router.patch('/leave-requests/:id/status', async (req, res) => {
  try {
    const status = req.body?.status;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be approved or rejected' });
    const db = mongoose.connection.db;
    const request = await db.collection('leave_requests').findOneAndUpdate({ id: req.params.id, status: 'pending' }, { $set: { status, reviewedAt: new Date() } }, { returnDocument: 'after' });
    if (!request) return res.status(404).json({ error: 'Pending leave request not found' });
    if (status === 'approved' && request.employeeId) await db.collection('employees').updateOne({ id: request.employeeId, archived: { $ne: true } }, { $set: { status: 'on-leave', updatedAt: new Date() } });
    res.json({ ...request, _id: undefined });
  } catch { res.status(500).json({ error: 'Failed to update leave request' }); }
});

// Attendance is stored in `attendance` collection.
router.get('/attendance', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ error: 'MongoDB connection not ready' });

    const settings = await getSettings(db);
    await enforceAutomaticClockOut(db, settings);
    const attendance = await db.collection('attendance').find({}).toArray();

    res.json(
      attendance.map((a) => ({
        employeeId: a.employeeId,
        name: a.name,
        role: a.role,
        date: a.date,
        checkIn: a.checkIn,
        checkOut: a.checkOut,
        status: a.status,
        autoClockedOut: a.autoClockedOut ?? false,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

export default router;


