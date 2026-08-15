import { Router } from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { buildAIInsights } from '../ai-insights.js';
import { hashSecret, verifyAdminPassword, verifySecret } from './auth.js';
import { getSystemControls, updateSystemControls } from '../system-controls.js';
import { auditEvent, authenticate, csrfProtection, pick, requireRole } from '../security.js';
import {
  BiometricError,
  encryptFingerprintSamples,
  fingerprintMatchThreshold,
  findFingerprintDecision,
  findFingerprintMatch,
  normalizeFingerprintSamples,
  rejectDuplicateEnrollment,
  validateEnrollmentSamples,
} from '../biometrics.js';

const router = Router();
const MAX_DAILY_ATTENDANCE_SESSIONS = 3;

async function visibleEmployeeIds(db) {
  const employees = await db.collection('employees').find(
    { archived: { $ne: true } },
    { projection: { id: 1 } },
  ).toArray();
  return employees.map((employee) => employee.id).filter(Boolean);
}

async function activeBiometricTemplates(db) {
  const employees = await db.collection('employees').find(
    { archived: { $ne: true }, status: { $ne: 'inactive' } },
    { projection: { id: 1 } },
  ).toArray();
  const employeeIds = employees.map((employee) => employee.id).filter(Boolean);
  if (!employeeIds.length) return [];
  return db.collection('biometric_templates').find({ employeeId: { $in: employeeIds } }).toArray();
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(14), (byte) => alphabet[byte % alphabet.length]).join('');
}

function monthKeyInManila(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}

function leaveDaysInMonth(request, monthKey) {
  const monthStart = new Date(`${monthKey}-01T00:00:00Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  monthEnd.setUTCDate(0);
  const requestStart = new Date(`${request.startDate}T00:00:00Z`);
  const requestEnd = new Date(`${request.endDate}T00:00:00Z`);
  if ([monthStart, monthEnd, requestStart, requestEnd].some((date) => Number.isNaN(date.getTime()))) return 0;
  const overlapStart = Math.max(monthStart.getTime(), requestStart.getTime());
  const overlapEnd = Math.min(monthEnd.getTime(), requestEnd.getTime());
  return overlapEnd < overlapStart ? 0 : Math.floor((overlapEnd - overlapStart) / 86400000) + 1;
}

function monthlyLeaveSummary(requests, monthlyCredits, month = monthKeyInManila()) {
  const used = requests.filter((request) => request.status === 'approved').reduce((total, request) => total + leaveDaysInMonth(request, month), 0);
  const allowance = Math.max(0, Number(monthlyCredits || 0));
  return { month, total: allowance, used, remaining: Math.max(0, allowance - used) };
}

function monthKeysForRange(startDate, endDate) {
  const start = new Date(`${String(startDate).slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${String(endDate).slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const months = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(cursor.toISOString().slice(0, 7));
  }
  return months;
}

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
router.use((req, res, next) => {
  if (req.auth?.accountType === 'employee' && req.auth.actor?.mustChangePassword === true) {
    return res.status(403).json({
      error: 'Change your temporary password before continuing.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  next();
});

router.get('/employee/me', requireRole('regular', 'extra'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const employeeId = req.auth.actor.employeeId;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee profile not found' });
    const [attendance, leaveRequests, payroll, biometricTemplate, settings] = await Promise.all([
      db.collection('attendance').find({ employeeId }).sort({ date: -1 }).limit(60).toArray(),
      db.collection('leave_requests').find({ employeeId }).sort({ createdAt: -1, _id: -1 }).toArray(),
      db.collection('payroll_requests').find({ employeeId }).sort({ createdAt: -1, _id: -1 }).limit(12).toArray(),
      db.collection('biometric_templates').findOne({ employeeId }, { projection: { _id: 1 } }),
      getSettings(db),
    ]);
    const monthlyLeaveCredits = monthlyLeaveSummary(leaveRequests, settings.leave.monthlyCredits);
    res.json({
      profile: { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone, address: employee.address, role: employee.role, status: employee.status, biometricStatus: biometricTemplate ? 'enrolled' : 'none', monthlyLeaveCredits, hourlyRate: employee.hourlyRate, grossSalary: employee.grossSalary, createdAt: employee.createdAt },
      attendance: attendance.map(({ _id, ...record }) => record),
      leaveRequests: leaveRequests.map(({ _id, ...record }) => record),
      payroll: payroll.map(({ _id, ...record }) => ({ id: record.id, amount: record.amount, currentAmount: record.currentAmount, carryOverAmount: record.carryOverAmount, status: record.status, periodStart: payrollPeriodKeyForRecord(record), createdAt: record.createdAt })),
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

router.get('/admin/system-controls', async (_req, res) => {
  try { res.json(await getSystemControls(mongoose.connection.db)); }
  catch { res.status(500).json({ error: 'Unable to load system controls' }); }
});

router.patch('/admin/system-controls', async (req, res) => {
  try {
    const changes = {};
    if (Object.hasOwn(req.body ?? {}, 'maintenanceMode')) changes.maintenanceMode = Boolean(req.body.maintenanceMode);
    if (Object.hasOwn(req.body ?? {}, 'registrationOpen')) changes.registrationOpen = Boolean(req.body.registrationOpen);
    if (!Object.keys(changes).length) return res.status(400).json({ error: 'No supported control was provided' });
    res.json(await updateSystemControls(mongoose.connection.db, changes, req.auth.actor.email));
  } catch { res.status(500).json({ error: 'Unable to update system controls' }); }
});

router.patch('/admin/employees/:id/access', async (req, res) => {
  try {
    const banned = Boolean(req.body?.banned);
    const db = mongoose.connection.db;
    const employee = await db.collection('employees').findOneAndUpdate(
      { id: req.params.id, archived: { $ne: true } },
      { $set: { banned, updatedAt: new Date() } }, { returnDocument: 'after' },
    );
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    await db.collection('employee_accounts').updateMany({ employeeId: employee.id }, { $set: { active: !banned, updatedAt: new Date() } });
    if (banned) {
      const accounts = await db.collection('employee_accounts').find({ employeeId: employee.id }, { projection: { _id: 1 } }).toArray();
      if (accounts.length) await db.collection('admin_sessions').deleteMany({ accountType: 'employee', accountId: { $in: accounts.map((account) => account._id) } });
    }
    res.json({ id: employee.id, banned });
  } catch { res.status(500).json({ error: 'Unable to update employee access' }); }
});

router.post('/admin/force-clock-out', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const stamp = kioskTimestamp();
    const openRecords = await db.collection('attendance').find({ $or: [
      { sessions: { $elemMatch: { $or: [{ checkOut: null }, { checkOut: '' }, { checkOut: { $exists: false } }] } } },
      { sessions: { $exists: false }, checkIn: { $nin: [null, ''] }, $or: [{ checkOut: null }, { checkOut: '' }, { checkOut: { $exists: false } }] },
    ] }).toArray();
    const operations = [];
    for (const record of openRecords) {
      const sessions = attendanceSessions(record);
      const openIndex = sessions.findLastIndex((session) => !session.checkOut);
      if (openIndex < 0) continue;
      sessions[openIndex] = { ...sessions[openIndex], checkOut: stamp.time, checkOutAt: stamp.now, forcedClockOut: true, forcedClockOutBy: req.auth.actor.email };
      operations.push({ updateOne: { filter: { _id: record._id }, update: { $set: { sessions, sessionCount: sessions.length, checkOut: stamp.time, lastAction: 'time-out', forcedClockOut: true, forcedClockOutAt: stamp.now, forcedClockOutBy: req.auth.actor.email, updatedAt: stamp.now } } } });
    }
    if (operations.length) await db.collection('attendance').bulkWrite(operations);
    res.json({ clockedOut: operations.length, time: stamp.time, date: stamp.date });
  } catch (error) {
    console.error('Force clock out failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to force clock out active employees' });
  }
});

router.get('/admin/backup', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collectionNames = [
      'employees', 'attendance', 'leave_requests', 'payroll_requests', 'settings', 'system_controls',
      'biometric_templates', 'biometric_verification_attempts', 'biometric_evaluation_trials',
    ];
    const collections = {};
    for (const name of collectionNames) {
      collections[name] = (await db.collection(name).find({}).toArray()).map(({ _id, ...document }) => document);
    }
    const createdAt = new Date();
    const backup = { format: 'workpulse-json-backup', version: 1, createdAt, createdBy: req.auth.actor.email, collections };
    const filename = `workpulse-backup-${createdAt.toISOString().replace(/[:.]/g, '-')}.json`;
    await auditEvent({ req, actor: req.auth.actor, action: 'admin.backup_created', targetType: 'database_backup', outcome: 'success', metadata: { collections: collectionNames, filename } });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (error) {
    console.error('Backup generation failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to generate the database backup' });
  }
});

router.get('/ai-insights', async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    const employeeIds = await visibleEmployeeIds(db);
    const employeeIdSet = new Set(employeeIds);
    const [attendance, employees, leaveRequests, verificationAttempts, evaluationTrials] = await Promise.all([
      db.collection('attendance').find({ employeeId: { $in: employeeIds } }).sort({ date: 1 }).toArray(),
      db.collection('employees').find({ id: { $in: employeeIds } }).toArray(),
      db.collection('leave_requests').find({ employeeId: { $in: employeeIds }, status: 'approved' }).toArray(),
      db.collection('biometric_verification_attempts').find({}).sort({ createdAt: -1 }).limit(500).toArray(),
      db.collection('biometric_evaluation_trials').find({}).sort({ createdAt: -1 }).limit(1000).toArray(),
    ]);
    const visibleVerificationAttempts = verificationAttempts.filter((attempt) => !attempt.employeeId || employeeIdSet.has(attempt.employeeId));
    const visibleEvaluationTrials = evaluationTrials.filter((trial) =>
      (!trial.expectedEmployeeId || employeeIdSet.has(trial.expectedEmployeeId))
      && (!trial.actualEmployeeId || employeeIdSet.has(trial.actualEmployeeId)));
    res.json(buildAIInsights({ attendance, employees, leaveRequests, verificationAttempts: visibleVerificationAttempts, evaluationTrials: visibleEvaluationTrials, fingerJetThreshold: fingerprintMatchThreshold() }));
  } catch (error) {
    console.error('AI insights generation failed:', error);
    res.status(500).json({ error: 'Unable to generate AI insights right now.' });
  }
});

router.post('/biometric-evaluation-trials', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).json({ error: 'MongoDB connection not ready' });
    const expectedType = req.body?.expectedType === 'impostor' ? 'impostor' : req.body?.expectedType === 'genuine' ? 'genuine' : null;
    const expectedEmployeeId = String(req.body?.expectedEmployeeId ?? '').trim();
    if (!expectedType) return res.status(400).json({ error: 'Choose an enrolled employee or a non-enrolled finger test' });
    if (expectedType === 'genuine' && !expectedEmployeeId) return res.status(400).json({ error: 'Choose the employee expected to match' });
    const [probe] = normalizeFingerprintSamples(req.body?.fingerprintSamples, 1);
    const deviceUid = String(req.body?.deviceUid ?? '').trim().slice(0, 200);
    const templates = await activeBiometricTemplates(db);
    if (expectedType === 'genuine' && !templates.some((template) => template.employeeId === expectedEmployeeId)) {
      return res.status(400).json({ error: 'The selected employee does not have an active fingerprint enrollment.' });
    }
    const startedAt = Date.now();
    const decision = await findFingerprintDecision(probe, templates);
    const responseTimeMs = Date.now() - startedAt;
    const actualEmployeeId = decision.accepted ? decision.best?.employeeId || null : null;
    let classification;
    if (expectedType === 'impostor') classification = decision.accepted ? 'FA' : 'TR';
    else if (!decision.accepted) classification = 'FR';
    else classification = actualEmployeeId === expectedEmployeeId ? 'TA' : 'FA';
    const expectedEmployee = expectedType === 'genuine' ? await db.collection('employees').findOne({ id: expectedEmployeeId }) : null;
    const actualEmployee = actualEmployeeId ? await db.collection('employees').findOne({ id: actualEmployeeId }) : null;
    const trial = {
      id: crypto.randomUUID(), mode: 'one-to-many', expectedType,
      expectedEmployeeId: expectedType === 'genuine' ? expectedEmployeeId : null,
      expectedEmployeeName: expectedEmployee?.name || null,
      actualEmployeeId, actualEmployeeName: actualEmployee?.name || null,
      accepted: decision.accepted, classification,
      wrongEmployeeMatch: expectedType === 'genuine' && decision.accepted && actualEmployeeId !== expectedEmployeeId,
      score: decision.best?.score ?? null, threshold: decision.threshold,
      deviceUid: deviceUid || null, responseTimeMs, createdAt: new Date(),
      createdBy: req.auth.actor.email,
    };
    await db.collection('biometric_evaluation_trials').insertOne(trial);
    res.status(201).json(trial);
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    console.error('Biometric evaluation failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to record the fingerprint evaluation trial' });
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
  // Treat IDs in linked collections as reserved too. This prevents a manually
  // deleted employee profile from reusing an ID that still has a login,
  // fingerprint, attendance, leave, or payroll record attached to it.
  const idLists = await Promise.all([
    db.collection('employees').distinct('id'),
    db.collection('employee_accounts').distinct('employeeId'),
    db.collection('biometric_templates').distinct('employeeId'),
    db.collection('attendance').distinct('employeeId'),
    db.collection('leave_requests').distinct('employeeId'),
    db.collection('payroll_requests').distinct('employeeId'),
  ]);
  const highest = idLists.flat().reduce((maximum, id) => {
    const match = /^EMP-(\d+)$/i.exec(String(id ?? ''));
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `EMP-${String(highest + 1).padStart(3, '0')}`;
}

function duplicateEmployeeMessage(error) {
  const fields = Object.keys(error?.keyPattern ?? error?.keyValue ?? {});
  if (fields.includes('email')) return 'This email address is already used by another WorkPulse account.';
  if (fields.includes('employeeId')) return 'The generated employee ID is still reserved by linked account or fingerprint data. Refresh the form and try again.';
  if (fields.includes('id')) return 'The generated employee ID is already in use. Refresh the form and try again.';
  return 'A unique employee account value already exists. Refresh the form and try again.';
}

const defaultSettings = {
  shift: { enabled: false, startTime: '09:00', maxHours: 8, workDays: 5 },
  leave: { monthlyCredits: 10 },
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
  return Math.max(0, Math.min(rawHours, maxHours));
}

export async function getSettings(db) {
  const stored = await db.collection('settings').findOne({ key: 'company' });
  const storedShift = stored?.shift ?? {};
  return {
    shift: {
      enabled: Boolean(storedShift.enabled ?? defaultSettings.shift.enabled),
      startTime: storedShift.startTime ?? defaultSettings.shift.startTime,
      maxHours: Number(storedShift.maxHours ?? defaultSettings.shift.maxHours),
      workDays: Number(storedShift.workDays ?? defaultSettings.shift.workDays),
    },
    leave: { monthlyCredits: Number(stored?.leave?.monthlyCredits ?? stored?.leave?.casualDays ?? defaultSettings.leave.monthlyCredits) },
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
      shift: { enabled: Boolean(incoming.shift?.enabled), startTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(incoming.shift?.startTime) ? incoming.shift.startTime : defaultSettings.shift.startTime, maxHours: numberInRange(incoming.shift?.maxHours, 8, 1, 24), workDays: numberInRange(incoming.shift?.workDays, 5, 1, 7) },
      leave: { monthlyCredits: numberInRange(incoming.leave?.monthlyCredits, 10, 0, 31) },
    };
    await mongoose.connection.db.collection('settings').updateOne({ key: 'company' }, { $set: { ...normalized, updatedAt: new Date() }, $unset: { lateness: '' } }, { upsert: true });
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
    const periodStart = currentPayrollPeriodStart();
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
        banned: Boolean(e.banned),
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
    if (!(await getSystemControls(mongoose.connection.db)).registrationOpen) return res.status(403).json({ error: 'New employee registration is currently restricted in Admin Controls' });
    const employee = normalizedEmployee(req.body);
    if (!employee.firstName || !employee.lastName) return res.status(400).json({ error: 'First name and last name are required' });
    if (!employee.email || !employee.phone || !employee.address) return res.status(400).json({ error: 'Email, phone number, and address are required' });
    if (!/^\+639\d{9}$/.test(employee.phone)) return res.status(400).json({ error: 'Phone number must use +639XXXXXXXXX with no spaces' });
    if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return res.status(503).json({ error: 'Employee email delivery is not configured. Ask the system owner to configure SMTP before creating an account.' });
    const db = mongoose.connection.db;
    const [adminEmail, employeeAccountEmail, employeeRecordEmail] = await Promise.all([
      db.collection('admin_accounts').findOne({ email: employee.email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
      db.collection('employee_accounts').findOne({ email: employee.email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
      db.collection('employees').findOne({ email: employee.email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
    ]);
    if (adminEmail || employeeAccountEmail || employeeRecordEmail) return res.status(409).json({ error: 'This email address is already used by another WorkPulse account.' });
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD } });
    try { await transport.verify(); }
    catch (emailError) {
      console.error('Employee email service verification failed:', emailError instanceof Error ? emailError.message : emailError);
      return res.status(503).json({ error: 'The employee email service is unavailable. No account was created. Check the Gmail App Password and restart the backend.' });
    }
    const fingerprintSamples = normalizeFingerprintSamples(req.body?.fingerprintSamples, 3);
    const deviceUid = String(req.body?.fingerprintDeviceUid ?? '').trim().slice(0, 200);
    const enrollment = await validateEnrollmentSamples(fingerprintSamples);
    employee.id = await nextEmployeeId(db);
    await rejectDuplicateEnrollment(db, employee.id, enrollment.templates);
    const createdAt = new Date();
    const generatedPassword = generateTemporaryPassword();
    const passwordHash = await hashSecret(generatedPassword);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('employees').insertOne({ ...employee, biometricStatus: 'enrolled', createdAt, updatedAt: createdAt }, { session });
        await db.collection('employee_accounts').insertOne({
          employeeId: employee.id, email: employee.email, passwordHash,
          role: employee.role, active: true, mustChangePassword: true, createdAt, updatedAt: createdAt,
        }, { session });
        await db.collection('biometric_templates').insertOne({
          employeeId: employee.id,
          protectedSamples: encryptFingerprintSamples(enrollment.templates),
          sampleFormat: 'ansi-378-fmd', sampleCount: enrollment.templates.length,
          matcher: 'HID FingerJet', matcherFormat: enrollment.format, matchThreshold: enrollment.threshold, deviceUid: deviceUid || null,
          enrolledAt: createdAt, enrolledBy: req.auth.actor.email, version: 2,
        }, { session });
      });
    } finally { await session.endSession(); }
    try {
      const loginUrl = String(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const delivery = await transport.sendMail({
          from: `WorkPulseAI <${process.env.SMTP_USER}>`,
          to: employee.email,
          subject: 'Your WorkPulseAI employee login details',
          text: [
            `Hello ${employee.firstName},`,
            '',
            'Your WorkPulseAI employee account is ready.',
            `Employee ID: ${employee.id}`,
            `Login page: ${loginUrl}`,
            `Email: ${employee.email}`,
            `Generated password: ${generatedPassword}`,
            '',
            'After entering these details, complete the verification code sent to this email address.',
            'You will be required to create a new password before opening your workspace.',
            'Keep this message private and do not share your password.',
          ].join('\n'),
      });
      const accepted = (delivery.accepted ?? []).map((address) => String(address).toLowerCase());
      if (!accepted.includes(employee.email)) throw new Error('The recipient address was not accepted by the mail service');
    } catch (emailError) {
      console.error('Employee login details email failed:', emailError instanceof Error ? emailError.message : emailError);
      const cleanupSession = await mongoose.startSession();
      try {
        await cleanupSession.withTransaction(async () => {
          await db.collection('employees').deleteOne({ id: employee.id, createdAt }, { session: cleanupSession });
          await db.collection('employee_accounts').deleteOne({ employeeId: employee.id, createdAt }, { session: cleanupSession });
          await db.collection('biometric_templates').deleteOne({ employeeId: employee.id, enrolledAt: createdAt }, { session: cleanupSession });
        });
      } finally {
        await cleanupSession.endSession();
      }
      return res.status(502).json({ error: 'The login email could not be delivered, so no employee account was created. Check the address and try again.' });
    }
    res.status(201).json({ ...employee, biometricStatus: 'enrolled', createdAt, loginEmailSent: true });
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    if (error?.code === 11000) return res.status(409).json({ error: duplicateEmployeeMessage(error) });
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
    const db = mongoose.connection.db;
    const [adminEmail, employeeAccountEmail, employeeRecordEmail] = await Promise.all([
      db.collection('admin_accounts').findOne({ email: employee.email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
      db.collection('employee_accounts').findOne({ email: employee.email, employeeId: { $ne: employee.id } }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
      db.collection('employees').findOne({ email: employee.email, id: { $ne: employee.id } }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
    ]);
    if (adminEmail || employeeAccountEmail || employeeRecordEmail) return res.status(409).json({ error: 'This email address is already used by another WorkPulse account.' });
    const result = await db.collection('employees').updateOne({ id: req.params.id }, { $set: { ...employee, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Employee not found' });
    await db.collection('employee_accounts').updateOne({ employeeId: employee.id }, { $set: { email: employee.email, role: employee.role, updatedAt: new Date() } });
    res.json({ ...employee, createdAt: existing.createdAt });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'This email address is already used by another WorkPulse account.' });
    res.status(500).json({ error: 'Failed to update employee' });
  }
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
          matcher: 'HID FingerJet', matcherFormat: enrollment.format, matchThreshold: enrollment.threshold, deviceUid: deviceUid || null,
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

router.post('/employees/:id/send-login-email', async (req, res) => {
  try {
    const verification = await verifyAdminPassword(req, req.body?.adminPassword);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password', ...(verification.retryAfterSeconds ? { retryAfterSeconds: verification.retryAfterSeconds } : {}) });
    }
    if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return res.status(503).json({ error: 'Employee email delivery is not configured.' });
    const db = mongoose.connection.db;
    const employee = await db.collection('employees').findOne({ id: req.params.id, archived: { $ne: true } });
    const account = await db.collection('employee_accounts').findOne({ employeeId: req.params.id, active: true });
    if (!employee || !account) return res.status(404).json({ error: 'Active employee login account not found.' });
    const generatedPassword = generateTemporaryPassword();
    const passwordHash = await hashSecret(generatedPassword);
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD } });
    try {
      await transport.verify();
      const loginUrl = String(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const delivery = await transport.sendMail({
        from: `WorkPulseAI <${process.env.SMTP_USER}>`, to: employee.email,
        subject: 'Your new WorkPulseAI login details',
        text: [`Hello ${employee.firstName || employee.name},`, '', 'A new WorkPulseAI password was requested for your employee account.', `Employee ID: ${employee.id}`, `Login page: ${loginUrl}`, `Email: ${employee.email}`, `New generated password: ${generatedPassword}`, '', 'Complete the verification code sent to this email after signing in.', 'You will be required to create a new password before opening your workspace.', 'Keep this message private.'].join('\n'),
      });
      const accepted = (delivery.accepted ?? []).map((address) => String(address).toLowerCase());
      if (!accepted.includes(employee.email)) throw new Error('The recipient address was not accepted by the mail service');
    } catch (emailError) {
      console.error('Replacement employee login email failed:', emailError instanceof Error ? emailError.message : emailError);
      return res.status(502).json({ error: 'The new login email could not be delivered. The existing password was not changed.' });
    }
    await db.collection('employee_accounts').updateOne({ _id: account._id }, { $set: { passwordHash, email: employee.email, mustChangePassword: true, updatedAt: new Date() }, $unset: { passwordChangedAt: '' } });
    res.json({ message: `New login details were sent to ${employee.email}.` });
  } catch (error) {
    console.error('Employee login email reset failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to send new employee login details.' });
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
    const result = await db.collection('employees').findOneAndUpdate({ id: req.params.id, archived: { $ne: true } }, { $set: { archived: true, status: 'inactive', archivedAt: new Date(), updatedAt: new Date() } }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ error: 'Employee not found or already archived' });
    const accounts = await db.collection('employee_accounts').find({ employeeId: req.params.id }, { projection: { _id: 1 } }).toArray();
    await db.collection('employee_accounts').updateMany({ employeeId: req.params.id }, { $set: { active: false, updatedAt: new Date() } });
    if (accounts.length) {
      const accountIds = accounts.map((account) => account._id);
      await Promise.all([
        db.collection('admin_sessions').deleteMany({ accountType: 'employee', accountId: { $in: accountIds } }),
        db.collection('login_otps').deleteMany({ accountId: { $in: accountIds } }),
      ]);
    }
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
    const db = mongoose.connection.db;
    const hasFingerprint = Boolean(await db.collection('biometric_templates').findOne({ employeeId: req.params.id }, { projection: { _id: 1 } }));
    const result = await db.collection('employees').findOneAndUpdate({ id: req.params.id, archived: true }, { $set: { archived: false, status: 'active', biometricStatus: hasFingerprint ? 'enrolled' : 'none', unarchivedAt: new Date(), updatedAt: new Date() }, $unset: { archivedAt: '' } }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ error: 'Archived employee not found' });
    await db.collection('employee_accounts').updateOne({ employeeId: req.params.id }, { $set: { active: true, updatedAt: new Date() } });
    res.json(result);
  } catch { res.status(500).json({ error: 'Failed to restore employee' }); }
});

router.delete('/employees/:id/permanent', async (req, res) => {
  try {
    if (!(await authenticatedAdmin(req, true))) return res.status(401).json({ error: 'Incorrect password or expired session' });
    const db = mongoose.connection.db;
    const employee = await db.collection('employees').findOne({ id: req.params.id, archived: true });
    if (!employee) return res.status(404).json({ error: 'Archived employee not found. Only archived employees can be permanently deleted.' });
    const accounts = await db.collection('employee_accounts').find({ employeeId: employee.id }, { projection: { _id: 1 } }).toArray();
    const accountIds = accounts.map((account) => account._id);
    const session = await mongoose.startSession();
    const deleted = {};
    try {
      await session.withTransaction(async () => {
        deleted.attendance = (await db.collection('attendance').deleteMany({ employeeId: employee.id }, { session })).deletedCount;
        deleted.leaveRequests = (await db.collection('leave_requests').deleteMany({ employeeId: employee.id }, { session })).deletedCount;
        deleted.payrollRequests = (await db.collection('payroll_requests').deleteMany({ employeeId: employee.id }, { session })).deletedCount;
        deleted.biometricTemplates = (await db.collection('biometric_templates').deleteMany({ employeeId: employee.id }, { session })).deletedCount;
        deleted.verificationAttempts = (await db.collection('biometric_verification_attempts').deleteMany({ employeeId: employee.id }, { session })).deletedCount;
        deleted.evaluationTrials = (await db.collection('biometric_evaluation_trials').deleteMany({ $or: [{ expectedEmployeeId: employee.id }, { actualEmployeeId: employee.id }] }, { session })).deletedCount;
        deleted.loginOtps = accountIds.length ? (await db.collection('login_otps').deleteMany({ accountId: { $in: accountIds } }, { session })).deletedCount : 0;
        deleted.sessions = accountIds.length ? (await db.collection('admin_sessions').deleteMany({ accountType: 'employee', accountId: { $in: accountIds } }, { session })).deletedCount : 0;
        deleted.auditEvents = (await db.collection('audit_events').deleteMany({ $or: [{ targetId: employee.id }, ...(accountIds.length ? [{ actorId: { $in: accountIds } }] : [])] }, { session })).deletedCount;
        deleted.employeeAccounts = (await db.collection('employee_accounts').deleteMany({ employeeId: employee.id }, { session })).deletedCount;
        deleted.employee = (await db.collection('employees').deleteOne({ _id: employee._id, archived: true }, { session })).deletedCount;
        if (deleted.employee !== 1) throw new Error('Archived employee changed while deletion was in progress');
      });
    } finally {
      await session.endSession();
    }
    res.json({ id: employee.id, name: employee.name, deleted });
  } catch (error) {
    console.error('Permanent employee deletion failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'The archived employee and linked records could not be deleted.' });
  }
});

router.get('/payroll-requests', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ error: 'MongoDB connection not ready' });

    const employeeIds = await visibleEmployeeIds(db);
    const payrollRequests = await db.collection('payroll_requests').find({ employeeId: { $in: employeeIds } }).sort({ createdAt: -1, _id: -1 }).toArray();

    res.json(
      payrollRequests.map((p) => ({
        id: p.id,
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        amount: p.amount,
        status: p.status,
        currentAmount: p.currentAmount,
        carryOverAmount: p.carryOverAmount,
        periodStart: payrollPeriodKeyForRecord(p),
        grossAmount: p.grossAmount,
        additions: p.additions,
        hoursWorked: p.hoursWorked,
        hourlyRate: p.hourlyRate,
        createdAt: p.createdAt,
        paidAt: p.paidAt,
        rejectedAt: p.rejectedAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payroll requests' });
  }
});

function payrollPeriodKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const startDay = Number(parts.day) <= 15 ? '01' : '16';
  return `${parts.year}-${parts.month}-${startDay}`;
}

function payrollPeriodKeyForRecord(record) {
  const stored = String(record?.periodStart ?? '');
  if (/^\d{4}-\d{2}-(01|16)$/.test(stored)) return stored;
  const createdAt = record?.createdAt ? new Date(record.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) return payrollPeriodKey(createdAt);
  return stored;
}

function currentPayrollPeriodStart() {
  return new Date(`${payrollPeriodKey()}T00:00:00+08:00`);
}

router.post('/payroll-requests', async (req, res) => {
  try {
    const { employeeId } = req.body ?? {};
    const currentAmount = Math.max(0, Number(req.body?.currentAmount || 0));
    const grossAmount = Math.max(0, Number(req.body?.grossAmount || 0));
    const hoursWorked = Math.max(0, Number(req.body?.hoursWorked || 0));
    const hourlyRate = Math.max(0, Number(req.body?.hourlyRate || 0));
    const additions = Array.isArray(req.body?.additions) ? req.body.additions.slice(0, 20).map((item) => ({
      label: String(item?.label ?? '').trim().slice(0, 80),
      value: Math.max(0, Number(item?.value || 0)),
    })).filter((item) => item.label && item.value > 0) : [];
    if (!employeeId) return res.status(400).json({ error: 'Employee ID is required' });
    const db = mongoose.connection.db;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const periodStart = payrollPeriodKey();
    const legacyPeriodStart = currentPayrollPeriodStart().toISOString().slice(0, 10);
    const existing = await db.collection('payroll_requests').findOne({ employeeId, periodStart: { $in: [...new Set([periodStart, legacyPeriodStart])] } });
    if (existing) return res.json({ ...existing, periodStart: payrollPeriodKeyForRecord(existing) });

    const outstanding = await db.collection('payroll_requests').find({
      employeeId,
      status: { $in: ['processing', 'rejected'] },
      rolledInto: { $exists: false },
      $or: [{ periodStart: { $lt: periodStart } }, { periodStart: { $exists: false } }],
    }).toArray();
    const carryOverAmount = outstanding.reduce((sum, payroll) => sum + Number(payroll.amount || 0), 0);
    const id = `PR-${Date.now()}-${employeeId}`;
    const payroll = {
      id, employeeId, employeeName: employee.name, employeeEmail: employee.email,
      grossAmount, additions, hoursWorked, hourlyRate,
      currentAmount, carryOverAmount, amount: currentAmount + carryOverAmount,
      periodStart, periodDays: 15, status: 'processing', createdAt: new Date(),
    };
    await db.collection('payroll_requests').insertOne(payroll);
    if (outstanding.length) await db.collection('payroll_requests').updateMany({ _id: { $in: outstanding.map((item) => item._id) } }, { $set: { rolledInto: id, rolledAt: new Date() } });
    res.status(201).json(payroll);
  } catch { res.status(500).json({ error: 'Failed to process payroll' }); }
});

router.patch('/payroll-requests/:id/confirm-payment', async (req, res) => {
  try {
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password', ...(verification.retryAfterSeconds ? { retryAfterSeconds: verification.retryAfterSeconds } : {}) });
    }
    const db = mongoose.connection.db;
    const paidAt = new Date();
    const result = await db.collection('payroll_requests').findOneAndUpdate(
      { id: req.params.id, status: { $in: ['processing', 'rejected'] } },
      { $set: { status: 'paid', paidAt, approvedBy: req.auth.actor.email }, $unset: { rejectedAt: '', rejectedBy: '' } },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Unpaid payroll record not found' });
    await db.collection('payroll_requests').updateMany(
      {
        employeeId: result.employeeId,
        rolledInto: { $exists: true },
        status: { $in: ['processing', 'rejected', 'carried_over'] },
        ...(result.periodStart ? { periodStart: { $lte: result.periodStart } } : {}),
      },
      { $set: { status: 'paid', paidAt, settledBy: result.id, approvedBy: req.auth.actor.email } },
    );
    res.json({ id: result.id, status: result.status, paidAt: result.paidAt });
  } catch { res.status(500).json({ error: 'Failed to confirm payment' }); }
});

router.patch('/payroll-requests/:id/reject-payment', async (req, res) => {
  try {
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password', ...(verification.retryAfterSeconds ? { retryAfterSeconds: verification.retryAfterSeconds } : {}) });
    }
    const result = await mongoose.connection.db.collection('payroll_requests').findOneAndUpdate(
      { id: req.params.id, status: 'processing' },
      { $set: { status: 'rejected', rejectedAt: new Date(), rejectedBy: req.auth.actor.email } },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Processing payroll record not found' });
    res.json({ id: result.id, status: result.status, rejectedAt: result.rejectedAt });
  } catch { res.status(500).json({ error: 'Failed to mark payroll as not paid' }); }
});

router.post('/payroll-requests/:id/email', async (req, res) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return res.status(503).json({ error: 'Email delivery is not configured' });
    const db = mongoose.connection.db;
    const payroll = await db.collection('payroll_requests').findOne({ id: req.params.id });
    if (!payroll) return res.status(404).json({ error: 'Payslip not found' });
    const employee = await db.collection('employees').findOne({ id: payroll.employeeId, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Active employee not found' });
    if (!employee.email) return res.status(400).json({ error: 'Add an email address to this employee profile first' });
    const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
    const additions = Array.isArray(payroll.additions) ? payroll.additions : [];
    const text = [
      'WorkPulseAI Payslip',
      `Pay period: ${payroll.periodStart}`,
      `Employee: ${employee.name}`,
      `Employee ID: ${employee.id}`,
      '',
      `Hours worked: ${Number(payroll.hoursWorked || 0).toFixed(2)}`,
      `Hourly rate: ${money(payroll.hourlyRate)}`,
      `Attendance-based pay: ${money(payroll.grossAmount ?? payroll.currentAmount)}`,
      ...additions.map((item) => `${item.label}: +${money(item.value)}`),
      ...(Number(payroll.carryOverAmount || 0) > 0 ? [`Unpaid balance carried forward: +${money(payroll.carryOverAmount)}`] : []),
      '',
      `Total payroll: ${money(payroll.amount)}`,
      `Status: ${payroll.status === 'paid' ? 'Paid' : payroll.status === 'rejected' ? 'Unpaid - carries forward' : 'Awaiting approval'}`,
    ].join('\n');
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD } });
    await transport.sendMail({ from: `Workpulse AI <${process.env.SMTP_USER}>`, to: employee.email, subject: `Payslip ${payroll.periodStart} - ${employee.name}`, text });
    res.json({ message: `Payslip sent to ${employee.email}` });
  } catch (error) {
    console.error('Payslip email failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to email the payslip' });
  }
});

router.post('/payroll/:employeeId/email-summary', async (req, res) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return res.status(503).json({ error: 'Email delivery is not configured' });
    const employee = await mongoose.connection.db.collection('employees').findOne({ id: req.params.employeeId, archived: { $ne: true } });
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
    const activePeriodStart = payrollPeriodKey();
    const legacyActivePeriodStart = currentPayrollPeriodStart().toISOString().slice(0, 10);
    const activePayroll = await mongoose.connection.db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart: { $in: [...new Set([activePeriodStart, legacyActivePeriodStart])] } });
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

    const employeeIds = await visibleEmployeeIds(db);
    const leaveRequests = await db.collection('leave_requests').find({ employeeId: { $in: employeeIds } }).toArray();

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
    const employeeIds = await visibleEmployeeIds(db);
    const pendingRequest = await db.collection('leave_requests').findOne({ id: req.params.id, employeeId: { $in: employeeIds }, status: 'pending' });
    if (!pendingRequest) return res.status(404).json({ error: 'Pending leave request not found' });
    if (status === 'approved' && pendingRequest.employeeId) {
      const [settings, approvedRequests] = await Promise.all([
        getSettings(db),
        db.collection('leave_requests').find({ employeeId: pendingRequest.employeeId, status: 'approved' }).toArray(),
      ]);
      for (const month of monthKeysForRange(pendingRequest.startDate, pendingRequest.endDate)) {
        const current = monthlyLeaveSummary(approvedRequests, settings.leave.monthlyCredits, month);
        const requested = leaveDaysInMonth(pendingRequest, month);
        if (current.used + requested > current.total) {
          const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
          return res.status(409).json({ error: `Not enough leave credits for ${monthLabel}. ${current.remaining} of ${current.total} credits remain.` });
        }
      }
    }
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
    const employeeIds = await visibleEmployeeIds(db);
    const attendance = await db.collection('attendance').find({ employeeId: { $in: employeeIds } }).toArray();

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
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    now,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(now),
  };
}

router.post('/attendance/kiosk', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).json({ error: 'MongoDB connection not ready' });
    const [probe] = normalizeFingerprintSamples(req.body?.fingerprintSamples, 1);
    const deviceUid = String(req.body?.deviceUid ?? '').trim().slice(0, 200);
    const templates = await activeBiometricTemplates(db);
    const matchStartedAt = Date.now();
    const decision = await findFingerprintDecision(probe, templates);
    const matched = decision.accepted ? decision.best : null;
    const attemptTime = new Date();
    let verificationAttemptId = null;
    try {
      const insertedAttempt = await db.collection('biometric_verification_attempts').insertOne({
        mode: 'one-to-many', accepted: decision.accepted,
        employeeId: matched?.employeeId || null, score: decision.best?.score ?? null,
        threshold: decision.threshold, deviceUid: deviceUid || null,
        responseTimeMs: Date.now() - matchStartedAt, action: matched ? 'recognized' : 'no-match', createdAt: attemptTime,
      });
      verificationAttemptId = insertedAttempt.insertedId;
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
      const record = {
        employeeId, name: employee.name, role: employee.role === 'extra' ? 'Extra' : 'Regular',
        date: stamp.date, checkIn: stamp.time, checkOut: null,
        sessions: [{ checkIn: stamp.time, checkOut: null, checkInAt: stamp.now, deviceUid: deviceUid || null, matchScore: matched.score }],
        sessionCount: 1, lastAction: 'time-in',
        status: 'Present',
        captureMethod: 'digitalpersona-fingerjet', deviceUid: deviceUid || null,
        identityVerified: true, matchScore: matched.score, matcherFormat: matched.format,
        createdAt: stamp.now, updatedAt: stamp.now,
      };
      try { await db.collection('attendance').insertOne(record); }
      catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: 'Attendance was already recorded for this employee today' });
        throw error;
      }
      if (verificationAttemptId) await db.collection('biometric_verification_attempts').updateOne({ _id: verificationAttemptId }, { $set: { action: 'time-in', eventTime: stamp.time, attendanceDate: stamp.date } });
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
        if (verificationAttemptId) await db.collection('biometric_verification_attempts').updateOne({ _id: verificationAttemptId }, { $set: { action: 'daily-limit', eventTime: stamp.time, attendanceDate: stamp.date } });
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
    if (verificationAttemptId) await db.collection('biometric_verification_attempts').updateOne({ _id: verificationAttemptId }, { $set: { action, eventTime: stamp.time, attendanceDate: stamp.date } });
    return res.json({ action, record: { ...updated, eventTime: stamp.time, _id: undefined } });
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    console.error('Kiosk attendance failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to record kiosk attendance' });
  }
});

export default router;


