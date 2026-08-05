import { Router } from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { verifyAdminPassword, verifySecret } from './auth.js';
import { auditEvent, authenticate, csrfProtection, pick, requireRole } from '../security.js';

const router = Router();

router.use(authenticate, csrfProtection);
router.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    void auditEvent({
      req,
      actor: req.auth?.actor,
      action: `api.${req.method.toLowerCase()}`,
      targetType: req.path.split('/').filter(Boolean)[0] ?? 'api',
      targetId: req.params?.id ?? req.params?.employeeId ?? null,
      outcome: res.statusCode < 400 ? 'success' : 'failure',
      metadata: { path: req.path, statusCode: res.statusCode },
    });
  });
  next();
});

router.get('/employee/me', requireRole('regular', 'extra'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const employeeId = req.auth.actor.employeeId;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee profile not found' });
    const [attendance, leaveRequests, payroll] = await Promise.all([
      db.collection('attendance').find({ employeeId }).sort({ date: -1 }).limit(60).toArray(),
      db.collection('leave_requests').find({ employeeId }).sort({ createdAt: -1, _id: -1 }).toArray(),
      db.collection('payroll_requests').find({ employeeId }).sort({ createdAt: -1, _id: -1 }).limit(12).toArray(),
    ]);
    res.json({
      profile: { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone, address: employee.address, role: employee.role, status: employee.status, biometricStatus: employee.biometricStatus, casualLeave: employee.casualLeave, sickLeave: employee.sickLeave, hourlyRate: employee.hourlyRate, grossSalary: employee.grossSalary, createdAt: employee.createdAt },
      attendance: attendance.map(({ _id, ...record }) => record),
      leaveRequests: leaveRequests.map(({ _id, ...record }) => record),
      payroll: payroll.map(({ _id, ...record }) => ({ id: record.id, amount: record.amount, currentAmount: record.currentAmount, carryOverAmount: record.carryOverAmount, status: record.status, periodStart: record.periodStart, createdAt: record.createdAt })),
    });
  } catch { res.status(500).json({ error: 'Unable to load employee workspace' }); }
});

router.post('/employee/me/leave-requests', requireRole('regular', 'extra'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const employeeId = req.auth.actor.employeeId;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true }, status: { $ne: 'inactive' } });
    if (!employee) return res.status(404).json({ error: 'Active employee profile not found' });
    const leaveType = String(req.body?.leaveType ?? '');
    const startDate = String(req.body?.startDate ?? '');
    const endDate = String(req.body?.endDate ?? '');
    const reason = String(req.body?.reason ?? '').trim();
    if (!['Annual Leave', 'Sick Leave', 'Personal Leave', 'Maternity Leave'].includes(leaveType)) return res.status(400).json({ error: 'Select a valid leave type' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return res.status(400).json({ error: 'Enter valid leave dates' });
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (!Number.isFinite(totalDays) || totalDays < 1 || totalDays > 60) return res.status(400).json({ error: 'Leave must be between 1 and 60 days' });
    if (reason.length < 5 || reason.length > 500) return res.status(400).json({ error: 'Provide a reason between 5 and 500 characters' });
    const overlap = await db.collection('leave_requests').findOne({ employeeId, status: 'pending', startDate: { $lte: endDate }, endDate: { $gte: startDate } });
    if (overlap) return res.status(409).json({ error: 'A pending leave request already overlaps these dates' });
    const id = `LR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const initials = employee.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const request = { id, employeeId, employeeName: employee.name, role: employee.role === 'extra' ? 'Extra' : 'Regular', leaveType, startDate, endDate, totalDays, reason, status: 'pending', initials, createdAt: new Date() };
    await db.collection('leave_requests').insertOne(request);
    res.status(201).json({ ...request, _id: undefined });
  } catch { res.status(500).json({ error: 'Unable to submit leave request' }); }
});

router.use(requireRole('admin'));

const employeeFields = ['id', 'firstName', 'lastName', 'name', 'role', 'casualLeave', 'sickLeave', 'biometricStatus', 'status', 'grossSalary', 'hoursWorked', 'hourlyRate', 'email', 'phone', 'address', 'identifiers'];

function normalizedEmployee(input) {
  const employee = pick(input ?? {}, employeeFields);
  employee.id = String(employee.id ?? '').trim().slice(0, 40);
  employee.firstName = String(employee.firstName ?? '').trim().slice(0, 60);
  employee.lastName = String(employee.lastName ?? '').trim().slice(0, 60);
  employee.name = `${employee.firstName} ${employee.lastName}`.trim() || String(employee.name ?? '').trim().slice(0, 120);
  employee.role = ['regular', 'extra'].includes(employee.role) ? employee.role : 'regular';
  employee.status = ['active', 'on-leave', 'inactive'].includes(employee.status) ? employee.status : 'active';
  employee.biometricStatus = ['enrolled', 'pending', 'none'].includes(employee.biometricStatus) ? employee.biometricStatus : 'none';
  if (employee.email != null) employee.email = String(employee.email).trim().toLowerCase().slice(0, 254);
  if (employee.phone != null) employee.phone = String(employee.phone).trim().slice(0, 30);
  if (employee.address != null) employee.address = String(employee.address).trim().slice(0, 300);
  employee.grossSalary = Math.max(0, Number(employee.grossSalary || 0));
  employee.hoursWorked = Math.max(0, Number(employee.hoursWorked || 0));
  employee.hourlyRate = Math.max(0, Number(employee.hourlyRate || 0));
  employee.identifiers = Array.isArray(employee.identifiers) ? employee.identifiers.slice(0, 20).map((item) => ({ type: String(item?.type ?? '').slice(0, 50), value: String(item?.value ?? '').slice(0, 100), amount: Math.max(0, Number(item?.amount || 0)) })) : [];
  const leaveBalance = (value) => ({ used: Math.max(0, Number(value?.used || 0)), total: Math.max(0, Number(value?.total || 0)) });
  employee.casualLeave = leaveBalance(employee.casualLeave);
  employee.sickLeave = leaveBalance(employee.sickLeave);
  return employee;
}

async function nextEmployeeId(db) {
  const records = await db.collection('employees').find({}, { projection: { id: 1 } }).toArray();
  const highest = records.reduce((maximum, record) => {
    const match = /^EMP-(\d+)$/i.exec(String(record.id ?? ''));
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `EMP-${String(highest + 1).padStart(3, '0')}`;
}

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
    const numberInRange = (value, fallback, minimum, maximum) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
    };
    const normalized = {
      shift: { enabled: Boolean(incoming.shift?.enabled), startTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(incoming.shift?.startTime) ? incoming.shift.startTime : defaultSettings.shift.startTime, maxHours: numberInRange(incoming.shift?.maxHours, 8, 1, 24), breakMinutes: numberInRange(incoming.shift?.breakMinutes, 60, 0, 240), workDays: numberInRange(incoming.shift?.workDays, 5, 1, 7) },
      lateness: { enabled: Boolean(incoming.lateness?.enabled), graceMinutes: numberInRange(incoming.lateness?.graceMinutes, 15, 0, 240), lateThresholdMinutes: numberInRange(incoming.lateness?.lateThresholdMinutes, 30, 0, 480), penaltyRate: numberInRange(incoming.lateness?.penaltyRate, 1, 0, 100) },
      leave: { enabled: Boolean(incoming.leave?.enabled), casualDays: numberInRange(incoming.leave?.casualDays, 10, 0, 365), sickDays: numberInRange(incoming.leave?.sickDays, 10, 0, 365), frequency: ['monthly', 'quarterly', 'annual'].includes(incoming.leave?.frequency) ? incoming.leave.frequency : 'monthly', carryOverDays: numberInRange(incoming.leave?.carryOverDays, 5, 0, 365) },
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
        firstName: e.firstName,
        lastName: e.lastName,
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
        createdAt: e.createdAt,
        identifiers: e.identifiers ?? [],
      });})
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

router.get('/employees-next-id', async (_req, res) => {
  try { res.json({ id: await nextEmployeeId(mongoose.connection.db) }); }
  catch { res.status(500).json({ error: 'Failed to generate the next employee ID' }); }
});

router.post('/employees', async (req, res) => {
  try {
    const employee = normalizedEmployee(req.body);
    if (!employee.firstName || !employee.lastName) return res.status(400).json({ error: 'First name and last name are required' });
    if (!employee.email || !employee.phone || !employee.address) return res.status(400).json({ error: 'Email, phone number, and address are required' });
    if (!/^\+639\d{9}$/.test(employee.phone)) return res.status(400).json({ error: 'Phone number must use +639XXXXXXXXX with no spaces' });
    const db = mongoose.connection.db;
    employee.id = await nextEmployeeId(db);
    const createdAt = new Date();
    await db.collection('employees').insertOne({ ...employee, createdAt, updatedAt: createdAt });
    res.status(201).json({ ...employee, createdAt });
  } catch { res.status(500).json({ error: 'Failed to create employee' }); }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const admin = req.auth?.actor;
    const verification = await verifyAdminPassword(req, req.body?.adminPassword);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      const status = verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401;
      const error = verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password';
      return res.status(status).json({ error, ...(verification.retryAfterSeconds ? { retryAfterSeconds: verification.retryAfterSeconds } : {}) });
    }
    const employee = normalizedEmployee(req.body);
    employee.id = req.params.id;
    if (!employee.firstName || !employee.lastName) return res.status(400).json({ error: 'First name and last name are required' });
    if (employee.phone && !/^\+639\d{9}$/.test(employee.phone)) return res.status(400).json({ error: 'Phone number must use +639XXXXXXXXX with no spaces' });
    const existing = await mongoose.connection.db.collection('employees').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Employee not found' });
    const result = await mongoose.connection.db.collection('employees').updateOne({ id: req.params.id }, { $set: { ...employee, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Employee not found' });
    res.json({ ...employee, createdAt: existing.createdAt });
  } catch { res.status(500).json({ error: 'Failed to update employee' }); }
});

async function authenticatedAdmin(req, passwordRequired = false) {
  const admin = req.auth?.actor;
  if (!admin || admin.role !== 'admin') return null;
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


