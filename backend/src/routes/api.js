import { Router } from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { buildAIInsights } from '../ai-insights.js';
import { verifyAdminPassword, verifySecret } from './auth.js';
import { auditEvent, authenticate, csrfProtection, pick, requireRole } from '../security.js';
import {
  BiometricError,
  encryptFingerprintSamples,
  findFingerprintDecision,
  findFingerprintMatch,
  normalizeFingerprintSamples,
  rejectDuplicateEnrollment,
  validateEnrollmentSamples,
} from '../biometrics.js';

const router = Router();
const MAX_DAILY_ATTENDANCE_SESSIONS = 3;

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
    const [attendance, leaveRequests, payroll, biometricTemplate] = await Promise.all([
      db.collection('attendance').find({ employeeId }).sort({ date: -1 }).limit(60).toArray(),
      db.collection('leave_requests').find({ employeeId }).sort({ createdAt: -1, _id: -1 }).toArray(),
      db.collection('payroll_requests').find({ employeeId }).sort({ createdAt: -1, _id: -1 }).limit(12).toArray(),
      db.collection('biometric_templates').findOne({ employeeId }, { projection: { _id: 1 } }),
    ]);
    res.json({
      profile: { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone, address: employee.address, role: employee.role, status: employee.status, biometricStatus: biometricTemplate ? 'enrolled' : 'none', casualLeave: employee.casualLeave, sickLeave: employee.sickLeave, hourlyRate: employee.hourlyRate, grossSalary: employee.grossSalary, createdAt: employee.createdAt },
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

router.get('/ai-insights', async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    const [attendance, employees, leaveRequests, verificationAttempts] = await Promise.all([
      db.collection('attendance').find({}).sort({ date: 1 }).toArray(),
      db.collection('employees').find({ archived: { $ne: true } }).toArray(),
      db.collection('leave_requests').find({ status: 'approved' }).toArray(),
      db.collection('biometric_verification_attempts').find({}).sort({ createdAt: -1 }).limit(500).toArray(),
    ]);
    res.json(buildAIInsights({ attendance, employees, leaveRequests, verificationAttempts }));
  } catch (error) {
    console.error('AI insights generation failed:', error);
    res.status(500).json({ error: 'Unable to generate AI insights right now.' });
  }
});

const employeeFields = ['id', 'firstName', 'lastName', 'name', 'role', 'casualLeave', 'sickLeave', 'status', 'grossSalary', 'hoursWorked', 'hourlyRate', 'email', 'phone', 'address', 'identifiers'];

router.get('/audit-events', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ error: 'Database is unavailable' });
    const requestedLimit = Number.parseInt(String(req.query.limit ?? '20'), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 20;
    const events = await db.collection('audit_events').find({}).sort({ occurredAt: -1, _id: -1 }).limit(limit).toArray();
    res.json(events.map((event) => ({
      id: String(event._id),
      occurredAt: event.occurredAt,
      actorEmail: event.actorEmail ?? null,
      actorRole: event.actorRole ?? 'anonymous',
      action: event.action ?? 'unknown',
      targetType: event.targetType ?? 'system',
      targetId: event.targetId ?? null,
      outcome: event.outcome ?? 'unknown',
    })));
  } catch (error) {
    console.error('Audit event fetch failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

function normalizedEmployee(input) {
  const employee = pick(input ?? {}, employeeFields);
  employee.id = String(employee.id ?? '').trim().slice(0, 40);
  employee.firstName = String(employee.firstName ?? '').trim().slice(0, 60);
  employee.lastName = String(employee.lastName ?? '').trim().slice(0, 60);
  employee.name = `${employee.firstName} ${employee.lastName}`.trim() || String(employee.name ?? '').trim().slice(0, 120);
  employee.role = ['regular', 'extra'].includes(employee.role) ? employee.role : 'regular';
  employee.status = ['active', 'on-leave', 'inactive'].includes(employee.status) ? employee.status : 'active';
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

function attendanceSessions(record) {
  if (Array.isArray(record?.sessions) && record.sessions.length) {
    return record.sessions.slice(0, MAX_DAILY_ATTENDANCE_SESSIONS).map((session) => ({
      ...session,
      checkIn: String(session?.checkIn ?? ''),
      checkOut: session?.checkOut ? String(session.checkOut) : null,
    })).filter((session) => session.checkIn);
  }
  return record?.checkIn ? [{ checkIn: String(record.checkIn), checkOut: record.checkOut ? String(record.checkOut) : null }] : [];
}

function attendanceHoursForRecord(record, settings) {
  const rawHours = attendanceSessions(record).reduce((total, session) => {
    const checkIn = parseAttendanceTime(record.date, session.checkIn);
    const checkOut = parseAttendanceTime(record.date, session.checkOut);
    if (!checkIn || !checkOut) return total;
    return total + Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3600000);
  }, 0);
  const maxHours = settings.shift.enabled ? Number(settings.shift.maxHours) : Infinity;
  const breakHours = settings.shift.enabled ? Number(settings.shift.breakMinutes || 0) / 60 : 0;
  return Math.max(0, Math.min(rawHours, maxHours) - breakHours);
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
  const openRecords = await db.collection('attendance').find({ $or: [
    { sessions: { $elemMatch: { $or: [{ checkOut: null }, { checkOut: '' }, { checkOut: { $exists: false } }] } } },
    { sessions: { $exists: false }, checkOut: null },
    { sessions: { $exists: false }, checkOut: '' },
    { sessions: { $exists: false }, checkOut: { $exists: false } },
  ] }).toArray();
  const now = new Date();
  await Promise.all(openRecords.map(async (record) => {
    const sessions = attendanceSessions(record);
    const openSessionIndex = sessions.findLastIndex((session) => !session.checkOut);
    if (openSessionIndex < 0) return;
    const checkIn = parseAttendanceTime(record.date, sessions[openSessionIndex].checkIn);
    if (!checkIn) return;
    const automaticOut = new Date(checkIn.getTime() + Number(settings.shift.maxHours) * 60 * 60 * 1000);
    if (automaticOut > now) return;
    const automaticOutTime = formatAttendanceTime(automaticOut);
    sessions[openSessionIndex] = { ...sessions[openSessionIndex], checkOut: automaticOutTime, autoClockedOut: true };
    await db.collection('attendance').updateOne({ _id: record._id }, { $set: { sessions, checkOut: automaticOutTime, autoClockedOut: true, sessionCount: sessions.length, updatedAt: now } });
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
    const [attendance, biometricTemplates] = await Promise.all([
      db.collection('attendance').find({}).toArray(),
      db.collection('biometric_templates').find({}, { projection: { employeeId: 1 } }).toArray(),
    ]);
    const enrolledEmployeeIds = new Set(biometricTemplates.map((template) => template.employeeId));

    res.json(
      employees.map((e) => {
        const records = attendance.filter((record) => record.employeeId === e.id && new Date(record.date) >= periodStart);
        const hoursWorked = records.reduce((total, record) => total + attendanceHoursForRecord(record, settings), 0);
        const hourlyRate = e.role === 'extra' ? 40 : 50;
        const calculatedGross = Math.round(hoursWorked * hourlyRate * 100) / 100;
        return ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        name: e.name,
        role: e.role,
        grossSalary: records.length ? calculatedGross : Number(e.grossSalary ?? 0),
        hoursWorked: records.length ? Math.round(hoursWorked * 100) / 100 : Math.round(Number(e.hoursWorked || 0) * 100) / 100,
        hourlyRate,
        payrollPeriodDays: 15,
        status: e.status,
        casualLeave: e.casualLeave ?? { total: 10, used: 0 },
        sickLeave: e.sickLeave ?? { total: 10, used: 0 },
        biometricStatus: enrolledEmployeeIds.has(e.id) ? 'enrolled' : 'none',
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
    const fingerprintSamples = normalizeFingerprintSamples(req.body?.fingerprintSamples, 3);
    const deviceUid = String(req.body?.fingerprintDeviceUid ?? '').trim().slice(0, 200);
    const enrollment = await validateEnrollmentSamples(fingerprintSamples);
    const employee = normalizedEmployee(req.body);
    if (!employee.firstName || !employee.lastName) return res.status(400).json({ error: 'First name and last name are required' });
    if (!employee.email || !employee.phone || !employee.address) return res.status(400).json({ error: 'Email, phone number, and address are required' });
    if (!/^\+639\d{9}$/.test(employee.phone)) return res.status(400).json({ error: 'Phone number must use +639XXXXXXXXX with no spaces' });
    const db = mongoose.connection.db;
    employee.id = await nextEmployeeId(db);
    await rejectDuplicateEnrollment(db, employee.id, enrollment.templates);
    const createdAt = new Date();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('employees').insertOne({ ...employee, biometricStatus: 'enrolled', createdAt, updatedAt: createdAt }, { session });
        await db.collection('biometric_templates').insertOne({
          employeeId: employee.id,
          protectedSamples: encryptFingerprintSamples(enrollment.templates),
          sampleFormat: 'ansi-378-fmd', sampleCount: enrollment.templates.length,
          matcher: 'HID FingerJet', matcherFormat: enrollment.format, deviceUid: deviceUid || null,
          enrolledAt: createdAt, enrolledBy: req.auth.actor.email, version: 2,
        }, { session });
      });
    } finally { await session.endSession(); }
    res.status(201).json({ ...employee, biometricStatus: 'enrolled', createdAt });
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    if (error?.code === 11000) return res.status(409).json({ error: 'Employee ID or fingerprint enrollment already exists' });
    console.error('Employee creation failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.put('/employees/:id', async (req, res) => {
  try {
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
    employee.biometricStatus = existing.biometricStatus ?? 'none';
    const result = await mongoose.connection.db.collection('employees').updateOne({ id: req.params.id }, { $set: { ...employee, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Employee not found' });
    res.json({ ...employee, createdAt: existing.createdAt });
  } catch { res.status(500).json({ error: 'Failed to update employee' }); }
});

router.put('/employees/:id/fingerprint', async (req, res) => {
  try {
    const verification = await verifyAdminPassword(req, req.body?.adminPassword);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      const status = verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401;
      return res.status(status).json({ error: verification.forbidden ? 'Administrator access required' : 'Incorrect admin password', ...(verification.retryAfterSeconds ? { retryAfterSeconds: verification.retryAfterSeconds } : {}) });
    }
    const db = mongoose.connection.db;
    const employee = await db.collection('employees').findOne({ id: req.params.id, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const fingerprintSamples = normalizeFingerprintSamples(req.body?.fingerprintSamples, 3);
    const deviceUid = String(req.body?.fingerprintDeviceUid ?? '').trim().slice(0, 200);
    const enrollment = await validateEnrollmentSamples(fingerprintSamples);
    await rejectDuplicateEnrollment(db, employee.id, enrollment.templates);
    const now = new Date();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('biometric_templates').updateOne({ employeeId: employee.id }, { $set: {
          protectedSamples: encryptFingerprintSamples(enrollment.templates),
          sampleFormat: 'ansi-378-fmd', sampleCount: enrollment.templates.length,
          matcher: 'HID FingerJet', matcherFormat: enrollment.format, deviceUid: deviceUid || null,
          enrolledAt: now, enrolledBy: req.auth.actor.email, version: 2,
        } }, { upsert: true, session });
        await db.collection('employees').updateOne({ id: employee.id }, { $set: { biometricStatus: 'enrolled', updatedAt: now } }, { session });
      });
    } finally { await session.endSession(); }
    res.json({ employeeId: employee.id, biometricStatus: 'enrolled', enrolledAt: now });
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    console.error('Fingerprint registration failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to register fingerprint' });
  }
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
    const db = mongoose.connection.db;
    const result = await db.collection('employees').findOneAndUpdate({ id: req.params.id, archived: { $ne: true } }, { $set: { archived: true, status: 'inactive', biometricStatus: 'none', archivedAt: new Date(), updatedAt: new Date() } }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ error: 'Employee not found or already archived' });
    await db.collection('biometric_templates').deleteOne({ employeeId: req.params.id });
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
    const hoursWorked = periodRecords.reduce((total, record) => total + attendanceHoursForRecord(record, settings), 0);
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
        sessions: attendanceSessions(a),
        sessionCount: attendanceSessions(a).length,
        status: a.status,
        autoClockedOut: a.autoClockedOut ?? false,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

function kioskTimestamp() {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    now,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(now),
    minuteOfDay: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

router.post('/attendance/kiosk', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).json({ error: 'MongoDB connection not ready' });
    const [probe] = normalizeFingerprintSamples(req.body?.fingerprintSamples, 1);
    const deviceUid = String(req.body?.deviceUid ?? '').trim().slice(0, 200);
    const templates = await db.collection('biometric_templates').find({}).toArray();
    const matchStartedAt = Date.now();
    const decision = await findFingerprintDecision(probe, templates);
    const matched = decision.accepted ? decision.best : null;
    const attemptTime = new Date();
    try {
      await db.collection('biometric_verification_attempts').insertOne({
        mode: 'one-to-many', accepted: decision.accepted,
        employeeId: matched?.employeeId || null, score: decision.best?.score ?? null,
        threshold: decision.threshold, deviceUid: deviceUid || null,
        responseTimeMs: Date.now() - matchStartedAt, createdAt: attemptTime,
      });
    } catch (attemptError) {
      console.error('Fingerprint verification attempt could not be logged:', attemptError instanceof Error ? attemptError.message : attemptError);
    }
    if (!matched) return res.status(404).json({ error: 'Fingerprint not recognized. Ask an administrator to register it again.' });
    const employeeId = matched.employeeId;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true }, status: { $ne: 'inactive' } });
    if (!employee) return res.status(404).json({ error: 'Active employee not found' });

    const stamp = kioskTimestamp();
    const existing = await db.collection('attendance').findOne({ employeeId, date: stamp.date });
    if (!existing) {
      const settings = await getSettings(db);
      const shiftMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(settings.shift.startTime ?? ''));
      const lateAfterMinute = settings.shift.enabled && shiftMatch
        ? Number(shiftMatch[1]) * 60 + Number(shiftMatch[2]) + Number(settings.lateness.graceMinutes || 0)
        : null;
      const record = {
        employeeId, name: employee.name, role: employee.role === 'extra' ? 'Extra' : 'Regular',
        date: stamp.date, checkIn: stamp.time, checkOut: null,
        sessions: [{ checkIn: stamp.time, checkOut: null, checkInAt: stamp.now, deviceUid: deviceUid || null, matchScore: matched.score }],
        sessionCount: 1, lastAction: 'time-in',
        status: lateAfterMinute !== null && stamp.minuteOfDay > lateAfterMinute ? 'Late' : 'Present',
        captureMethod: 'digitalpersona-fingerjet', deviceUid: deviceUid || null,
        identityVerified: true, matchScore: matched.score, matcherFormat: matched.format,
        createdAt: stamp.now, updatedAt: stamp.now,
      };
      try { await db.collection('attendance').insertOne(record); }
      catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: 'Attendance was already recorded for this employee today' });
        throw error;
      }
      return res.status(201).json({ action: 'time-in', record: { ...record, eventTime: stamp.time, _id: undefined } });
    }

    const lastAttendanceUpdate = new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime();
    const duplicateScanWindowMs = 30_000;
    const elapsedSinceTimeIn = stamp.now.getTime() - lastAttendanceUpdate;
    if (Number.isFinite(lastAttendanceUpdate) && elapsedSinceTimeIn >= 0 && elapsedSinceTimeIn < duplicateScanWindowMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((duplicateScanWindowMs - elapsedSinceTimeIn) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: 'Attendance was just recorded. Remove your finger before the next scan.', retryAfterSeconds });
    }

    const sessions = attendanceSessions(existing);
    const lastSession = sessions.at(-1);
    const versionFilter = { _id: existing._id, ...(existing.updatedAt ? { updatedAt: existing.updatedAt } : {}) };
    let action;
    let update;
    if (lastSession && !lastSession.checkOut) {
      sessions[sessions.length - 1] = {
        ...lastSession, checkOut: stamp.time, checkOutAt: stamp.now,
        checkoutDeviceUid: deviceUid || null, checkoutMatchScore: matched.score,
      };
      action = 'time-out';
      update = {
        sessions, sessionCount: sessions.length, checkOut: stamp.time, lastAction: action, updatedAt: stamp.now,
        checkoutCaptureMethod: 'digitalpersona-fingerjet', checkoutDeviceUid: deviceUid || null,
        checkoutIdentityVerified: true, checkoutMatchScore: matched.score,
      };
    } else {
      if (sessions.length >= MAX_DAILY_ATTENDANCE_SESSIONS) {
        return res.status(409).json({ error: 'Daily attendance limit reached: three time-in/time-out sessions are already complete.' });
      }
      sessions.push({ checkIn: stamp.time, checkOut: null, checkInAt: stamp.now, deviceUid: deviceUid || null, matchScore: matched.score });
      action = 'time-in';
      update = {
        sessions, sessionCount: sessions.length, checkOut: null, lastAction: action, updatedAt: stamp.now,
        lastCheckIn: stamp.time, deviceUid: deviceUid || null, matchScore: matched.score,
      };
    }

    const updated = await db.collection('attendance').findOneAndUpdate(versionFilter, { $set: update }, { returnDocument: 'after' });
    if (!updated) return res.status(409).json({ error: 'Attendance was updated by another request' });
    return res.json({ action, record: { ...updated, eventTime: stamp.time, _id: undefined } });
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    console.error('Kiosk attendance failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to record kiosk attendance' });
  }
});

export default router;


