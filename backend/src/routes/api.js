import { validPhone } from '../../../shared/input-format.js';
import { payrollTransaction } from '../payroll-transaction.js';
import { decideLeaveRequest, leaveApprovalPreview } from '../leave-approval.js';
import { cashAdvanceSummary, proposedAdvanceDeduction } from '../cash-advances.js';
import { additionFrequency, validQuarter, quarterForDate, nextQuarter, scheduleSalaryAddition, combinedSalaryAddition } from '../../../shared/quarterly-additions.js';
import { workHourOrderError } from '../../../shared/work-hours.js';
import { previewQuarterlyAdditions, includeQuarterlyAdditions, removeQuarterlyAdditions, quarterlySelectionError, recurringPayrollAdditions, automaticQuarterlyAdditions, undoPaymentValidationError } from '../quarterly-additions.js';
import { ADDITION_MAX, validBoundedNumber, identifiersValidationError, settingsNumbersValidationError } from '../../../shared/field-limits.js';
import { passwordValidationError } from '../../../shared/password-policy.js';
import { leaveRequestDaysError } from '../../../shared/leave-policy.js';
import { normalizeName, validEmail, validAddress, employeeValidationError } from '../input-validation.js';
import { checkoutIsChronological } from '../attendance-validation.js';
import { approvedLeaveCoversDate, manualAttendanceProblem } from '../manual-attendance.js';
import { clockOutSessions, forcedClockOutUpdate } from '../force-clock-out.js';
import { activityFilter, auditPresentation } from '../audit-display.js';
import { loadNotifications } from '../notifications.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { createEmailTransport, emailConfigured } from '../email.js';
import crypto from 'node:crypto';
import { BACKUP_COLLECTIONS, serializeBackup } from '../backup-format.js';
import { attendanceRiskForEmployee, buildAIInsights } from '../ai-insights.js';
import { hashSecret, verifyAdminPassword, verifySecret } from './auth.js';
import { getSystemControls, updateSystemControls } from '../system-controls.js';
import { auditEvent, auditScreenName, authenticate, csrfProtection, pick, requireRole, rateLimit } from '../security.js';
import {
  BiometricError,
  encryptFingerprintSamples,
  fingerprintMatchStrength,
  fingerprintMatchThreshold,
  findFingerprintDecision,
  findFingerprintMatch,
  normalizeFingerprintSamples,
  rejectDuplicateEnrollment,
  validateEnrollmentSamples,
} from '../biometrics.js';

const router = Router();
async function expirePassedLeaveRequests(db) {
  await db.collection('leave_requests').updateMany(
    { status: 'pending', endDate: { $lt: kioskTimestamp().date } },
    { $set: { status: 'passed' } },
  );
}
const MAX_DAILY_ATTENDANCE_SESSIONS = 3;
const AI_INSIGHTS_CACHE_MS = 60_000;
let aiInsightsCache = { expiresAt: 0, value: null };

async function visibleEmployeeIds(db) {
  const employees = await db.collection('employees').find(
    { archived: { $ne: true } },
    { projection: { id: 1 } },
  ).toArray();
  return employees.map((employee) => employee.id).filter(Boolean);
}

async function activeBiometricTemplates(db) {
  const employees = await db.collection('employees').find(
    { archived: { $ne: true }, banned: { $ne: true }, status: { $ne: 'inactive' } },
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

function scheduledWorkStatus(settings, dateValue) {
  const override = settings?.shift?.scheduleOverrides?.find((entry) => entry.date === dateValue);
  if (override) return override.working === true;
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return Array.isArray(settings?.shift?.workWeekdays) && settings.shift.workWeekdays.includes(date.getUTCDay());
}

export async function enforceAutomaticAbsences(db, settings, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 30);
  const reviewDates = [];
  for (const cursor = new Date(start); cursor.toISOString().slice(0, 10) < today; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    if (scheduledWorkStatus(settings, date)) reviewDates.push(date);
  }
  const idleDates = new Set((await db.collection('idle_days').find({ date: { $in: reviewDates } }).toArray()).map(item => item.date));
  await db.collection('attendance').deleteMany({ automaticAbsence: true, date: { $gte: start.toISOString().slice(0, 10), $lt: today, $nin: reviewDates } });
  if (!reviewDates.length) return { created: 0 };
  const employees = await db.collection('employees').find({ archived: { $ne: true }, status: { $ne: 'inactive' } }, { projection: { id: 1, name: 1, role: 1, createdAt: 1 } }).toArray();
  if (!employees.length) return { created: 0 };
  const employeeIds = employees.map((employee) => employee.id);
  const [existing, approvedLeave] = await Promise.all([
    db.collection('attendance').find({ employeeId: { $in: employeeIds }, date: { $in: reviewDates } }, { projection: { employeeId: 1, date: 1 } }).toArray(),
    db.collection('leave_requests').find({ employeeId: { $in: employeeIds }, status: 'approved' }).toArray(),
  ]);
  const occupied = new Set(existing.map((record) => `${record.employeeId}:${record.date}`));
  const leaveDates = new Set();
  for (const leave of approvedLeave) {
    const dates = Array.isArray(leave.approvedDates) && leave.approvedDates.length ? leave.approvedDates : [];
    for (const date of dates) leaveDates.add(`${leave.employeeId}:${date}`);
  }
  const createdAt = new Date();
  const operations = [];
  for (const employee of employees) {
    const employeeStart = employee.createdAt ? new Date(employee.createdAt).toISOString().slice(0, 10) : null;
    for (const date of reviewDates) {
      const key = `${employee.id}:${date}`;
      if ((employeeStart && date < employeeStart) || occupied.has(key) || leaveDates.has(key)) continue;
      operations.push({ updateOne: {
        filter: { employeeId: employee.id, date },
        update: { $setOnInsert: { employeeId: employee.id, name: employee.name, role: employeeRoleLabel(employee.role), date, checkIn: null, checkOut: null, sessions: [], status: idleDates.has(date) ? 'Idle' : 'Absent', ...(idleDates.has(date) ? { idleDay: true } : { automaticAbsence: true }), createdAt, updatedAt: createdAt } },
        upsert: true,
      } });
    }
  }
  if (!operations.length) return { created: 0 };
  const result = await db.collection('attendance').bulkWrite(operations, { ordered: false });
  aiInsightsCache = { expiresAt: 0, value: null };
  return { created: result.upsertedCount || 0 };
}

async function reconcileLeaveWithSchedule(db, settings) {
  const requests = await db.collection('leave_requests').find({ status: { $in: ['pending', 'approved'] } }).toArray();
  for (const request of requests) {
    const field = request.status === 'approved' ? 'approvedDates' : 'requestedDates';
    const dates = Array.isArray(request[field]) ? request[field] : [];
    if (!dates.length) continue;
    const eligibleDates = dates.filter((date) => scheduledWorkStatus(settings, date));
    const removedDates = dates.filter((date) => !eligibleDates.includes(date));
    if (!removedDates.length) continue;
    const changes = {
      [field]: eligibleDates,
      totalDays: eligibleDates.length,
      scheduleAdjustedAt: new Date(),
      status: eligibleDates.length ? request.status : 'cancelled',
    };
    if (eligibleDates.length) {
      changes.startDate = eligibleDates[0];
      changes.endDate = eligibleDates.at(-1);
    }
    await db.collection('leave_requests').updateOne({ _id: request._id }, { $set: changes });
    if (request.status === 'approved') {
      await db.collection('attendance').deleteMany({ employeeId: request.employeeId, leaveRequestId: request.id, status: 'On Leave', date: { $in: removedDates }, $or: [{ checkIn: null }, { checkIn: '' }, { checkIn: { $exists: false } }] });
    }
  }
}

export async function reconcileIdleDaysWithSchedule(db, settings, today) {
  const markers = await db.collection('idle_days').find({ date: { $gte: today } }, { projection: { date: 1 } }).toArray();
  const nonWorkingDates = markers.map((marker) => marker.date).filter((date) => !scheduledWorkStatus(settings, date));
  if (!nonWorkingDates.length) return [];
  const attendance = await db.collection('attendance').find({ date: { $in: nonWorkingDates }, idleDay: true }).toArray();
  for (const record of attendance) {
    if (record.status === 'On Leave') {
      await db.collection('attendance').updateOne({ _id: record._id }, { $unset: { idleDay: '', idleDayBy: '', idleDayAt: '' } });
    } else if (attendanceSessions(record).length || record.checkIn) {
      await db.collection('attendance').updateOne({ _id: record._id }, { $set: { status: 'Present', updatedAt: new Date() }, $unset: { idleDay: '', idleDayBy: '', idleDayAt: '' } });
    } else {
      await db.collection('attendance').deleteOne({ _id: record._id });
    }
  }
  await db.collection('idle_days').deleteMany({ date: { $in: nonWorkingDates } });
  return nonWorkingDates;
}

router.use(authenticate, csrfProtection);
router.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.locals.skipAudit === true || req.path === '/admin/notifications/read') return;
    const body = req.body ?? {};
    const changedFields = Object.keys(body).filter((key) => !['adminPassword', 'password', 'fingerprintSamples', 'template', 'captchaAnswer'].includes(key)).slice(0, 30);
    const targetName = String(body.employeeName || body.name || [body.firstName, body.lastName].filter(Boolean).join(' ') || '').trim().slice(0, 120) || null;
    void auditEvent({
      req,
      actor: req.auth?.actor,
      action: `api.${req.method.toLowerCase()}`,
      targetType: req.path.split('/').filter(Boolean)[0] ?? 'api',
      targetId: req.params?.id ?? req.params?.employeeId ?? null,
      outcome: res.locals.auditOutcome || (res.statusCode < 400 ? 'success' : 'failure'),
      metadata: {
        path: req.path, method: req.method, statusCode: res.statusCode, changedFields, targetName,
        requestedStatus: typeof body.status === 'string' ? body.status : null,
        payrollContext: /payroll/.test(req.path) ? {
          scope: body.scope, amount: body.amount, periodStart: body.periodStart,
          selectedCount: Array.isArray(body.ids) ? body.ids.length : undefined,
          printScope: body.printScope, employeeName: body.employeeName, recordCount: body.recordCount,
        } : null,
        settingsValues: req.path === '/settings' ? {
          workStart: body.shift?.startTime, workStop: body.shift?.workStopTime,
          automaticClockOutTime: body.shift?.autoClockOutTime, workDays: body.shift?.workDays,
          regularHourlyRate: body.payroll?.hourlyRates?.regular, extraHourlyRate: body.payroll?.hourlyRates?.extra,
        } : null,
        ...(res.locals.auditMetadata || {}),
      },
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

router.get('/employee/me', requireRole('regular', 'extra', 'manager', 'supervisor'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    await expirePassedLeaveRequests(db);
    const employeeId = req.auth.actor.employeeId;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee profile not found' });
    const [attendance, leaveRequests, biometricTemplate, settings] = await Promise.all([
      db.collection('attendance').find({ employeeId }).sort({ date: -1 }).limit(60).toArray(),
      db.collection('leave_requests').find({ employeeId }).sort({ createdAt: -1, _id: -1 }).toArray(),
      db.collection('biometric_templates').findOne({ employeeId }, { projection: { _id: 1 } }),
      getSettings(db),
    ]);
    const carriedPayroll = await db.collection('payroll_requests').find({ employeeId, status: 'carried_over' }).toArray();
    for (const record of carriedPayroll) {
      const periodStart = payrollPeriodKeyForRecord(record);
      if (/^\d{4}-\d{2}-(01|16)$/.test(periodStart)) await preparePayrollRecord(db, employee, periodStart, settings);
    }
    const activePeriod = payrollPeriodKey();
    const activePayroll = await db.collection('payroll_requests').findOne({ employeeId, periodStart: activePeriod });
    if (!activePayroll || ['processing', 'rejected'].includes(activePayroll.status)) {
      await preparePayrollRecord(db, employee, activePeriod, settings);
    }
    const payroll = await db.collection('payroll_requests').find({ employeeId }).sort({ createdAt: -1, _id: -1 }).limit(12).toArray();
    const today = kioskTimestamp().date;
    const onLeaveToday = leaveRequests.some((leave) => leave.status === 'approved' && (Array.isArray(leave.approvedDates) && leave.approvedDates.length ? leave.approvedDates.includes(today) : leave.startDate <= today && leave.endDate >= today));
    const attendanceFlag = attendanceRiskForEmployee(attendance, employeeId, leaveRequests, today);
    const cashAdvance = await cashAdvanceSummary(db, employeeId);
    const cashAdvanceRequests = await db.collection('cash_advance_requests').find({ employeeId }).sort({ requestedAt: -1 }).limit(25).toArray();
    res.json({
      profile: { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone, address: employee.address, role: employee.role, status: employee.status === 'inactive' ? 'inactive' : onLeaveToday ? 'on-leave' : 'active', biometricStatus: biometricTemplate ? 'enrolled' : 'none', hourlyRate: configuredHourlyRate(employee, settings), grossSalary: employee.grossSalary, createdAt: employee.createdAt },
      attendance: attendance.map(({ _id, ...record }) => ({ ...record, status: attendanceArrivalStatus(record, settings) })),
      leaveRequests: leaveRequests.map(({ _id, ...record }) => record),
      attendanceFlag,
      cashAdvance,
      cashAdvanceMax: settings.payroll.cashAdvanceMax,
      cashAdvanceRequests: cashAdvanceRequests.map(({ _id, ...request }) => request),
      workSchedule: { workWeekdays: settings.shift.workWeekdays, scheduleOverrides: settings.shift.scheduleOverrides, startTime: settings.shift.startTime, workStopTime: settings.shift.workStopTime, autoClockOutTime: settings.shift.autoClockOutTime },
      payroll: payroll.map((record) => ({
        id: record.id,
        amount: Number(record.amount || 0),
        grossAmount: Number(record.grossAmount || 0),
        advanceDeduction: Number(record.advanceDeduction || 0),
        currentAmount: Number(record.currentAmount || 0),
        carryOverAmount: Number(record.carryOverAmount || 0),
        additions: Array.isArray(record.additions) ? record.additions.map((item) => ({ label: String(item.label || 'Addition').slice(0, 80), value: Number(item.value || 0) })) : [],
        carriedQuarterlyAdditions: record.carriedQuarterlyAdditions ?? [],
        hoursWorked: Number(record.hoursWorked || 0),
        hourlyRate: Number(record.hourlyRate || 0),
        rateBreakdown: Array.isArray(record.rateBreakdown) ? record.rateBreakdown : [],
        status: record.status,
        periodStart: payrollPeriodKeyForRecord(record),
        paidAt: record.paidAt,
        warnings: Array.isArray(record.warnings) ? record.warnings.slice(0, 20).map((warning) => String(warning).slice(0, 200)) : [],
        createdAt: record.createdAt,
      })),
    });
  } catch { res.status(500).json({ error: 'Unable to load employee workspace' }); }
});

router.get('/employee/me/calendar', requireRole('regular', 'extra', 'manager', 'supervisor'), async (req, res) => {
  try {
    await expirePassedLeaveRequests(mongoose.connection.db);
    const month = String(req.query.month ?? '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Choose a valid month.' });
    const [year, monthNumber] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
    const db = mongoose.connection.db;
    const employeeId = req.auth.actor.employeeId;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true } }, { projection: { _id: 1 } });
    if (!employee) return res.status(404).json({ error: 'Employee profile not found.' });
    const [attendance, idleDays, leaveRequests, settings] = await Promise.all([
      db.collection('attendance').find({ employeeId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).toArray(),
      db.collection('idle_days').find({ date: { $gte: from, $lte: to } }, { projection: { _id: 0, date: 1 } }).toArray(),
      db.collection('leave_requests').find({ employeeId, status: { $in: ['pending', 'approved', 'passed'] }, startDate: { $lte: to }, endDate: { $gte: from } }).toArray(),
      getSettings(db),
    ]);
    res.json({
      month,
      attendance: attendance.map(({ _id, ...record }) => ({ ...record, status: attendanceArrivalStatus(record, settings) })),
      idleDates: idleDays.map(({ date }) => date),
      leaveRequests: leaveRequests.map(({ _id, ...record }) => record),
      workSchedule: { workWeekdays: settings.shift.workWeekdays, scheduleOverrides: settings.shift.scheduleOverrides, startTime: settings.shift.startTime, workStopTime: settings.shift.workStopTime },
    });
  } catch { res.status(500).json({ error: 'Unable to load your calendar.' }); }
});

router.get('/admin/calendar', requireRole('admin'), async (req, res) => {
  try {
    const month = String(req.query.month ?? '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Choose a valid month.' });
    const [year, monthNumber] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
    const db = mongoose.connection.db;
    await expirePassedLeaveRequests(db);
    const employees = await db.collection('employees').find({ archived: { $ne: true } }, { projection: { _id: 0, id: 1, name: 1 } }).sort({ name: 1 }).toArray();
    const employeeId = String(req.query.employeeId ?? '');
    if (employeeId && !employees.some((employee) => employee.id === employeeId)) return res.status(404).json({ error: 'Employee not found.' });
    const [attendance, idleDays, leaveRequests, settings] = await Promise.all([
      employeeId ? db.collection('attendance').find({ employeeId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).toArray() : [],
      db.collection('idle_days').find({ date: { $gte: from, $lte: to } }, { projection: { _id: 0, date: 1 } }).toArray(),
      employeeId ? db.collection('leave_requests').find({ employeeId, status: { $in: ['pending', 'approved', 'passed'] }, startDate: { $lte: to }, endDate: { $gte: from } }).toArray() : [],
      getSettings(db),
    ]);
    res.json({ month, employees, attendance: attendance.map(({ _id, ...record }) => ({ ...record, status: attendanceArrivalStatus(record, settings) })), idleDates: idleDays.map(({ date }) => date), leaveRequests: leaveRequests.map(({ _id, ...record }) => record), workSchedule: { workWeekdays: settings.shift.workWeekdays, scheduleOverrides: settings.shift.scheduleOverrides, startTime: settings.shift.startTime, workStopTime: settings.shift.workStopTime } });
  } catch { res.status(500).json({ error: 'Unable to load calendar.' }); }
});

router.patch('/employee/me/contact', requireRole('regular', 'extra', 'manager', 'supervisor'), async (req, res) => {
  try {
    const phone = String(req.body?.phone ?? '').trim();
    const address = String(req.body?.address ?? '').trim().replace(/\s+/g, ' ');
    if (!validPhone(phone)) {
      return res.status(400).json({ error: 'Use 7 to 15 digits with an optional leading +; spaces and other symbols are not allowed.' });
    }
    if (!validAddress(address)) {
      return res.status(400).json({ error: 'Enter an address using 5 to 500 characters.' });
    }
    const db = mongoose.connection.db;
    const employeeId = req.auth.actor.employeeId;
    const updatedAt = new Date();
    const result = await db.collection('employees').findOneAndUpdate(
      { id: employeeId, archived: { $ne: true }, status: { $ne: 'inactive' } },
      { $set: { phone, address, updatedAt } },
      { returnDocument: 'after', projection: { _id: 0, id: 1, phone: 1, address: 1 } },
    );
    if (!result) return res.status(404).json({ error: 'Active employee profile not found.' });
    res.json(result);
  } catch (error) {
    console.error('Employee contact update failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to update your contact information.' });
  }
});

router.post('/employee/me/leave-requests', requireRole('regular', 'extra', 'manager', 'supervisor'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const employeeId = req.auth.actor.employeeId;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true }, status: { $ne: 'inactive' } });
    if (!employee) return res.status(404).json({ error: 'Active employee profile not found' });
    const leaveType = String(req.body?.leaveType ?? '');
    const requestedDates = Array.isArray(req.body?.requestedDates) ? [...new Set(req.body.requestedDates.map((date) => String(date)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort() : [];
    const reason = String(req.body?.reason ?? '').trim();
    if (!['Annual Leave', 'Sick Leave', 'Personal Leave', 'Maternity Leave'].includes(leaveType)) return res.status(400).json({ error: 'Select a valid leave type' });
    const datesError = leaveRequestDaysError(requestedDates);
    if (datesError) return res.status(400).json({ error: datesError });
    const startDate = requestedDates[0];
    const endDate = requestedDates.at(-1);
    const totalDays = requestedDates.length;
    const settings = await getSettings(db);
    const nonWorkingDates = requestedDates.filter((date) => scheduledWorkStatus(settings, date) === false);
    if (nonWorkingDates.length) return res.status(409).json({ error: `Leave cannot include ${nonWorkingDates[0]} because it is a scheduled non-working date.` });
    if (reason.length < 5 || reason.length > 500) return res.status(400).json({ error: 'Provide a reason between 5 and 500 characters' });
    const existingRequests = await db.collection('leave_requests').find({ employeeId, status: { $in: ['pending', 'approved'] }, startDate: { $lte: endDate }, endDate: { $gte: startDate } }).toArray();
    const requestedSet = new Set(requestedDates);
    const overlap = existingRequests.find((item) => (Array.isArray(item.approvedDates) && item.approvedDates.length ? item.approvedDates : item.requestedDates ?? []).some((date) => requestedSet.has(date)));
    if (overlap) return res.status(409).json({ error: 'One or more selected dates already belong to another leave request.' });
    const id = `LR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const initials = employee.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const request = { id, employeeId, employeeName: employee.name, role: employeeRoleLabel(employee.role), leaveType, startDate, endDate, requestedDates, approvedDates: [], totalDays, reason, status: 'pending', initials, createdAt: new Date() };
    await db.collection('leave_requests').insertOne(request);
    res.locals.auditMetadata = { targetName: employee.name, employeeId, leaveType, requestedDates, leaveAction: 'submitted' };
    res.status(201).json({ ...request, _id: undefined });
  } catch { res.status(500).json({ error: 'Unable to submit leave request' }); }
});

router.patch('/employee/me/leave-requests/:id/cancel', requireRole('regular', 'extra', 'manager', 'supervisor'), async (req, res) => {
  try {
    await expirePassedLeaveRequests(mongoose.connection.db);
    const request = await mongoose.connection.db.collection('leave_requests').findOneAndUpdate(
      { id: req.params.id, employeeId: req.auth.actor.employeeId, status: 'pending' },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: req.auth.actor.email } },
      { returnDocument: 'after' },
    );
    if (!request) return res.status(409).json({ error: 'Only your own pending leave requests can be cancelled.' });
    res.json({ ...request, _id: undefined });
  } catch { res.status(500).json({ error: 'Unable to cancel the leave request.' }); }
});

router.post('/employee/me/cash-advance-requests', requireRole('regular', 'extra', 'manager', 'supervisor'), async (req, res) => {
  try {
    const amountError = advanceAmountError(req.body?.amount);
    if (amountError) return res.status(400).json({ error: amountError });
    if (req.body?.repaymentAgreed !== true) return res.status(400).json({ error: 'Confirm the repayment terms before requesting cash.' });
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length > 500) return res.status(400).json({ error: 'Reason must be 500 characters or fewer.' });
    const db = mongoose.connection.db;
    const employeeId = req.auth.actor.employeeId;
    const settings = await getSettings(db);
    if (Number(req.body.amount) > settings.payroll.cashAdvanceMax) return res.status(400).json({ error: `The cash advance limit is ₱${settings.payroll.cashAdvanceMax.toFixed(2)} per payroll period.` });
    const requestPeriod = payrollPeriodKey();
    if (await db.collection('cash_advances').findOne({ employeeId, issuePeriod: requestPeriod, reversedAt: { $exists: false } })) return res.status(409).json({ error: 'Cash was already given for this payroll period. You can request again next period.' });
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true }, status: { $ne: 'inactive' } });
    if (!employee) return res.status(403).json({ error: 'Only active employees can request a cash advance.' });
    const request = { id: `CAR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, employeeId, employeeName: employee.name, amount: Number(req.body.amount), reason, requestPeriod, periodClaim: true, status: 'pending', open: true, repaymentAgreedAt: new Date(), requestedAt: new Date() };
    await db.collection('cash_advance_requests').insertOne(request);
    res.status(201).json({ id: request.id, status: request.status });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'You already requested a cash advance for this payroll period, or another request is still open.' });
    console.error('Cash advance request failed:', error);
    res.status(500).json({ error: 'Unable to send cash advance request.' });
  }
});

router.patch('/employee/me/cash-advance-requests/:id/accept', requireRole('regular', 'extra', 'manager', 'supervisor'), async (req, res) => {
  try {
    const result = await mongoose.connection.db.collection('cash_advance_requests').findOneAndUpdate(
      { id: req.params.id, employeeId: req.auth.actor.employeeId, status: 'approved' },
      { $set: { status: 'accepted', acceptedAt: new Date() } }, { returnDocument: 'after' },
    );
    if (!result) return res.status(409).json({ error: 'This request is no longer waiting for your acceptance.' });
    res.json({ id: result.id, status: result.status });
  } catch { res.status(500).json({ error: 'Unable to accept the repayment terms.' }); }
});

router.patch('/employee/me/cash-advance-requests/:id/cancel', requireRole('regular', 'extra', 'manager', 'supervisor'), async (req, res) => {
  try {
    const result = await mongoose.connection.db.collection('cash_advance_requests').findOneAndUpdate(
      { id: req.params.id, employeeId: req.auth.actor.employeeId, status: { $in: ['pending', 'approved', 'accepted'] } },
      { $set: { status: 'cancelled', open: false, periodClaim: false, cancelledAt: new Date() } }, { returnDocument: 'after' },
    );
    if (!result) return res.status(409).json({ error: 'This request can no longer be cancelled.' });
    res.json({ id: result.id, status: result.status });
  } catch { res.status(500).json({ error: 'Unable to cancel the request.' }); }
});

router.use(requireRole('admin'));

async function requireAdvancePassword(req, res) {
  const verification = await verifyAdminPassword(req, req.body?.password);
  if (verification.valid) return true;
  if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
  res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required.' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect administrator password.' });
  return false;
}

function advanceAmountError(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7) return 'Enter an amount from ₱0.01 to ₱1,000,000.00.';
  return null;
}

function advanceStartPeriodError(value) {
  const period = String(value ?? '');
  const current = payrollPeriodKey();
  const furthest = new Date(`${current}T00:00:00+08:00`);
  furthest.setUTCMonth(furthest.getUTCMonth() + 12);
  if (!/^20\d{2}-(0[1-9]|1[0-2])-(01|16)$/.test(period) || period < current || period > furthest.toISOString().slice(0, 10)) return 'Choose this payroll period or one within the next year.';
  return null;
}

function advanceDateError(date) {
  const [year, month, day] = String(date ?? '').split('-').map(Number);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? '')) && year >= 2000 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  return valid && date <= kioskTimestamp().date ? null : 'Choose a valid date that is not in the future.';
}

function manilaDateOf(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function refreshAdvancePayroll(db, employee) {
  const settings = await getSettings(db);
  const unpaid = await db.collection('payroll_requests').find({ employeeId: employee.id, status: { $in: ['processing', 'rejected'] }, rolledInto: { $exists: false } }).toArray();
  for (const periodStart of [...new Set([...unpaid.map(row => row.periodStart), payrollPeriodKey()])].filter(key => /^\d{4}-\d{2}-(01|16)$/.test(key)).sort()) {
    await preparePayrollRecord(db, employee, periodStart, settings);
  }
}

router.get('/cash-advance-requests', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const employeeIds = await visibleEmployeeIds(db);
    const requests = await db.collection('cash_advance_requests').find({ employeeId: { $in: employeeIds } }).sort({ requestedAt: -1 }).limit(500).toArray();
    res.json(requests.map(({ _id, ...request }) => request));
  } catch { res.status(500).json({ error: 'Unable to load cash advance requests.' }); }
});

router.patch('/cash-advance-requests/:id/decision', async (req, res) => {
  try {
    if (!(await requireAdvancePassword(req, res))) return;
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Choose Approve or Reject.' });
    const startPeriod = String(req.body?.startPeriod ?? '');
    if (decision === 'approve') {
      const problem = advanceStartPeriodError(startPeriod);
      if (problem) return res.status(400).json({ error: problem });
    }
    const note = String(req.body?.note ?? '').trim();
    if (note.length > 500) return res.status(400).json({ error: 'Note must be 500 characters or fewer.' });
    const db = mongoose.connection.db;
    const pendingRequest = await db.collection('cash_advance_requests').findOne({ id: req.params.id, status: 'pending' });
    if (!pendingRequest) return res.status(409).json({ error: 'This request has already changed. Refresh the list.' });
    if (decision === 'approve') {
      const settings = await getSettings(db);
      if (pendingRequest.amount > settings.payroll.cashAdvanceMax) return res.status(400).json({ error: `The cash advance limit is ₱${settings.payroll.cashAdvanceMax.toFixed(2)} per payroll period.` });
      if (await db.collection('payroll_requests').findOne({ employeeId: pendingRequest.employeeId, periodStart: startPeriod, status: { $in: ['paid', 'approved'] } })) return res.status(409).json({ error: 'That payroll is already paid. Choose a later period.' });
    }
    const request = await db.collection('cash_advance_requests').findOneAndUpdate(
      { id: req.params.id, status: 'pending' },
      decision === 'approve'
        ? { $set: { status: 'approved', startPeriod, adminNote: note, approvedAt: new Date(), approvedBy: req.auth.actor.email } }
        : { $set: { status: 'rejected', open: false, periodClaim: false, adminNote: note, rejectedAt: new Date(), rejectedBy: req.auth.actor.email } },
      { returnDocument: 'after' },
    );
    if (!request) return res.status(409).json({ error: 'This request has already changed. Refresh the list.' });
    res.locals.auditMetadata = { cashAdvanceAction: decision, employeeId: request.employeeId, targetName: request.employeeName, amount: request.amount };
    res.json({ id: request.id, status: request.status });
  } catch { res.status(500).json({ error: 'Unable to update the cash advance request.' }); }
});

router.post('/cash-advance-requests/:id/disburse', async (req, res) => {
  try {
    if (!(await requireAdvancePassword(req, res))) return;
    const date = String(req.body?.date ?? '');
    const dateError = advanceDateError(date);
    if (dateError) return res.status(400).json({ error: dateError });
    const db = mongoose.connection.db;
    const { advance, employee } = await payrollTransaction(db, async transactionDb => {
      const request = await transactionDb.collection('cash_advance_requests').findOne({ id: req.params.id, status: 'accepted', open: true });
      if (!request) throw new Error('STALE_ADVANCE');
      if (date < manilaDateOf(request.acceptedAt)) throw new Error('CASH_BEFORE_ACCEPTANCE');
      const employee = await transactionDb.collection('employees').findOne({ id: request.employeeId, archived: { $ne: true } });
      if (!employee) throw new Error('STALE_ADVANCE');
      await transactionDb.collection('employees').updateOne({ id: employee.id }, { $inc: { payrollPolicyRevision: 1 } });
      const issuePeriod = payrollPeriodKey(new Date(`${date}T12:00:00+08:00`));
      const advance = { id: `CA-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, requestId: request.id, employeeId: employee.id, employeeName: employee.name, amount: request.amount, date, issuePeriod, startPeriod: request.startPeriod, note: request.reason, createdAt: new Date(), createdBy: req.auth.actor.email };
      await transactionDb.collection('cash_advances').insertOne(advance);
      const updated = await transactionDb.collection('cash_advance_requests').updateOne({ id: request.id, status: 'accepted' }, { $set: { status: 'disbursed', open: false, disbursedAt: new Date(), disbursedDate: date, advanceId: advance.id, disbursedBy: req.auth.actor.email } });
      if (updated.modifiedCount !== 1) throw new Error('STALE_ADVANCE');
      return { advance, employee };
    });
    await refreshAdvancePayroll(db, employee);
    res.locals.auditMetadata = { cashAdvanceAction: 'cash-given', employeeId: employee.id, targetName: employee.name, amount: advance.amount };
    res.status(201).json({ id: advance.id, ...await cashAdvanceSummary(db, employee.id) });
  } catch (error) {
    if (error?.message === 'CASH_BEFORE_ACCEPTANCE') return res.status(400).json({ error: 'The cash-given date cannot be before the employee accepted the terms.' });
    if (error?.message === 'STALE_ADVANCE' || error?.code === 11000) return res.status(409).json({ error: 'This request has changed or cash was already confirmed. Refresh the list.' });
    console.error('Cash advance disbursement failed:', error);
    res.status(500).json({ error: 'Unable to confirm that cash was given.' });
  }
});

router.get('/cash-advances', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const employees = await db.collection('employees').find({ archived: { $ne: true } }).toArray();
    const summaries = await Promise.all(employees.map(async employee => ({
      employeeId: employee.id,
      employeeName: employee.name,
      ...await cashAdvanceSummary(db, employee.id),
    })));
    res.json(summaries.filter(row => row.advances.length || row.repayments.length));
  } catch (error) {
    console.error('Cash advance list failed:', error);
    res.status(500).json({ error: 'Unable to load cash advances.' });
  }
});

router.post('/cash-advances', async (req, res) => {
  try {
    if (!(await requireAdvancePassword(req, res))) return;
    const employeeId = String(req.body?.employeeId ?? '');
    const amount = Number(req.body?.amount);
    const date = String(req.body?.date ?? '');
    const note = String(req.body?.note ?? '').trim();
    const startPeriod = String(req.body?.startPeriod || payrollPeriodKey());
    if (req.body?.employeeRepaymentAgreementConfirmed !== true) return res.status(400).json({ error: 'Confirm that the employee agreed to the repayment terms before recording this cash.' });
    const amountError = advanceAmountError(amount);
    if (amountError) return res.status(400).json({ error: amountError });
    const dateError = advanceDateError(date);
    if (dateError) return res.status(400).json({ error: dateError });
    const periodError = advanceStartPeriodError(startPeriod);
    if (periodError) return res.status(400).json({ error: periodError });
    if (note.length > 500) return res.status(400).json({ error: 'Note must be 500 characters or fewer.' });
    const db = mongoose.connection.db;
    const settings = await getSettings(db);
    if (amount > settings.payroll.cashAdvanceMax) return res.status(400).json({ error: `The cash advance limit is ₱${settings.payroll.cashAdvanceMax.toFixed(2)} per payroll period.` });
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });
    if (await db.collection('cash_advance_requests').findOne({ employeeId, open: true })) return res.status(409).json({ error: 'This employee already has a cash advance request in progress. Finish or cancel that request instead of recording the same cash again.' });
    if (await db.collection('payroll_requests').findOne({ employeeId, periodStart: startPeriod, status: { $in: ['paid', 'approved'] } })) return res.status(409).json({ error: 'That payroll is already paid. Choose a later repayment period.' });
    const issuePeriod = payrollPeriodKey(new Date(`${date}T12:00:00+08:00`));
    const advance = { id: `CA-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, employeeId, employeeName: employee.name, amount, date, issuePeriod, startPeriod, note, employeeRepaymentAgreementConfirmedAt: new Date(), createdAt: new Date(), createdBy: req.auth.actor.email };
    await payrollTransaction(db, async transactionDb => {
      await transactionDb.collection('employees').updateOne({ id: employeeId }, { $inc: { payrollPolicyRevision: 1 } });
      await transactionDb.collection('cash_advances').insertOne(advance);
    });
    await refreshAdvancePayroll(db, employee);
    res.locals.auditMetadata = { cashAdvanceAction: 'created', employeeId, targetName: employee.name, amount };
    res.status(201).json({ id: advance.id, ...await cashAdvanceSummary(db, employeeId) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'Cash was already given to this employee for that payroll period.' });
    console.error('Cash advance creation failed:', error);
    res.status(500).json({ error: 'Unable to record cash advance.' });
  }
});

// Read state belongs to the account, so it survives logout and device changes.
router.get('/admin/notifications', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const notifications = await loadNotifications(db);
    const seen = new Set(req.auth.actor.seenNotificationIds || []);
    const legacySeen = new Set(req.auth.actor.seenLeaveNotifications || []);
    res.json(notifications.map(({ _id, ...event }) => ({
      ...event, id: _id, read: seen.has(_id) || (event.category === 'leave' && legacySeen.has(_id.slice(6))),
    })));
  } catch {
    res.status(500).json({ error: 'Unable to load notifications' });
  }
});

router.post('/admin/notifications/read', async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length > 2_000 || ids.some((id) => typeof id !== 'string' || !id || id.length > 200)) {
    return res.status(400).json({ error: 'Invalid notification IDs' });
  }
  try {
    const db = mongoose.connection.db;
    const notifications = await db.collection('admin_notifications').find({ _id: { $in: ids }, expiresAt: { $gt: new Date() } }, { projection: { _id: 1 } }).toArray();
    const readIds = notifications.map((notification) => notification._id);
    if (readIds.length) {
      await db.collection(req.auth.accountType === 'employee' ? 'employee_accounts' : 'admin_accounts').updateOne(
        { _id: req.auth.actor._id }, { $addToSet: { seenNotificationIds: { $each: readIds } } },
      );
    }
    res.json({ readIds });
  } catch {
    res.status(500).json({ error: 'Unable to mark notifications as read' });
  }
});

router.get('/admin/account-security', (req, res) => {
  res.json({ email: req.auth.actor.email, name: req.auth.actor.name || req.auth.actor.fullName || '' });
});

router.patch('/admin/account-security', async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword ?? '');
    if (!currentPassword) return res.status(400).json({ error: 'Enter your current administrator password.' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid administrator email address.' });
    const passwordError = newPassword ? passwordValidationError(newPassword) : null;
    if (passwordError) return res.status(400).json({ error: passwordError });

    const verification = await verifyAdminPassword(req, currentPassword);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.retryAfterSeconds ? 429 : 401).json({
        error: verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect administrator password.',
        ...(verification.retryAfterSeconds ? { retryAfterSeconds: verification.retryAfterSeconds } : {}),
      });
    }

    const admin = verification.admin;
    const emailChanged = email !== admin.email;
    const passwordChanged = Boolean(newPassword);
    if (!emailChanged && !passwordChanged) return res.status(400).json({ error: 'Enter a new email address or a new password.' });
    if (passwordChanged && await verifySecret(newPassword, admin.passwordHash)) return res.status(400).json({ error: 'Choose a password different from your current password.' });

    const db = mongoose.connection.db;
    if (emailChanged) {
      const [adminConflict, employeeConflict] = await Promise.all([
        db.collection('admin_accounts').findOne({ email, _id: { $ne: admin._id } }, { projection: { _id: 1 } }),
        db.collection('employee_accounts').findOne({ email }, { projection: { _id: 1 } }),
      ]);
      if (adminConflict || employeeConflict) return res.status(409).json({ error: 'That email address is already used by another WORKPULSE MVL account.' });
    }

    const changedAt = new Date();
    const changes = { email, updatedAt: changedAt, credentialsChangedAt: changedAt };
    if (passwordChanged) changes.passwordHash = await hashSecret(newPassword);
    await db.collection('admin_accounts').updateOne({ _id: admin._id, active: true }, { $set: changes });
    const revoked = await db.collection('admin_sessions').deleteMany({ _id: { $ne: req.auth.session._id }, $or: [{ accountType: 'admin', accountId: admin._id }, { adminId: admin._id }] });
    await db.collection('login_otps').deleteMany({ $or: [{ accountType: 'admin', accountId: admin._id }, { adminId: admin._id }] });
    await auditEvent({ req, actor: { ...admin, email }, action: 'auth.admin_credentials_changed', targetType: 'admin_account', targetId: String(admin._id), outcome: 'success', metadata: { emailChanged, passwordChanged, revokedSessions: revoked.deletedCount } });
    res.locals.skipAudit = true;
    res.locals.auditMetadata = { adminAction: 'credentials-updated', emailChanged, passwordChanged, revokedSessions: revoked.deletedCount };
    res.json({ email, emailChanged, passwordChanged, revokedSessions: revoked.deletedCount });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'That email address is already used by another WORKPULSE MVL account.' });
    console.error('Admin credential update failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to update administrator credentials.' });
  }
});

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
    res.locals.auditMetadata = { adminAction: 'system-control-updated', controlChanges: changes };
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
      if (accounts.length) await db.collection('login_otps').deleteMany({ accountType: 'employee', accountId: { $in: accounts.map((account) => account._id) } });
    }
    res.locals.auditMetadata = { adminAction: banned ? 'employee-access-blocked' : 'employee-access-restored', targetName: employee.name, employeeId: employee.id };
    res.json({ id: employee.id, banned });
  } catch { res.status(500).json({ error: 'Unable to update employee access' }); }
});

router.get('/admin/force-clock-out', async (req, res) => {
  try {
    const stamp = kioskTimestamp();
    const records = await mongoose.connection.db.collection('attendance').find({ date: stamp.date }).sort({ name: 1 }).toArray();
    res.json({ date: stamp.date, employees: records.filter((record) => clockOutSessions(record).some((session) => session.checkIn)).map((record) => {
      const sessions = clockOutSessions(record);
      return { employeeId: record.employeeId, name: record.name || record.employeeId, checkIn: sessions[0]?.checkIn, lastCheckIn: sessions.at(-1)?.checkIn, checkOut: sessions.at(-1)?.checkOut || null, clockedIn: sessions.some((session) => session.checkIn && !session.checkOut) };
    }) });
  } catch { res.status(500).json({ error: "Unable to load today's attendance" }); }
});

router.post('/admin/force-clock-out', async (req, res) => {
  const { scope, employeeIds, date } = req.body || {};
  if (!['all', 'individual'].includes(scope) || !Array.isArray(employeeIds) || !employeeIds.length || employeeIds.length > 2000 || employeeIds.some((id) => typeof id !== 'string' || !id || id.length > 200) || (scope === 'individual' && employeeIds.length !== 1)) {
    return res.status(400).json({ error: 'Choose an employee or all clocked-in employees.' });
  }
  const stamp = kioskTimestamp();
  if (date !== stamp.date) return res.status(409).json({ error: 'The day has changed. Refresh the list before clocking out.' });
  let clockedOut = 0;
  const names = [];
  const failedIds = [];
  try {
    const db = mongoose.connection.db;
    const ids = [...new Set(employeeIds)];
    const records = await db.collection('attendance').find({ date: stamp.date, employeeId: { $in: ids } }).toArray();
    for (const record of records) {
      const operation = forcedClockOutUpdate(record, stamp, req.auth.actor.email);
      if (!operation) continue;
      try {
        const result = await db.collection('attendance').updateOne(operation.filter, operation.update);
        if (result.modifiedCount) { clockedOut += 1; names.push(record.name || record.employeeId); }
      } catch { failedIds.push(record.employeeId); }
    }
    const skipped = ids.length - clockedOut - failedIds.length;
    res.locals.auditMetadata = { adminAction: 'force-clock-out', scope, recordCount: clockedOut, skippedCount: skipped, failedCount: failedIds.length, targetName: scope === 'individual' ? records[0]?.name : null, eventTime: stamp.time };
    if (failedIds.length) res.locals.auditOutcome = 'failure';
    res.json({ clockedOut, skipped, failed: failedIds.length, names, time: stamp.time, date: stamp.date });
  } catch (error) {
    res.locals.auditMetadata = { adminAction: 'force-clock-out', scope, recordCount: clockedOut, eventTime: stamp.time };
    console.error('Force clock out failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to complete force clock out. Refresh attendance before retrying.' });
  }
});

router.get('/admin/backup', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collectionNames = BACKUP_COLLECTIONS;
    const collections = {};
    for (const name of collectionNames) {
      collections[name] = await db.collection(name).find({}).toArray();
    }
    const createdAt = new Date();
    const backup = { format: 'workpulse-json-backup', version: 2, createdAt, createdBy: req.auth.actor.email, collections };
    const filename = `workpulse-backup-${createdAt.toISOString().replace(/[:.]/g, '-')}.json`;
    await auditEvent({ req, actor: req.auth.actor, action: 'admin.backup_created', targetType: 'database_backup', outcome: 'success', metadata: { collections: collectionNames, filename } });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(serializeBackup(backup));
  } catch (error) {
    console.error('Backup generation failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to generate the database backup' });
  }
});

router.get('/ai-insights', async (req, res) => {
  try {
    if (req.query.refresh !== '1' && aiInsightsCache.value && aiInsightsCache.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(aiInsightsCache.value);
    }
    const db = mongoose.connection.db;
    const employeeIds = await visibleEmployeeIds(db);
    const employeeIdSet = new Set(employeeIds);
    const attendanceStart = new Date();
    attendanceStart.setUTCFullYear(attendanceStart.getUTCFullYear() - 1);
    const attendanceStartDate = attendanceStart.toISOString().slice(0, 10);
    const [attendance, employees, leaveRequests, verificationAttempts, evaluationTrials, settings, idleDays] = await Promise.all([
      db.collection('attendance').find({ employeeId: { $in: employeeIds }, date: { $gte: attendanceStartDate } }).sort({ date: 1 }).toArray(),
      db.collection('employees').find({ id: { $in: employeeIds } }).toArray(),
      db.collection('leave_requests').find({ employeeId: { $in: employeeIds }, status: 'approved', endDate: { $gte: attendanceStartDate } }).toArray(),
      db.collection('biometric_verification_attempts').find({}).sort({ createdAt: -1 }).limit(500).toArray(),
      db.collection('biometric_evaluation_trials').find({}).sort({ createdAt: -1 }).limit(1000).toArray(),
      getSettings(db),
      db.collection('idle_days').find({ date: { $gte: attendanceStartDate } }, { projection: { _id: 0, date: 1 } }).toArray(),
    ]);
    const legacyIdentificationTrials = verificationAttempts.filter((attempt) => attempt.source === 'admin-identification').map((attempt) => ({
      ...attempt, id: String(attempt._id), mode: 'automatic-identification', expectedType: 'automatic',
      expectedEmployeeId: null, expectedEmployeeName: null, actualEmployeeId: attempt.employeeId || null,
      actualEmployeeName: employees.find((employee) => employee.id === attempt.employeeId)?.name || null,
      classification: null,
    }));
    const visibleVerificationAttempts = verificationAttempts.filter((attempt) => attempt.source !== 'admin-identification' && (!attempt.employeeId || employeeIdSet.has(attempt.employeeId)));
    const visibleEvaluationTrials = [...evaluationTrials, ...legacyIdentificationTrials].filter((trial) =>
      (!trial.expectedEmployeeId || employeeIdSet.has(trial.expectedEmployeeId))
      && (!trial.actualEmployeeId || employeeIdSet.has(trial.actualEmployeeId))).sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
    const insights = buildAIInsights({ attendance, employees, leaveRequests, verificationAttempts: visibleVerificationAttempts, evaluationTrials: visibleEvaluationTrials, schedule: { ...settings.shift, idleDates: idleDays.map((day) => day.date) }, fingerJetThreshold: fingerprintMatchThreshold() });
    aiInsightsCache = { value: insights, expiresAt: Date.now() + AI_INSIGHTS_CACHE_MS };
    res.setHeader('X-Cache', 'MISS');
    res.json(insights);
  } catch (error) {
    console.error('AI insights generation failed:', error);
    res.status(500).json({ error: 'Unable to generate Insights right now.' });
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
      matchStrength: fingerprintMatchStrength(decision.best?.score, decision.threshold),
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

const employeeFields = ['id', 'firstName', 'lastName', 'name', 'role', 'status', 'grossSalary', 'hoursWorked', 'hourlyRate', 'hourlyRateOverride', 'email', 'phone', 'address', 'identifiers', 'salaryAddition'];
const employeeRoleLabel = (role) => ({ regular: 'Regular', extra: 'Extra', manager: 'Manager', supervisor: 'Supervisor' })[role] ?? 'Regular';

function serializedAuditEvent(event) {
  return {
    id: String(event._id),
    occurredAt: event.occurredAt,
    actorEmail: event.actorEmail ?? null,
    actorRole: event.actorRole ?? 'anonymous',
    screenName: auditScreenName(event.action, event.targetType, event.metadata),
    action: event.action ?? 'unknown',
    targetType: event.targetType ?? 'system',
    targetId: event.targetId ?? null,
    outcome: event.outcome ?? 'unknown',
    metadata: event.metadata ?? {},
    ...auditPresentation(event),
  };
}

router.get('/overview', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).json({ error: 'Database is unavailable' });
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const today = kioskTimestamp().date;
    const performanceDate = datePattern.test(String(req.query.performanceDate || '')) ? String(req.query.performanceDate) : today;
    const auditDate = datePattern.test(String(req.query.auditDate || '')) ? String(req.query.auditDate) : today;
    const rangeStart = new Date(`${performanceDate}T00:00:00Z`);
    rangeStart.setUTCMonth(rangeStart.getUTCMonth() - 6);
    const attendanceStart = rangeStart.toISOString().slice(0, 10);
    const auditStart = new Date(`${auditDate}T00:00:00+08:00`);
    const auditEnd = new Date(auditStart.getTime() + 86_400_000);
    const currentPeriod = payrollPeriodKey();
    const employeeProjection = { id: 1, role: 1, status: 1, createdAt: 1 };
    const [settings, employees] = await Promise.all([
      getSettings(db),
      db.collection('employees').find({ archived: { $ne: true } }, { projection: employeeProjection }).toArray(),
    ]);
    const employeeIds = employees.map((employee) => employee.id).filter(Boolean);
    const [attendance, payroll, leaveRequests, biometricTemplates, auditEvents] = await Promise.all([
      db.collection('attendance').find(
        { employeeId: { $in: employeeIds }, date: { $gte: attendanceStart, $lte: performanceDate } },
        { projection: { employeeId: 1, name: 1, role: 1, date: 1, checkIn: 1, checkOut: 1, sessions: 1, status: 1, idleDay: 1 } },
      ).sort({ date: -1 }).limit(10_000).toArray(),
      db.collection('payroll_requests').find(
        { employeeId: { $in: employeeIds }, periodStart: currentPeriod },
        { projection: { status: 1, periodStart: 1 } },
      ).limit(2_000).toArray(),
      db.collection('leave_requests').find(
        { employeeId: { $in: employeeIds }, $or: [{ status: 'pending' }, { startDate: { $lte: performanceDate }, endDate: { $gte: attendanceStart } }] },
        { projection: { id: 1, employeeId: 1, startDate: 1, endDate: 1, approvedDates: 1, totalDays: 1, status: 1 } },
      ).sort({ createdAt: -1 }).limit(2_000).toArray(),
      db.collection('biometric_templates').find({ employeeId: { $in: employeeIds } }, { projection: { employeeId: 1 } }).toArray(),
      db.collection('audit_events').find(
        { ...activityFilter, occurredAt: { $gte: auditStart, $lt: auditEnd } },
        { projection: { occurredAt: 1, actorEmail: 1, actorRole: 1, screenName: 1, action: 1, targetType: 1, targetId: 1, outcome: 1, metadata: 1 } },
      ).sort({ occurredAt: -1, _id: -1 }).limit(100).toArray(),
    ]);
    const enrolledIds = new Set(biometricTemplates.map((item) => item.employeeId));
    const onLeaveToday = new Set(leaveRequests.filter((leave) => leave.status === 'approved' && (Array.isArray(leave.approvedDates) && leave.approvedDates.length ? leave.approvedDates.includes(today) : leave.startDate <= today && leave.endDate >= today)).map((leave) => leave.employeeId));
    res.json({
      employees: employees.map((employee) => ({
        role: employee.role,
        status: employee.status === 'inactive' ? 'inactive' : onLeaveToday.has(employee.id) ? 'on-leave' : 'active',
        biometricStatus: enrolledIds.has(employee.id) ? 'enrolled' : 'none',
        createdAt: employee.createdAt,
      })),
      payroll,
      attendance: attendance.map((record) => ({
        employeeId: record.employeeId, name: record.name, role: record.role, date: record.date,
        checkIn: record.checkIn, checkOut: record.checkOut, worked: attendanceSessions(record).length > 0, status: attendanceArrivalStatus(record, settings),
      })),
      leaveRequests,
      auditEvents: auditEvents.map(serializedAuditEvent),
    });
  } catch (error) {
    console.error('Overview fetch failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to load overview data' });
  }
});

router.get('/audit-events', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ error: 'Database is unavailable' });
    const requestedLimit = Number.parseInt(String(req.query.limit ?? '20'), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 20;
    const date = String(req.query.date ?? '').trim();
    const filter = { ...activityFilter };
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Audit date must use YYYY-MM-DD format' });
      const start = new Date(`${date}T00:00:00+08:00`);
      const end = new Date(start.getTime() + 86_400_000);
      filter.occurredAt = { $gte: start, $lt: end };
    }
    const events = await db.collection('audit_events').find(filter).sort({ occurredAt: -1, _id: -1 }).limit(limit).toArray();
    res.json(events.map(serializedAuditEvent));
  } catch (error) {
    console.error('Audit event fetch failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

function normalizedEmployee(input) {
  const employee = pick(input ?? {}, employeeFields);
  employee.id = String(employee.id ?? '').trim().slice(0, 40);
  employee.firstName = normalizeName(employee.firstName);
  employee.lastName = normalizeName(employee.lastName);
  employee.name = `${employee.firstName} ${employee.lastName}`.trim() || String(employee.name ?? '').trim().slice(0, 120);
  employee.role = ['regular', 'extra', 'manager', 'supervisor'].includes(employee.role) ? employee.role : 'regular';
  employee.status = employee.status === 'inactive' ? 'inactive' : 'active';
  if (employee.email != null) employee.email = String(employee.email).trim().toLowerCase();
  if (employee.phone != null) employee.phone = String(employee.phone).trim().slice(0, 30);
  if (employee.address != null) employee.address = String(employee.address).trim();
  employee.grossSalary = Math.max(0, Number(employee.grossSalary || 0));
  employee.hoursWorked = Math.max(0, Number(employee.hoursWorked || 0));
  employee.hourlyRate = Math.max(0, Number(employee.hourlyRate || 0));
  employee.hourlyRateOverride = employee.hourlyRateOverride == null || employee.hourlyRateOverride === '' ? null : Number(employee.hourlyRateOverride);
  employee.identifiers = Array.isArray(employee.identifiers) ? employee.identifiers.slice(0, 20).map((item) => ({ type: String(item?.type ?? '').slice(0, 50), value: String(item?.value ?? '').slice(0, 100), amount: Math.max(0, Number(item?.amount || 0)), frequency: additionFrequency(item) })) : [];
  employee.salaryAddition = { amount: Number(employee.salaryAddition?.amount ?? combinedSalaryAddition(employee).amount), frequency: additionFrequency(employee.salaryAddition || combinedSalaryAddition(employee)) };
  employee.identifiers = employee.identifiers.map(item => ({ ...item, amount: 0 }));
  return employee;
}

function salaryAdditionValidationError(value) {
  if (value === undefined) return null;
  if (!value || !validBoundedNumber(value.amount, 0, ADDITION_MAX)) return 'Owner-funded addition must be from 0 to 1,000,000 with at most 2 decimal places.';
  if (value.frequency !== 'quarterly') return 'Owner-funded additions are paid quarterly.';
  return null;
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
  if (fields.includes('email')) return 'This email address is already used by another WORKPULSE MVL account.';
  if (fields.includes('employeeId')) return 'The generated employee ID is still reserved by linked account or fingerprint data. Refresh the form and try again.';
  if (fields.includes('id')) return 'The generated employee ID is already in use. Refresh the form and try again.';
  return 'A unique employee account value already exists. Refresh the form and try again.';
}

const defaultSettings = {
  shift: { enabled: true, startTime: '06:00', workStopTime: '18:00', autoClockOutTime: '21:00', workDays: 7, workWeekdays: [0, 1, 2, 3, 4, 5, 6], scheduleOverrides: [] },
  payroll: { hourlyRates: { regular: 50, extra: 40, manager: 50, supervisor: 50 }, cashAdvanceMax: 1000 },
};

function configuredHourlyRate(employee, settings) {
  if (Number.isFinite(employee?.hourlyRateOverride) && employee.hourlyRateOverride > 0) return employee.hourlyRateOverride;
  const role = String(employee?.role ?? '').toLowerCase();
  const rates = settings?.payroll?.hourlyRates;
  if (role === 'extra') return Number(rates?.extra ?? defaultSettings.payroll.hourlyRates.extra);
  if (role === 'manager' || role === 'supervisor') return Number(rates?.[role] ?? rates?.regular ?? defaultSettings.payroll.hourlyRates.regular);
  return Number(rates?.regular ?? defaultSettings.payroll.hourlyRates.regular);
}

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

function clockMinutes(time) {
  if (!time) return null;
  const match = String(time).match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]?.toUpperCase() === 'PM' && hour < 12) hour += 12;
  if (match[3]?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null;
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

function attendanceHoursForRecord(record, settings, calculationStart = null) {
  const calculationStartTime = calculationStart ? new Date(calculationStart).getTime() : 0;
  const rawHours = attendanceSessions(record).filter((session) => {
    if (!calculationStartTime) return true;
    const sessionStartedAt = new Date(session.checkInAt ?? record.createdAt ?? record.updatedAt ?? 0).getTime();
    return Number.isFinite(sessionStartedAt) && sessionStartedAt > calculationStartTime;
  }).reduce((total, session) => {
    const checkIn = parseAttendanceTime(record.date, session.checkIn);
    const checkOut = parseAttendanceTime(record.date, session.checkOut);
    if (!checkIn || !checkOut) return total;
    if (checkOut <= checkIn) checkOut.setDate(checkOut.getDate() + 1);
    return total + Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3600000);
  }, 0);
  return Math.max(0, rawHours);
}

function validAttendanceDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function attendancePayForRecord(record, fallbackRate, calculationStart = null) {
  const resetTime = calculationStart ? new Date(calculationStart).getTime() : 0;
  return attendanceSessions(record).reduce((result, session) => {
    const startedAt = new Date(session.checkInAt ?? record.createdAt ?? record.updatedAt ?? 0).getTime();
    if (resetTime && (!Number.isFinite(startedAt) || startedAt <= resetTime)) return result;
    const checkIn = parseAttendanceTime(record.date, session.checkIn);
    const checkOut = parseAttendanceTime(record.date, session.checkOut);
    if (!checkIn || !checkOut) return result;
    if (checkOut <= checkIn) checkOut.setDate(checkOut.getDate() + 1);
    const shiftStart = parseAttendanceTime(record.date, session.workStartTime);
    const workStop = parseAttendanceTime(record.date, session.workStopTime);
    const overtimeStop = parseAttendanceTime(record.date, session.overtimeStopTime);
    if (shiftStart && overtimeStop && overtimeStop <= shiftStart && checkIn < shiftStart && checkIn.getHours() * 60 + checkIn.getMinutes() < clockMinutes(session.overtimeStopTime)) {
      shiftStart.setDate(shiftStart.getDate() - 1);
    }
    if (shiftStart && workStop && workStop <= shiftStart) workStop.setDate(workStop.getDate() + 1);
    if (shiftStart && overtimeStop && overtimeStop <= shiftStart) overtimeStop.setDate(overtimeStop.getDate() + 1);
    const paidEnd = overtimeStop && overtimeStop < checkOut ? overtimeStop : checkOut;
    const hours = Math.max(0, (paidEnd.getTime() - checkIn.getTime()) / 3600000);
    const overtimeHours = workStop ? Math.min(hours, Math.max(0, (paidEnd.getTime() - Math.max(checkIn.getTime(), workStop.getTime())) / 3600000)) : 0;
    const rate = Number.isFinite(session.hourlyRate) && session.hourlyRate > 0 ? session.hourlyRate : fallbackRate;
    result.hours += hours;
    result.regularHours += hours - overtimeHours;
    result.overtimeHours += overtimeHours;
    result.amount += hours * rate;
    const line = result.rateLines.find(item => item.rate === rate);
    if (line) line.hours += hours;
    else result.rateLines.push({ rate, hours });
    return result;
  }, { hours: 0, regularHours: 0, overtimeHours: 0, amount: 0, rateLines: [] });
}

function attendancePaySummary(records, fallbackRate, calculationStart = null) {
  const pay = records.map(record => attendancePayForRecord(record, fallbackRate, calculationStart));
  const rates = new Map();
  for (const record of pay) for (const line of record.rateLines) rates.set(line.rate, (rates.get(line.rate) || 0) + line.hours);
  const rateBreakdown = [...rates].map(([rate, hours]) => ({ rate, hours: Math.round(hours * 100) / 100, amount: Math.round(hours * rate * 100) / 100 }));
  return {
    hoursWorked: Math.round(pay.reduce((sum, record) => sum + record.hours, 0) * 100) / 100,
    regularHours: Math.round(pay.reduce((sum, record) => sum + record.regularHours, 0) * 100) / 100,
    overtimeHours: Math.round(pay.reduce((sum, record) => sum + record.overtimeHours, 0) * 100) / 100,
    grossAmount: Math.round(rateBreakdown.reduce((sum, line) => sum + line.amount, 0) * 100) / 100,
    rateBreakdown,
  };
}

export async function snapshotAttendanceRates(db, employees, settings) {
  if (!employees.length) return;
  const records = await db.collection('attendance').find({ employeeId: { $in: employees.map(item => item.id) } }).toArray();
  const rates = new Map(employees.map(item => [item.id, configuredHourlyRate(item, settings)]));
  for (const record of records) {
    const sessions = attendanceSessions(record);
    if (!sessions.some(session => session.checkIn && !Number.isFinite(session.hourlyRate))) continue;
    const rate = rates.get(record.employeeId);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Unable to save the existing attendance rate.');
    const result = await db.collection('attendance').updateOne(
      { _id: record._id, updatedAt: record.updatedAt ?? { $exists: false }, sessions: record.sessions ?? { $exists: false } },
      { $set: { sessions: sessions.map(session => Number.isFinite(session.hourlyRate) ? session : { ...session, hourlyRate: rate }) } },
    );
    if (result.modifiedCount !== 1) throw new Error('Attendance changed while saving rates. Retry the rate change.');
  }
}

export async function getSettings(db) {
  const stored = await db.collection('settings').findOne({ key: 'company' });
  const storedShift = stored?.shift ?? {};
  const workDays = Math.min(7, Math.max(1, Number(storedShift.workDays ?? defaultSettings.shift.workDays)));
  const fallbackWorkWeekdays = Array.from({ length: workDays }, (_, index) => index + 1).map((day) => day === 7 ? 0 : day);
  const storedWorkWeekdays = Array.isArray(storedShift.workWeekdays) ? [...new Set(storedShift.workWeekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))] : fallbackWorkWeekdays;
  return {
    shift: {
      enabled: true,
      startTime: storedShift.startTime ?? defaultSettings.shift.startTime,
      workStopTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(storedShift.workStopTime) ? storedShift.workStopTime : /^([01]\d|2[0-3]):[0-5]\d$/.test(storedShift.autoClockOutTime) ? storedShift.autoClockOutTime : defaultSettings.shift.workStopTime,
      autoClockOutTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(storedShift.autoClockOutTime) ? storedShift.autoClockOutTime : defaultSettings.shift.autoClockOutTime,
      workDays,
      workWeekdays: storedWorkWeekdays.length === workDays ? storedWorkWeekdays : fallbackWorkWeekdays,
      scheduleOverrides: Array.isArray(storedShift.scheduleOverrides) ? storedShift.scheduleOverrides.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.date) && typeof entry?.working === 'boolean').slice(0, 366).map((entry) => ({ date: entry.date, working: entry.working, kind: ['holiday', 'rest-day', 'workday'].includes(entry.kind) ? entry.kind : entry.working ? 'workday' : 'rest-day' })) : [],
    },
    payroll: {
      cashAdvanceMax: Number(stored?.payroll?.cashAdvanceMax ?? defaultSettings.payroll.cashAdvanceMax),
      hourlyRates: {
        regular: Number(stored?.payroll?.hourlyRates?.regular ?? defaultSettings.payroll.hourlyRates.regular),
        extra: Number(stored?.payroll?.hourlyRates?.extra ?? defaultSettings.payroll.hourlyRates.extra),
        manager: Number(stored?.payroll?.hourlyRates?.manager ?? stored?.payroll?.hourlyRates?.regular ?? defaultSettings.payroll.hourlyRates.manager),
        supervisor: Number(stored?.payroll?.hourlyRates?.supervisor ?? stored?.payroll?.hourlyRates?.regular ?? defaultSettings.payroll.hourlyRates.supervisor),
      },
    },
  };
}

export function attendanceArrivalStatus(record, settings) {
  if (record?.status === 'Absent' || record?.status === 'On Leave') return record.status;
  if (record?.idleDay) return 'Idle';
  if (attendanceSessions(record).length || record?.checkIn || record?.status === 'Late') return 'Present';
  return record?.status || 'Present';
}

export async function enforceAutomaticClockOut(db, settings) {
  if (!settings.shift.enabled || clockMinutes(settings.shift.autoClockOutTime) == null) return;
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
    const automaticOut = parseAttendanceTime(record.date, sessions[openSessionIndex].overtimeStopTime || settings.shift.autoClockOutTime);
    if (!automaticOut) return;
    // A configured time earlier than the session start belongs to the following day (night shift support).
    if (automaticOut <= checkIn) automaticOut.setDate(automaticOut.getDate() + 1);
    if (automaticOut > now) return;
    if (!checkoutIsChronological(record.date, sessions[openSessionIndex], automaticOut)) return;
    const automaticOutTime = formatAttendanceTime(automaticOut);
    sessions[openSessionIndex] = { ...sessions[openSessionIndex], checkOut: automaticOutTime, checkOutAt: automaticOut, autoClockedOut: true };
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
    const verification = await verifyAdminPassword(req, incoming.adminPassword);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({
        error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect administrator password.',
        ...(verification.retryAfterSeconds ? { retryAfterSeconds: verification.retryAfterSeconds } : {}),
      });
    }
    const numberError = settingsNumbersValidationError(incoming);
    if (numberError) return res.status(400).json({ error: numberError });
    const cashAdvanceMax = Number(incoming.payroll?.cashAdvanceMax);
    if (incoming.payroll?.cashAdvanceMax !== undefined && (!Number.isFinite(cashAdvanceMax) || cashAdvanceMax < 1 || cashAdvanceMax > 1_000_000 || Math.round(cashAdvanceMax * 100) !== cashAdvanceMax * 100)) return res.status(400).json({ error: 'Set the cash advance limit from ₱1 to ₱1,000,000, with up to 2 decimal places.' });
    const numberInRange = (value, fallback, minimum, maximum) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
    };
    const db = mongoose.connection.db;
    const currentSettings = await getSettings(db);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const incomingOverrides = Array.isArray(incoming.shift?.scheduleOverrides) ? incoming.shift.scheduleOverrides.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.date) && typeof entry?.working === 'boolean').slice(0, 366).map((entry) => ({ date: entry.date, working: entry.working, kind: ['holiday', 'rest-day', 'workday'].includes(entry.kind) ? entry.kind : entry.working ? 'workday' : 'rest-day' })) : [];
    const lockedPastOverrides = currentSettings.shift.scheduleOverrides.filter((entry) => entry.date < today);
    const editableOverrides = incomingOverrides.filter((entry) => entry.date >= today);
    const scheduleOverrides = [...new Map([...lockedPastOverrides, ...editableOverrides].map((entry) => [entry.date, entry])).values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 366);
    const normalized = {
      shift: {
        enabled: true,
        startTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(incoming.shift?.startTime) ? incoming.shift.startTime : defaultSettings.shift.startTime,
        workStopTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(incoming.shift?.workStopTime) ? incoming.shift.workStopTime : currentSettings.shift.workStopTime,
        autoClockOutTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(incoming.shift?.autoClockOutTime) ? incoming.shift.autoClockOutTime : defaultSettings.shift.autoClockOutTime,
        workDays: numberInRange(incoming.shift?.workDays, 7, 1, 7),
        workWeekdays: Array.isArray(incoming.shift?.workWeekdays) ? [...new Set(incoming.shift.workWeekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))] : defaultSettings.shift.workWeekdays,
        scheduleOverrides,
      },
      payroll: {
        cashAdvanceMax: Number(incoming.payroll?.cashAdvanceMax ?? currentSettings.payroll.cashAdvanceMax),
        hourlyRates: {
          regular: numberInRange(incoming.payroll?.hourlyRates?.regular, defaultSettings.payroll.hourlyRates.regular, 1, 10000),
          extra: numberInRange(incoming.payroll?.hourlyRates?.extra, defaultSettings.payroll.hourlyRates.extra, 1, 10000),
          manager: numberInRange(incoming.payroll?.hourlyRates?.manager, defaultSettings.payroll.hourlyRates.manager, 1, 10000),
          supervisor: numberInRange(incoming.payroll?.hourlyRates?.supervisor, defaultSettings.payroll.hourlyRates.supervisor, 1, 10000),
        },
      },
    };
    const timeError = workHourOrderError(normalized.shift.startTime, normalized.shift.workStopTime, normalized.shift.autoClockOutTime);
    if (timeError) return res.status(400).json({ error: timeError });
    if (normalized.shift.workWeekdays.length !== normalized.shift.workDays) return res.status(400).json({ error: `Select exactly ${normalized.shift.workDays} regular workdays.` });
    const rateEmployees = await db.collection('employees').find({ archived: { $ne: true } }).toArray();
    const changingRates = rateEmployees.filter(employee => configuredHourlyRate(employee, currentSettings) !== configuredHourlyRate(employee, normalized));
    await snapshotAttendanceRates(db, changingRates, currentSettings);
    await mongoose.connection.db.collection('settings').updateOne({ key: 'company' }, { $set: { ...normalized, updatedAt: new Date() }, $unset: { lateness: '' } }, { upsert: true });
    await enforceAutomaticClockOut(mongoose.connection.db, normalized);
    const clearedIdleDays = await reconcileIdleDaysWithSchedule(db, normalized, today);
    await reconcileLeaveWithSchedule(mongoose.connection.db, normalized);
    await enforceAutomaticAbsences(mongoose.connection.db, normalized);
    const currentPeriod = payrollPeriodKey();
    const recalculablePayroll = await mongoose.connection.db.collection('payroll_requests').find({ periodStart: currentPeriod, status: { $in: ['processing', 'rejected'] } }, { projection: { employeeId: 1 } }).toArray();
    if (recalculablePayroll.length) {
      const employees = await mongoose.connection.db.collection('employees').find({ id: { $in: recalculablePayroll.map((record) => record.employeeId) }, archived: { $ne: true } }).toArray();
      for (const employee of employees) await preparePayrollRecord(mongoose.connection.db, employee, currentPeriod, normalized);
    }
    res.json({ ...normalized, clearedIdleDays });
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
    const employeeIds = employees.map((employee) => employee.id).filter(Boolean);
    const today = kioskTimestamp().date;
    const periodStart = currentPayrollPeriodStart();
    const [attendance, biometricTemplates, approvedLeavesToday] = await Promise.all([
      db.collection('attendance').find(
        { employeeId: { $in: employeeIds }, date: { $gte: periodStart.toISOString().slice(0, 10) } },
        { projection: { employeeId: 1, date: 1, checkIn: 1, checkOut: 1, sessions: 1 } },
      ).toArray(),
      db.collection('biometric_templates').find({ employeeId: { $in: employeeIds } }, { projection: { employeeId: 1 } }).toArray(),
      db.collection('leave_requests').find({ employeeId: { $in: employeeIds }, status: 'approved', $or: [{ approvedDates: today }, { approvedDates: { $exists: false }, startDate: { $lte: today }, endDate: { $gte: today } }] }, { projection: { employeeId: 1 } }).toArray(),
    ]);
    const enrolledEmployeeIds = new Set(biometricTemplates.map((template) => template.employeeId));
    const employeesOnLeaveToday = new Set(approvedLeavesToday.map((leave) => leave.employeeId));

    res.json(
      employees.map((e) => {
        const records = attendance.filter((record) => record.employeeId === e.id && new Date(record.date) >= periodStart);
        const hoursWorked = records.reduce((total, record) => total + attendanceHoursForRecord(record, settings), 0);
        const hourlyRate = configuredHourlyRate(e, settings);
        const calculatedGross = attendancePaySummary(records, hourlyRate).grossAmount;
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
        status: e.status === 'inactive' ? 'inactive' : employeesOnLeaveToday.has(e.id) ? 'on-leave' : 'active',
        banned: Boolean(e.banned),
        biometricStatus: enrolledEmployeeIds.has(e.id) ? 'enrolled' : 'none',
        email: e.email,
        phone: e.phone,
        address: e.address,
        createdAt: e.createdAt,
        identifiers: e.identifiers ?? [],
        salaryAddition: combinedSalaryAddition(e),
        salaryAdditionNeedsReview: !e.salaryAddition && combinedSalaryAddition(e).amount > ADDITION_MAX,
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

router.post('/fingerprints/check-enrollment', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const fingerprintSamples = normalizeFingerprintSamples(req.body?.fingerprintSamples, 3);
    const enrollment = await validateEnrollmentSamples(fingerprintSamples);
    await rejectDuplicateEnrollment(db, enrollment.templates);
    res.json({ available: true });
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    console.error('Fingerprint availability check failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'The fingerprint could not be checked. Capture three new scans and try again.' });
  }
});

router.post('/fingerprints/check-scan', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const [fingerprintSample] = normalizeFingerprintSamples(req.body?.fingerprintSamples, 1);
    const storedTemplates = await db.collection('biometric_templates').find({}).toArray();
    const duplicate = storedTemplates.length ? await findFingerprintMatch(fingerprintSample, storedTemplates) : null;
    if (duplicate) return res.status(409).json({ error: 'This fingerprint is already registered. Use a different finger that is not saved in the system.' });
    res.json({ available: true });
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    console.error('Fingerprint scan check failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'The fingerprint could not be checked. Please scan again.' });
  }
});

router.post('/fingerprints/identify', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const [fingerprintSample] = normalizeFingerprintSamples(req.body?.fingerprintSamples, 1);
    const deviceUid = String(req.body?.deviceUid ?? '').trim().slice(0, 200);
    const templates = await activeBiometricTemplates(db);
    const startedAt = Date.now();
    const decision = await findFingerprintDecision(fingerprintSample, templates);
    const responseTimeMs = Date.now() - startedAt;
    if (!decision.accepted || !decision.best?.employeeId) {
      await db.collection('biometric_evaluation_trials').insertOne({
        id: crypto.randomUUID(), mode: 'automatic-identification', expectedType: 'automatic',
        expectedEmployeeId: null, expectedEmployeeName: null, actualEmployeeId: null, actualEmployeeName: null,
        accepted: false, classification: null, score: decision.best?.score ?? null, threshold: decision.threshold,
        deviceUid: deviceUid || null, responseTimeMs, createdAt: new Date(), createdBy: req.auth.actor.email,
      });
      res.locals.auditMetadata = { fingerprintRecognized: false };
      res.locals.auditOutcome = 'failure';
      return res.json({ recognized: false, employeeId: null, employeeName: null, matchStrength: fingerprintMatchStrength(decision.best?.score, decision.threshold) });
    }
    const employee = await db.collection('employees').findOne(
      { id: decision.best.employeeId, archived: { $ne: true }, banned: { $ne: true }, status: { $ne: 'inactive' } },
      { projection: { _id: 0, id: 1, name: 1 } },
    );
    if (!employee) return res.status(404).json({ error: 'The matching employee account is not active.' });
    await db.collection('biometric_evaluation_trials').insertOne({
      id: crypto.randomUUID(), mode: 'automatic-identification', expectedType: 'automatic',
      expectedEmployeeId: null, expectedEmployeeName: null, actualEmployeeId: employee.id, actualEmployeeName: employee.name,
      accepted: true, classification: null, score: decision.best.score, threshold: decision.threshold,
      deviceUid: deviceUid || null, responseTimeMs, createdAt: new Date(), createdBy: req.auth.actor.email,
    });
    res.locals.auditMetadata = { fingerprintRecognized: true, targetName: employee.name, employeeId: employee.id };
    res.json({
      recognized: true, employeeId: employee.id, employeeName: employee.name,
      matchStrength: fingerprintMatchStrength(decision.best.score, decision.threshold),
    });
  } catch (error) {
    if (error instanceof BiometricError) return res.status(error.status).json({ error: error.message });
    console.error('Fingerprint identification failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'The fingerprint could not be identified. Please try again.' });
  }
});

router.post('/employees/email-verification', rateLimit({ windowMs: 10 * 60_000, max: 5, keyPrefix: 'employee-email-verification' }), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!(await getSystemControls(db)).registrationOpen) return res.status(403).json({ error: 'New employee registration is currently restricted in Admin Controls' });
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid employee email address.' });
    if (!emailConfigured()) return res.status(503).json({ error: 'Employee email delivery is not configured.' });
    const existing = await Promise.all(['employees', 'employee_accounts', 'admin_accounts'].map((name) => db.collection(name).findOne({ email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } })));
    if (existing.some(Boolean)) return res.status(409).json({ error: 'This email address is already used by another WORKPULSE MVL account.' });
    const verificationId = crypto.randomUUID();
    const code = String(crypto.randomInt(100000, 1_000_000));
    const records = db.collection('employee_email_verifications');
    await records.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await records.insertOne({ verificationId, email, requestedBy: req.auth.actor.email, codeHash: await hashSecret(code), attempts: 0, expiresAt: new Date(Date.now() + 10 * 60_000) });
    try {
      const transport = createEmailTransport();
      const delivery = await transport.sendMail({
        from: `WORKPULSE MVL <${process.env.SMTP_USER}>`, to: email,
        subject: 'Verify your email for WORKPULSE MVL employee registration',
        text: `Your employee registration code is ${code}. It expires in 10 minutes. Give this code to the administrator assisting with your registration. Your account will only be created after this code is entered. If you did not request an employee account, ignore this email.`,
      });
      if (!(delivery.accepted ?? []).some((address) => String(address).toLowerCase() === email)) throw new Error('Recipient not accepted');
    } catch (error) {
      await records.deleteOne({ verificationId });
      throw error;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Employee registration verification code for ${email}: ${code}`);
    }
    res.json({ verificationId, message: 'Ask the employee for the code in their email. No account has been created yet.' });
  } catch (error) {
    console.error('Employee verification email failed:', error instanceof Error ? error.message : error);
    res.status(502).json({ error: 'Unable to send the verification email. Check the address and try again. No account was created.' });
  }
});

router.post('/employees', async (req, res) => {
  try {
    if (!(await getSystemControls(mongoose.connection.db)).registrationOpen) return res.status(403).json({ error: 'New employee registration is currently restricted in Admin Controls' });
    const identifierError = identifiersValidationError(req.body?.identifiers);
    if (identifierError) return res.status(400).json({ error: identifierError });
    const additionError = salaryAdditionValidationError(req.body?.salaryAddition);
    if (additionError) return res.status(400).json({ error: additionError });
    const employee = normalizedEmployee(req.body);
    employee.salaryAddition = scheduleSalaryAddition(null, employee.salaryAddition);
    const validationError = employeeValidationError(employee);
    if (validationError) return res.status(400).json({ error: validationError });
    if (!employee.firstName || !employee.lastName) return res.status(400).json({ error: 'First name and last name are required' });
    if (!employee.email || !employee.phone || !employee.address) return res.status(400).json({ error: 'Email, phone number, and address are required' });
    if (!/^\+639\d{9}$/.test(employee.phone)) return res.status(400).json({ error: 'Phone number must use +639XXXXXXXXX with no spaces' });
    if (!emailConfigured()) return res.status(503).json({ error: 'Employee email delivery is not configured. Ask the system owner to configure email delivery before creating an account.' });
    const db = mongoose.connection.db;
    const verificationId = String(req.body?.emailVerificationId ?? '');
    const code = String(req.body?.emailVerificationCode ?? '').trim();
    if (!verificationId || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit registration code received by the employee before creating the account.' });
    const verification = await db.collection('employee_email_verifications').findOneAndUpdate(
      { verificationId, email: employee.email, requestedBy: req.auth.actor.email, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } },
      { $inc: { attempts: 1 } }, { returnDocument: 'after' },
    );
    if (!verification || !(await verifySecret(code, verification.codeHash))) return res.status(400).json({ error: 'The registration code is incorrect, expired, or has reached its attempt limit. Check the code or request a new one.' });
    const [adminEmail, employeeAccountEmail, employeeRecordEmail] = await Promise.all([
      db.collection('admin_accounts').findOne({ email: employee.email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
      db.collection('employee_accounts').findOne({ email: employee.email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
      db.collection('employees').findOne({ email: employee.email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
    ]);
    if (adminEmail || employeeAccountEmail || employeeRecordEmail) return res.status(409).json({ error: 'This email address is already used by another WORKPULSE MVL account.' });
    const transport = createEmailTransport();
    try { await transport.verify(); }
    catch (emailError) {
      console.error('Employee email service verification failed:', emailError instanceof Error ? emailError.message : emailError);
      return res.status(503).json({ error: 'The employee email service is unavailable. No account was created. Check the email provider settings and restart the backend.' });
    }
    const suppliedSamples = req.body?.fingerprintSamples;
    const skipFingerprint = suppliedSamples == null || (Array.isArray(suppliedSamples) && suppliedSamples.length === 0);
    const fingerprintSamples = skipFingerprint ? [] : normalizeFingerprintSamples(suppliedSamples, 3);
    const deviceUid = String(req.body?.fingerprintDeviceUid ?? '').trim().slice(0, 200);
    const enrollment = skipFingerprint ? null : await validateEnrollmentSamples(fingerprintSamples);
    employee.id = await nextEmployeeId(db);
    if (enrollment) await rejectDuplicateEnrollment(db, enrollment.templates);
    const biometricStatus = enrollment ? 'enrolled' : 'none';
    const createdAt = new Date();
    const generatedPassword = generateTemporaryPassword();
    const passwordHash = await hashSecret(generatedPassword);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const consumed = await db.collection('employee_email_verifications').deleteOne({ _id: verification._id, expiresAt: { $gt: new Date() } }, { session });
        if (consumed.deletedCount !== 1) throw new Error('Email verification expired or was already used. Request a new code.');
        await db.collection('employees').insertOne({ ...employee, biometricStatus, createdAt, updatedAt: createdAt }, { session });
        await db.collection('employee_accounts').insertOne({
          employeeId: employee.id, email: employee.email, passwordHash,
          role: employee.role, active: true, mustChangePassword: true, emailVerifiedAt: createdAt, createdAt, updatedAt: createdAt,
        }, { session });
        if (enrollment) await db.collection('biometric_templates').insertOne({
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
          from: `WORKPULSE MVL <${process.env.SMTP_USER}>`,
          to: employee.email,
          subject: 'Your WORKPULSE MVL employee login details',
          text: [
            `Hello ${employee.firstName},`,
            '',
            'Your WORKPULSE MVL employee account is ready.',
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
      return res.status(502).json({ error: 'The login email could not be sent, so the employee account was removed. Request a new verification code before trying again.' });
    }
    res.locals.auditMetadata = { targetName: employee.name, employeeId: employee.id, employeeAction: 'created' };
    res.status(201).json({ ...employee, biometricStatus, createdAt, loginEmailSent: true });
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
    const identifierError = identifiersValidationError(req.body?.identifiers);
    if (identifierError) return res.status(400).json({ error: identifierError });
    const additionError = salaryAdditionValidationError(req.body?.salaryAddition);
    if (additionError) return res.status(400).json({ error: additionError });
    const employee = normalizedEmployee(req.body);
    const validationError = employeeValidationError(employee);
    if (validationError) return res.status(400).json({ error: validationError });
    employee.id = req.params.id;
    if (!employee.firstName || !employee.lastName) return res.status(400).json({ error: 'First name and last name are required' });
    if (employee.phone && !/^\+639\d{9}$/.test(employee.phone)) return res.status(400).json({ error: 'Phone number must use +639XXXXXXXXX with no spaces' });
    const existing = await mongoose.connection.db.collection('employees').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Employee not found' });
    if (employee.status === 'inactive' && existing.status !== 'inactive') {
      const openAttendance = await mongoose.connection.db.collection('attendance').findOne({
        employeeId: employee.id,
        $or: [
          { sessions: { $elemMatch: { checkIn: { $exists: true, $nin: [null, ''] }, checkOut: { $in: [null, ''] } } } },
          { sessions: { $exists: false }, checkIn: { $exists: true, $nin: [null, ''] }, checkOut: { $in: [null, ''] } },
        ],
      });
      if (openAttendance) return res.status(409).json({ error: 'This employee is still clocked in. Clock them out before setting them to Inactive.' });
    }
    const date = kioskTimestamp().date;
    const quarter = quarterForDate(date);
    const quarterEndPeriod = `${date.slice(0, 4)}-${String(Number(quarter.slice(-1)) * 3).padStart(2, '0')}-16`;
    const quarterEndPaid = await mongoose.connection.db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart: quarterEndPeriod, status: { $in: ['paid', 'approved'] } });
    employee.salaryAddition = scheduleSalaryAddition(existing, employee.salaryAddition, date, quarterEndPaid ? nextQuarter(quarter) : quarter);
    res.locals.auditMetadata = { targetName: employee.name || existing.name, employeeId: req.params.id, employeeAction: 'edited' };
    employee.biometricStatus = existing.biometricStatus ?? 'none';
    const db = mongoose.connection.db;
    const [adminEmail, employeeAccountEmail, employeeRecordEmail] = await Promise.all([
      db.collection('admin_accounts').findOne({ email: employee.email }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
      db.collection('employee_accounts').findOne({ email: employee.email, employeeId: { $ne: employee.id } }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
      db.collection('employees').findOne({ email: employee.email, id: { $ne: employee.id } }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } }),
    ]);
    if (adminEmail || employeeAccountEmail || employeeRecordEmail) return res.status(409).json({ error: 'This email address is already used by another WORKPULSE MVL account.' });
    const previousSettings = await getSettings(db);
    if (configuredHourlyRate(existing, previousSettings) !== configuredHourlyRate(employee, previousSettings)) {
      await snapshotAttendanceRates(db, [existing], previousSettings);
    }
    const result = await db.collection('employees').updateOne({ id: req.params.id }, { $set: { ...employee, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Employee not found' });
    await db.collection('employee_accounts').updateOne({ employeeId: employee.id }, { $set: { email: employee.email, role: employee.role, updatedAt: new Date() } });
    res.json({ ...employee, createdAt: existing.createdAt });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'This email address is already used by another WORKPULSE MVL account.' });
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
    await rejectDuplicateEnrollment(db, enrollment.templates);
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
    if (!emailConfigured()) return res.status(503).json({ error: 'Employee email delivery is not configured.' });
    const db = mongoose.connection.db;
    const employee = await db.collection('employees').findOne({ id: req.params.id, archived: { $ne: true } });
    const account = await db.collection('employee_accounts').findOne({ employeeId: req.params.id, active: true });
    if (!employee || !account) return res.status(404).json({ error: 'Active employee login account not found.' });
    const generatedPassword = generateTemporaryPassword();
    const passwordHash = await hashSecret(generatedPassword);
    const transport = createEmailTransport();
    try {
      await transport.verify();
      const loginUrl = String(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const delivery = await transport.sendMail({
        from: `WORKPULSE MVL <${process.env.SMTP_USER}>`, to: employee.email,
        subject: 'Your new WORKPULSE MVL login details',
        text: [`Hello ${employee.firstName || employee.name},`, '', 'A new WORKPULSE MVL password was requested for your employee account.', `Employee ID: ${employee.id}`, `Login page: ${loginUrl}`, `Email: ${employee.email}`, `New generated password: ${generatedPassword}`, '', 'Complete the verification code sent to this email after signing in.', 'You will be required to create a new password before opening your workspace.', 'Keep this message private.'].join('\n'),
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
    res.locals.auditMetadata = { targetName: result.name, employeeId: result.id, employeeAction: 'archived' };
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
    res.locals.auditMetadata = { targetName: result.name, employeeId: result.id, employeeAction: 'unarchived' };
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
        deleted.cashAdvances = (await db.collection('cash_advances').deleteMany({ employeeId: employee.id }, { session })).deletedCount;
        deleted.cashAdvanceRequests = (await db.collection('cash_advance_requests').deleteMany({ employeeId: employee.id }, { session })).deletedCount;
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

router.get('/payroll/employees', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).json({ error: 'MongoDB connection not ready' });
    const employees = await db.collection('employees').find(
      { archived: { $ne: true } },
      { projection: { _id: 0, id: 1, name: 1, role: 1, status: 1 } },
    ).toArray();
    res.json(employees);
  } catch {
    res.status(500).json({ error: 'Failed to fetch payroll employees' });
  }
});

const REPORT_FIELDS = {
  employees: ['id', 'name', 'role', 'status', 'email', 'phone', 'archived', 'createdAt'],
  attendance: ['employeeId', 'name', 'date', 'checkIn', 'checkOut', 'status'],
  leave_requests: ['id', 'employeeId', 'employeeName', 'requestedDates', 'approvedDates', 'startDate', 'endDate', 'totalDays', 'status', 'createdAt', 'approvalUndoneAt'],
  payroll_requests: ['id', 'employeeId', 'periodStart', 'periodEnd', 'hoursWorked', 'grossAmount', 'amount', 'status', 'paidAt'],
};

router.get('/admin/report/:name', async (req, res) => {
  const fields = REPORT_FIELDS[req.params.name];
  if (!fields) return res.status(404).json({ error: 'Unknown report' });
  try {
    const rows = await mongoose.connection.db.collection(req.params.name).find({}, { projection: Object.fromEntries(fields.map((field) => [field, 1])) }).toArray();
    await auditEvent({ req, actor: req.auth.actor, action: 'admin.report_exported', targetType: req.params.name, outcome: 'success', metadata: { recordCount: rows.length } });
    res.json({ fields, rows: rows.map(({ _id, ...row }) => row) });
  } catch (error) {
    console.error('Report export failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to create report' });
  }
});

router.get('/payroll-requests', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ error: 'MongoDB connection not ready' });

    const employeeIds = await visibleEmployeeIds(db);
    const payrollRequests = await db.collection('payroll_requests').find({ employeeId: { $in: employeeIds } }).sort({ createdAt: -1, _id: -1 }).limit(2_000).toArray();

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
        advanceDeduction: Number(p.advanceDeduction || 0),
        rateBreakdown: p.rateBreakdown ?? [],
        additions: p.additions,
        quarterlyAdditions: p.quarterlyAdditions ?? [],
        quarterlyKeys: p.quarterlyKeys ?? [],
        carriedQuarterlyAdditions: p.carriedQuarterlyAdditions ?? [],
        bonusAmount: Number(p.bonusAmount || 0),
        hoursWorked: p.hoursWorked,
        regularHours: p.regularHours,
        overtimeHours: p.overtimeHours,
        hourlyRate: p.hourlyRate,
        createdAt: p.createdAt,
        paidAt: p.paidAt,
        paymentActionId: p.paymentActionId,
        settledBy: p.settledBy,
        rolledInto: p.rolledInto,
        rejectedAt: p.rejectedAt,
        warnings: Array.isArray(p.warnings) ? p.warnings : [],
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

function payrollPeriodEnd(periodStart) {
  const [year, month, day] = String(periodStart).split('-').map(Number);
  if (!year || !month || ![1, 16].includes(day)) return null;
  return day === 1
    ? `${year}-${String(month).padStart(2, '0')}-15`
    : `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}



// A payroll row is a single statement for an employee's 15-day period.  The
// portal and the admin screen can both prepare it at about the same time, so
// clean up any older, unpaid race duplicates before calculating it again.
async function reconcileDuplicateUnpaidPayrollRecords(db, employeeId, periodStart) {
  const records = await db.collection('payroll_requests').find({ employeeId, periodStart }).toArray();
  const unpaid = records.filter((record) => ['processing', 'rejected'].includes(record.status));
  if (records.length < 2 || unpaid.length !== records.length) return records[0] ?? null;

  const [primary, ...duplicates] = unpaid.sort((left, right) => (
    Number(right.carryOverAmount || 0) - Number(left.carryOverAmount || 0)
    || Number(right.currentAmount || 0) - Number(left.currentAmount || 0)
    || new Date(left.createdAt || 0) - new Date(right.createdAt || 0)
  ));
  const carriedBalance = Math.max(...unpaid.map((record) => Number(record.carryOverAmount || 0)));
  if (carriedBalance !== Number(primary.carryOverAmount || 0)) {
    await db.collection('payroll_requests').updateOne(
      { _id: primary._id },
      { $set: { carryOverAmount: carriedBalance, amount: Number(primary.currentAmount || 0) + carriedBalance, updatedAt: new Date() } },
    );
  }
  if (duplicates.length) {
    await db.collection('payroll_requests').updateMany(
      { rolledInto: { $in: duplicates.map((record) => record.id) } },
      { $set: { rolledInto: primary.id, rolledAt: new Date() } },
    );
    await db.collection('payroll_requests').deleteMany({ _id: { $in: duplicates.map((record) => record._id) } });
  }
  return { ...primary, carryOverAmount: carriedBalance, amount: Number(primary.currentAmount || 0) + carriedBalance };
}

function carriedQuarterlyDetails(records) {
  return records.flatMap(record => [...(record.carriedQuarterlyAdditions || []), ...(record.quarterlyAdditions || [])]);
}

async function carryPayrollCorrectionForward(db, payrollId, difference) {
  if (!difference) return;
  const nextPayroll = await db.collection('payroll_requests').findOne({ id: payrollId });
  if (!nextPayroll || ['paid', 'approved'].includes(nextPayroll.status)) return;
  await db.collection('payroll_requests').updateOne(
    { _id: nextPayroll._id },
    { $inc: { carryOverAmount: difference, amount: difference }, $set: { updatedAt: new Date() } },
  );
  if (nextPayroll.rolledInto) await carryPayrollCorrectionForward(db, nextPayroll.rolledInto, difference);
}

export async function preparePayrollRecord(db, employee, periodStart, settings) {
  try {
    return await payrollTransaction(db, async transactionDb => {
      if (transactionDb.inPayrollTransaction) {
        await transactionDb.collection('employees').updateOne({ id: employee.id }, { $inc: { payrollPolicyRevision: 1 } });
        employee = await transactionDb.collection('employees').findOne({ id: employee.id }) ?? employee;
      }
      return calculatePayrollRecord(transactionDb, employee, periodStart, settings);
    });
  } catch (error) {
    const periodConflict = error?.code === 11000 && ((error.keyPattern?.employeeId === 1 && error.keyPattern?.periodStart === 1) || String(error.message).includes('index: one_unpaid_payroll_per_period '));
    if (!periodConflict) throw error;
    // Duplicate-key errors abort a transaction. Read the winner only after rollback.
    const winner = await db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart });
    if (!winner) throw error;
    return { record: { ...winner, periodStart: payrollPeriodKeyForRecord(winner) }, created: false };
  }
}

async function calculatePayrollRecord(db, employee, periodStart, settings) {
  const existing = await reconcileDuplicateUnpaidPayrollRecords(db, employee.id, periodStart)
    ?? await db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart });
  if (existing) {
    if (!['processing', 'rejected', 'carried_over'].includes(existing.status)) {
      return { record: { ...existing, periodStart: payrollPeriodKeyForRecord(existing) }, created: false };
    }
    const periodEnd = payrollPeriodEnd(periodStart);
    if (!periodEnd) throw new Error('Invalid payroll period');
    const attendance = await db.collection('attendance').find({ employeeId: employee.id, date: { $gte: periodStart, $lte: periodEnd }, ...(existing.calculationResetAt ? { updatedAt: { $gt: existing.calculationResetAt } } : {}) }).toArray();
    const incompleteAttendance = attendance.some((record) => attendanceSessions(record).some((session) => !session.checkOut));
    const hourlyRate = configuredHourlyRate(employee, settings);
    const { hoursWorked, regularHours, overtimeHours, grossAmount, rateBreakdown } = attendancePaySummary(attendance, hourlyRate, existing.calculationResetAt);
    const bonusAmount = Math.max(0, Number(existing.bonusAmount || 0));
    const newQuarterly = await automaticQuarterlyAdditions(db, employee, periodStart, existing);
    const quarterlyAdditions = [...(existing.quarterlyAdditions || []), ...newQuarterly];
    const additions = [...await recurringPayrollAdditions(db, employee, periodStart), ...quarterlyAdditions, ...(bonusAmount > 0 ? [{ label: 'Bonus', value: bonusAmount }] : [])];
    const advanceDeduction = existing.status === 'carried_over'
      ? Number(existing.advanceDeduction || 0)
      : proposedAdvanceDeduction((await cashAdvanceSummary(db, employee.id, periodStart)).eligibleBalance, grossAmount);
    const currentAmount = grossAmount + additions.reduce((sum, item) => sum + item.value, 0) - advanceDeduction;
    const newlyOutstanding = existing.calculationResetAt ? [] : await db.collection('payroll_requests').find({
      employeeId: employee.id,
      status: { $in: ['processing', 'rejected'] }, amount: { $gt: 0 },
      rolledInto: { $exists: false },
      periodStart: { $lt: periodStart },
    }).toArray();
    const carriedQuarterlyAdditions = [...(existing.carriedQuarterlyAdditions || []), ...carriedQuarterlyDetails(newlyOutstanding)];
    const addedCarry = newlyOutstanding.reduce((sum, payroll) => sum + Number(payroll.amount || 0) + Number(payroll.advanceDeduction || 0), 0);
    const carryOverAmount = Number(existing.carryOverAmount || 0) + addedCarry;
    const amount = currentAmount + carryOverAmount;
    const warnings = [
      ...(hoursWorked <= 0 ? ['No completed attendance hours'] : []),
      ...(incompleteAttendance ? ['Incomplete attendance session'] : []),
    ];
    const previousAmount = Number(existing.amount || 0);
    const updated = await db.collection('payroll_requests').findOneAndUpdate(
      { _id: existing._id, status: existing.status, additions: existing.additions ?? { $exists: false }, updatedAt: existing.updatedAt ?? { $exists: false }, calculationResetAt: existing.calculationResetAt ?? { $exists: false } },
      { $set: { grossAmount, rateBreakdown, additions, quarterlyAdditions, quarterlyKeys: [...new Set([...(existing.quarterlyKeys || []), ...quarterlyAdditions.map(item => item.quarter).filter(Boolean)])], carriedQuarterlyAdditions, bonusAmount, hoursWorked, regularHours, overtimeHours, hourlyRate, advanceDeduction, currentAmount, carryOverAmount, amount, warnings, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      const latest = await db.collection('payroll_requests').findOne({ _id: existing._id });
      return { record: latest, created: false };
    }
    await db.collection('payroll_requests').updateMany(
      { _id: { $in: newlyOutstanding.map((item) => item._id) } },
      { $set: { status: 'carried_over', rolledInto: existing.id, rolledAt: new Date() } },
    );
    if (existing.status === 'carried_over') {
      await carryPayrollCorrectionForward(db, existing.rolledInto, amount - previousAmount);
    }
    return { record: { ...updated, periodStart: payrollPeriodKeyForRecord(updated) }, created: false };
  }
  const periodEnd = payrollPeriodEnd(periodStart);
  if (!periodEnd) throw new Error('Invalid payroll period');
  const attendance = await db.collection('attendance').find({ employeeId: employee.id, date: { $gte: periodStart, $lte: periodEnd } }).toArray();
  const incompleteAttendance = attendance.some((record) => attendanceSessions(record).some((session) => !session.checkOut));
  const hourlyRate = configuredHourlyRate(employee, settings);
  const { hoursWorked, regularHours, overtimeHours, grossAmount, rateBreakdown } = attendancePaySummary(attendance, hourlyRate);
  const quarterlyAdditions = await automaticQuarterlyAdditions(db, employee, periodStart);
  const additions = [...await recurringPayrollAdditions(db, employee, periodStart), ...quarterlyAdditions];
  const advanceDeduction = proposedAdvanceDeduction((await cashAdvanceSummary(db, employee.id, periodStart)).eligibleBalance, grossAmount);
  const currentAmount = grossAmount + additions.reduce((sum, item) => sum + item.value, 0) - advanceDeduction;
  const outstanding = await db.collection('payroll_requests').find({
    employeeId: employee.id, status: { $in: ['processing', 'rejected'] }, amount: { $gt: 0 }, rolledInto: { $exists: false },
    $or: [{ periodStart: { $lt: periodStart } }, { periodStart: { $exists: false } }],
  }).toArray();
  const carriedQuarterlyAdditions = carriedQuarterlyDetails(outstanding);
  const carryOverAmount = outstanding.reduce((sum, payroll) => sum + Number(payroll.amount || 0) + Number(payroll.advanceDeduction || 0), 0);
  const warnings = [
    ...(hoursWorked <= 0 ? ['No completed attendance hours'] : []),
    ...(incompleteAttendance ? ['Incomplete attendance session'] : []),
  ];
  const id = `PR-${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${employee.id}`;
  const record = { id, employeeId: employee.id, employeeName: employee.name, employeeEmail: employee.email, grossAmount, rateBreakdown, additions, quarterlyAdditions, quarterlyKeys: quarterlyAdditions.length ? [quarterForDate(periodStart)] : [], carriedQuarterlyAdditions, hoursWorked, regularHours, overtimeHours, hourlyRate, advanceDeduction, currentAmount, carryOverAmount, amount: currentAmount + carryOverAmount, periodStart, periodDays: 15, status: 'processing', warnings, createdAt: new Date() };
  try {
    await db.collection('payroll_requests').insertOne(record);
  } catch (error) {
    const periodConflict = error?.code === 11000 && (
      (error.keyPattern?.employeeId === 1 && error.keyPattern?.periodStart === 1)
      || String(error.message).includes('index: one_unpaid_payroll_per_period ')
    );
    if (!periodConflict || db.inPayrollTransaction) throw error;
    // Another preparation won the insert race. Only that request should link
    // outstanding balances; the losing request must not apply them again.
    const concurrent = await db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart });
    if (!concurrent) throw error;
    return { record: { ...concurrent, periodStart: payrollPeriodKeyForRecord(concurrent) }, created: false };
  }
  if (outstanding.length) await db.collection('payroll_requests').updateMany(
    { _id: { $in: outstanding.map((item) => item._id) } },
    { $set: { status: 'carried_over', rolledInto: id, rolledAt: new Date() } },
  );
  return { record, created: true };
}

async function mapWithConcurrency(items, limit, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await operation(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

router.post('/payroll-requests/prepare-bulk', async (req, res) => {
  try {
    // The payroll screen calls this automatically to synchronize calculated
    // values. It is a background refresh, not a deliberate administrator
    // action, so do not attribute it to the signed-in administrator.
    res.locals.skipAudit = true;
    const periodStart = String(req.body?.periodStart ?? '');
    if (periodStart !== payrollPeriodKey()) return res.status(400).json({ error: 'Only the current payroll period can be prepared' });
    const db = mongoose.connection.db;
    const requestedIds = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds.map(String).slice(0, 500) : [];
    const query = { archived: { $ne: true }, status: { $ne: 'inactive' }, ...(requestedIds.length ? { id: { $in: requestedIds } } : {}) };
    const [employees, settings] = await Promise.all([db.collection('employees').find(query).toArray(), getSettings(db)]);
    // Payroll calculations are independent per employee. A small worker pool
    // avoids the old one-request-at-a-time delay without overwhelming Atlas.
    const results = await mapWithConcurrency(employees, 8, (employee) => preparePayrollRecord(db, employee, periodStart, settings));
    const records = results.map((item) => item.record);
    res.json({
      records,
      prepared: results.filter((item) => item.created).length,
      alreadyPrepared: results.filter((item) => !item.created).length,
      carriedEmployees: records.filter((item) => Number(item.carryOverAmount || 0) > 0).length,
      carriedTotal: records.reduce((sum, item) => sum + Number(item.carryOverAmount || 0), 0),
    });
  } catch (error) {
    console.error('Bulk payroll preparation failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to prepare payroll' });
  }
});

router.post('/payroll/audit-print', async (req, res) => {
  const printScope = req.body?.printScope === 'individual-payslip' ? 'individual-payslip' : 'paid-list';
  res.locals.auditMetadata = {
    payrollAction: 'printed', printScope,
    targetName: String(req.body?.employeeName || '').trim().slice(0, 120) || null,
    periodStart: String(req.body?.periodStart || '').slice(0, 10) || null,
    recordCount: Math.max(0, Math.min(1000, Number(req.body?.recordCount || 0))),
  };
  res.status(204).end();
});

router.post('/payroll-requests/quarterly-additions/preview', async (req, res) => {
  try {
    const { periodStart, quarter } = req.body ?? {};
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const error = quarterlySelectionError(periodStart, quarter, today);
    if (error) return res.status(400).json({ error });
    const entries = await previewQuarterlyAdditions(mongoose.connection.db, periodStart, quarter);
    res.json({ entries });
  } catch { res.status(500).json({ error: 'Unable to preview quarterly additions.' }); }
});

router.post('/payroll-requests/quarterly-additions/include', async (req, res) => {
  try {
    const { periodStart, quarter, selections } = req.body ?? {};
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const error = quarterlySelectionError(periodStart, quarter, today);
    if (error) return res.status(400).json({ error });
    if (!Array.isArray(selections) || !selections.length || selections.length > 500 || selections.some(item => typeof item?.requestId !== 'string' || typeof item?.token !== 'string') || new Set(selections.map(item => item.requestId)).size !== selections.length) return res.status(400).json({ error: 'Review and select up to 500 employees.' });
    const results = await includeQuarterlyAdditions(mongoose.connection.db, periodStart, quarter, selections, req.auth.actor.email);
    const included = results.filter(item => item.included).length;
    res.locals.auditMetadata = { payrollAction: 'quarterly-additions-included', periodStart, quarter, recordCount: included };
    res.json({ included, results });
  } catch (error) {
    console.error('Quarterly inclusion failed:', error.message);
    res.status(500).json({ error: 'Unable to include quarterly additions. Refresh the preview before retrying.' });
  }
});

router.post('/payroll-requests/quarterly-additions/remove', async (req, res) => {
  try {
    const { requestId, quarter } = req.body ?? {};
    if (typeof requestId !== 'string' || !validQuarter(quarter)) return res.status(400).json({ error: 'Select an unpaid payroll and a valid quarter.' });
    if (!await removeQuarterlyAdditions(mongoose.connection.db, requestId, quarter, req.auth.actor.email)) return res.status(409).json({ error: 'Only additions in an unpaid payroll without a hold or carry-forward can be removed.' });
    res.locals.auditMetadata = { payrollAction: 'quarterly-additions-removed', requestId, quarter };
    res.json({ removed: true });
  } catch { res.status(500).json({ error: 'Unable to remove quarterly additions.' }); }
});

router.patch('/payroll-requests/bonus', async (req, res) => {
  try {
    const amount = Math.round(Number(req.body?.amount) * 100) / 100;
    const periodStart = String(req.body?.periodStart ?? '');
    const scope = req.body?.scope === 'all' ? 'all' : 'individual';
    const requestId = String(req.body?.requestId ?? '');
    if (!(amount > 0) || amount > 1_000_000) return res.status(400).json({ error: 'Enter a bonus between 0.01 and 1,000,000.' });
    if (!/^\d{4}-\d{2}-(01|16)$/.test(periodStart)) return res.status(400).json({ error: 'Select a valid payroll period.' });
    if (scope === 'individual' && !requestId) return res.status(400).json({ error: 'Choose an employee.' });
    const db = mongoose.connection.db;
    const query = { periodStart, status: { $in: ['processing', 'rejected'] }, ...(scope === 'individual' ? { id: requestId } : {}) };
    const records = await db.collection('payroll_requests').find(query).toArray();
    if (!records.length) return res.status(404).json({ error: scope === 'all' ? 'No unpaid payroll records are available for this period.' : 'The selected unpaid payroll record was not found.' });
    const operations = records.map((record) => {
      const bonusAmount = Math.round((Number(record.bonusAmount || 0) + amount) * 100) / 100;
      const additions = [...(Array.isArray(record.additions) ? record.additions.filter((item) => item?.label !== 'Bonus') : []), { label: 'Bonus', value: bonusAmount }];
      return { updateOne: { filter: { _id: record._id, status: { $in: ['processing', 'rejected'] }, additions: record.additions ?? { $exists: false }, updatedAt: record.updatedAt ?? { $exists: false } }, update: { $set: { bonusAmount, additions, currentAmount: Math.round((Number(record.currentAmount || 0) + amount) * 100) / 100, amount: Math.round((Number(record.amount || 0) + amount) * 100) / 100, bonusUpdatedAt: new Date(), bonusUpdatedBy: req.auth.actor.email } } } };
    });
    const result = await db.collection('payroll_requests').bulkWrite(operations);
    res.locals.auditMetadata = { payrollAction: 'bonus-added', scope, amount, recordCount: result.modifiedCount, targetName: scope === 'individual' ? records[0]?.employeeName : null, periodStart };
    if (!result.modifiedCount) return res.status(409).json({ error: 'Payroll changed while adding the bonus. Refresh and try again.' });
    res.json({ updated: result.modifiedCount, amount, scope });
  } catch (error) {
    console.error('Payroll bonus update failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to add the payroll bonus.' });
  }
});

export async function requireQuarterlyAdditionsBeforePayment(db, record) {
  const employee = await db.collection('employees').findOne({ id: record.employeeId, archived: { $ne: true } });
  if (!employee) throw new Error('STALE_PAYROLL');
  if ((await automaticQuarterlyAdditions(db, employee, record.periodStart, record)).length) throw new Error('QUARTERLY_MISSING');
}

router.patch('/payroll-requests/pay-bulk', async (req, res) => {
  try {
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password' });
    }
    const periodStart = String(req.body?.periodStart ?? '');
    if (!/^\d{4}-\d{2}-(01|16)$/.test(periodStart)) return res.status(400).json({ error: 'Select a valid payroll period' });
    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(String))].slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'Select at least one ready payroll record' });
    const db = mongoose.connection.db;
    const paidAt = new Date();
    const paymentActionId = `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const ready = await payrollTransaction(db, async transactionDb => {
      let selected = await transactionDb.collection('payroll_requests').find({ id: { $in: ids }, periodStart, status: 'processing', rolledInto: { $exists: false } }).toArray();
      selected = selected.filter(row => Number(row.amount || 0) > 0 || Number(row.advanceDeduction || 0) > 0);
      if (!selected.length || selected.length !== ids.length) throw new Error('STALE_PAYROLL');
      for (const employeeId of [...new Set(selected.map(row => row.employeeId))].sort()) {
        await transactionDb.collection('employees').updateOne({ id: employeeId }, { $inc: { payrollPolicyRevision: 1 } });
      }
      for (const record of selected) {
        await requireQuarterlyAdditionsBeforePayment(transactionDb, record);
        const expected = proposedAdvanceDeduction((await cashAdvanceSummary(transactionDb, record.employeeId, record.periodStart)).eligibleBalance, record.grossAmount);
        if (expected !== Number(record.advanceDeduction || 0)) throw new Error('STALE_PAYROLL');
      }
      const changed = await transactionDb.collection('payroll_requests').updateMany(
        { _id: { $in: selected.map(item => item._id) }, status: 'processing', rolledInto: { $exists: false } },
        { $set: { status: 'paid', paidAt, approvedBy: req.auth.actor.email, paymentActionId }, $unset: { rejectedAt: '', rejectedBy: '' } },
      );
      if (changed.modifiedCount !== selected.length) throw new Error('STALE_PAYROLL');
      for (const record of selected) await transactionDb.collection('payroll_requests').updateMany({
        employeeId: record.employeeId, rolledInto: { $exists: true }, status: { $in: ['processing', 'rejected', 'carried_over'] }, periodStart: { $lte: periodStart },
      }, { $set: { status: 'paid', paidAt, settledBy: record.id, approvedBy: req.auth.actor.email, paymentActionId } });
      return selected;
    });
    const total = ready.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    res.locals.auditMetadata = { payrollAction: ready.length === 1 ? 'individual-paid' : 'bulk-paid', recordCount: ready.length, targetName: ready.length === 1 ? ready[0].employeeName : null, total, periodStart };
    res.json({ paid: ready.length, skipped: ids.length - ready.length, total, ids: ready.map((item) => item.id), paidAt });
  } catch (error) {
    if (error?.message === 'QUARTERLY_MISSING') return res.status(409).json({ error: 'A quarterly allowance is missing. Click Refresh payroll, review the new amounts, then pay.' });
    if (error?.message === 'STALE_PAYROLL') return res.status(409).json({ error: 'Payroll or advance balance changed. Refresh and review the amounts.' });
    console.error('Bulk payroll payment failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to confirm bulk payment' });
  }
});

router.patch('/payroll-requests/undo-last-payment', async (req, res) => {
  try {
    const undoError = undoPaymentValidationError(req.body);
    if (undoError) return res.status(400).json({ error: undoError });
    const undoReason = req.body.reason.trim();
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password' });
    }
    const periodStart = String(req.body?.periodStart ?? '');
    if (!/^\d{4}-\d{2}-(01|16)$/.test(periodStart)) return res.status(400).json({ error: 'Select a valid payroll period' });
    const db = mongoose.connection.db;
    const scope = req.body?.scope === 'individual' ? 'individual' : req.body?.scope === 'payment-action' ? 'payment-action' : 'last-action';
    const requestId = req.body?.requestId;
    if (scope === 'individual' && (typeof requestId !== 'string' || !requestId.trim())) return res.status(400).json({ error: 'Choose an employee payment to undo.' });
    const paymentActionId = req.body?.paymentActionId;
    if (scope === 'payment-action' && (typeof paymentActionId !== 'string' || !/^PAY-[\w-]{1,100}$/.test(paymentActionId))) return res.status(400).json({ error: 'Choose a payment group to undo.' });
    const latest = scope === 'individual'
      ? await db.collection('payroll_requests').findOne({ id: requestId, periodStart, status: 'paid', settledBy: { $exists: false } })
      : scope === 'payment-action'
        ? await db.collection('payroll_requests').findOne({ paymentActionId, periodStart, status: 'paid', settledBy: { $exists: false } })
      : await db.collection('payroll_requests').find({ periodStart, status: 'paid', settledBy: { $exists: false } }).sort({ paidAt: -1, _id: -1 }).limit(1).next();
    if (!latest) return res.status(409).json({ error: scope === 'individual' ? 'That employee payment is no longer marked as paid. Refresh payroll.' : 'There is no payment to undo for this period' });
    const paidAt = latest.paidAt instanceof Date ? latest.paidAt : new Date(latest.paidAt);
    const undoDeadline = new Date(paidAt.getTime() + 15 * 24 * 60 * 60_000);
    if (Number.isNaN(paidAt.getTime()) || new Date() >= undoDeadline) {
      return res.status(409).json({ error: 'This payment can no longer be undone because the 15-day undo period has expired.' });
    }
    const directRecords = scope === 'individual' ? [latest] : latest.paymentActionId
      ? await db.collection('payroll_requests').find({ periodStart, status: 'paid', paymentActionId: latest.paymentActionId, settledBy: { $exists: false } }).toArray()
      : [latest];
    if (!directRecords.length) return res.status(409).json({ error: 'This payment changed. Refresh payroll and try again.' });
    const directIds = directRecords.map((item) => item.id);
    const total = directRecords.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    await payrollTransaction(db, async transactionDb => {
      for (const employeeId of [...new Set(directRecords.map(row => row.employeeId))].sort()) {
        await transactionDb.collection('employees').updateOne({ id: employeeId }, { $inc: { payrollPolicyRevision: 1 } });
      }
      const changed = await transactionDb.collection('payroll_requests').updateMany(
        { _id: { $in: directRecords.map((item) => item._id) }, status: 'paid' },
        { $set: { status: 'processing', undoneAt: new Date(), undoneBy: req.auth.actor.email, undoReason, paymentReversedConfirmed: true }, $unset: { paidAt: '', approvedBy: '', paymentActionId: '' } },
      );
      if (changed.modifiedCount !== directRecords.length) throw new Error('STALE_PAYROLL');
      await transactionDb.collection('payroll_requests').updateMany(
        { settledBy: { $in: directIds }, status: 'paid' },
        { $set: { status: 'carried_over', undoneAt: new Date(), undoneBy: req.auth.actor.email, undoReason, paymentReversedConfirmed: true }, $unset: { paidAt: '', approvedBy: '', paymentActionId: '', settledBy: '' } },
      );
    });
    let warning;
    try {
      const settings = await getSettings(db);
      const employees = await db.collection('employees').find({ id: { $in: [...new Set(directRecords.map(row => row.employeeId))] }, archived: { $ne: true } }).toArray();
      await mapWithConcurrency(employees, 8, employee => preparePayrollRecord(db, employee, periodStart, settings));
    } catch (error) {
      console.error('Payroll recalculation after undo failed:', error);
      warning = 'Payment was undone, but payroll could not be recalculated. Refresh payroll before paying it again.';
    }
    res.locals.auditMetadata = { payrollAction: 'payment-undone', undoReason, recordCount: directRecords.length, targetName: directRecords.length === 1 ? directRecords[0].employeeName : null, total, periodStart };
    res.json({ undone: directRecords.length, ids: directIds, total, ...(warning ? { warning } : {}) });
  } catch (error) {
    if (error?.message === 'STALE_PAYROLL') return res.status(409).json({ error: 'Payment changed. Refresh and try again.' });
    console.error('Undo payroll payment failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to undo the last payroll payment' });
  }
});

router.post('/payroll-requests', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const employee = await db.collection('employees').findOne({ id: req.body?.employeeId, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const result = await preparePayrollRecord(db, employee, payrollPeriodKey(), await getSettings(db));
    res.status(result.created ? 201 : 200).json(result.record);
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
    const paymentActionId = `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const result = await payrollTransaction(db, async transactionDb => {
      const pending = await transactionDb.collection('payroll_requests').findOne({ id: req.params.id, status: 'processing', rolledInto: { $exists: false } });
      if (!pending || !(Number(pending.amount || 0) > 0 || Number(pending.advanceDeduction || 0) > 0)) throw new Error('STALE_PAYROLL');
      await transactionDb.collection('employees').updateOne({ id: pending.employeeId }, { $inc: { payrollPolicyRevision: 1 } });
      await requireQuarterlyAdditionsBeforePayment(transactionDb, pending);
      const expected = proposedAdvanceDeduction((await cashAdvanceSummary(transactionDb, pending.employeeId, pending.periodStart)).eligibleBalance, pending.grossAmount);
      if (expected !== Number(pending.advanceDeduction || 0)) throw new Error('STALE_PAYROLL');
      const paid = await transactionDb.collection('payroll_requests').findOneAndUpdate(
        { id: req.params.id, status: 'processing', amount: pending.amount, advanceDeduction: pending.advanceDeduction ?? { $exists: false }, rolledInto: { $exists: false } },
        { $set: { status: 'paid', paidAt, approvedBy: req.auth.actor.email, paymentActionId }, $unset: { rejectedAt: '', rejectedBy: '' } },
        { returnDocument: 'after' },
      );
      if (!paid) throw new Error('STALE_PAYROLL');
      await transactionDb.collection('payroll_requests').updateMany({
        employeeId: paid.employeeId, rolledInto: { $exists: true }, status: { $in: ['processing', 'rejected', 'carried_over'] },
        ...(paid.periodStart ? { periodStart: { $lte: paid.periodStart } } : {}),
      }, { $set: { status: 'paid', paidAt, settledBy: paid.id, approvedBy: req.auth.actor.email, paymentActionId } });
      return paid;
    });
    res.locals.auditMetadata = { payrollAction: 'individual-paid', targetName: result.employeeName, employeeId: result.employeeId, amount: result.amount, periodStart: result.periodStart };
    res.json({ id: result.id, status: result.status, paidAt: result.paidAt });
  } catch (error) { res.status(['STALE_PAYROLL', 'QUARTERLY_MISSING'].includes(error?.message) ? 409 : 500).json({ error: error?.message === 'QUARTERLY_MISSING' ? 'A quarterly allowance is missing. Click Refresh payroll, review the new amount, then pay.' : error?.message === 'STALE_PAYROLL' ? 'Payroll or advance balance changed. Refresh and review the amount.' : 'Failed to confirm payment' }); }
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
    res.locals.auditMetadata = { payrollAction: 'payment-held', targetName: result.employeeName, employeeId: result.employeeId, amount: result.amount, periodStart: result.periodStart };
    res.json({ id: result.id, status: result.status, rejectedAt: result.rejectedAt });
  } catch { res.status(500).json({ error: 'Failed to mark payroll as not paid' }); }
});

router.patch('/payroll-requests/:id/remove-hold', async (req, res) => {
  try {
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password' });
    }
    const result = await mongoose.connection.db.collection('payroll_requests').findOneAndUpdate(
      { id: req.params.id, status: 'rejected' },
      { $set: { status: 'processing', holdRemovedAt: new Date(), holdRemovedBy: req.auth.actor.email }, $unset: { rejectedAt: '', rejectedBy: '' } },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'Held payroll record not found' });
    res.locals.auditMetadata = { payrollAction: 'hold-removed', targetName: result.employeeName, employeeId: result.employeeId, amount: result.amount, periodStart: result.periodStart };
    res.json({ id: result.id, status: result.status });
  } catch { res.status(500).json({ error: 'Failed to remove payroll hold' }); }
});

router.post('/payroll-requests/:id/email', async (req, res) => {
  try {
    if (!emailConfigured()) return res.status(503).json({ error: 'Email delivery is not configured' });
    const db = mongoose.connection.db;
    const payroll = await db.collection('payroll_requests').findOne({ id: req.params.id });
    if (!payroll) return res.status(404).json({ error: 'Payslip not found' });
    const employee = await db.collection('employees').findOne({ id: payroll.employeeId, archived: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Active employee not found' });
    if (!employee.email) return res.status(400).json({ error: 'Add an email address to this employee profile first' });
    const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
    const additions = Array.isArray(payroll.additions) ? payroll.additions : [];
    const text = [
      'WORKPULSE MVL Payslip',
      `Pay period: ${payroll.periodStart}`,
      `Employee: ${employee.name}`,
      `Employee ID: ${employee.id}`,
      '',
      `Hours worked: ${Number(payroll.hoursWorked || 0).toFixed(2)}`,
      `Hourly rate: ${money(payroll.hourlyRate)}`,
      `Attendance-based pay: ${money(payroll.grossAmount ?? payroll.currentAmount)}`,
      ...additions.map((item) => `${item.label}: +${money(item.value)}`),
      ...(Number(payroll.advanceDeduction || 0) > 0 ? [`Cash advance repayment: -${money(payroll.advanceDeduction)}`] : []),
      ...(payroll.carriedQuarterlyAdditions || []).map((item) => `Included in carried balance - ${item.label}: ${money(item.value)}`),
      ...(Number(payroll.carryOverAmount || 0) > 0 ? [`Unpaid balance carried forward: +${money(payroll.carryOverAmount)}`] : []),
      '',
      `Total payroll: ${money(payroll.amount)}`,
      `Status: ${payroll.status === 'paid' ? 'Paid' : payroll.status === 'rejected' ? 'Payment on hold - carries forward' : payroll.status === 'carried_over' ? 'Carried to the next pay period' : 'Ready to pay'}`,
    ].join('\n');
    const transport = createEmailTransport();
    await transport.sendMail({ from: `WORKPULSE MVL <${process.env.SMTP_USER}>`, to: employee.email, subject: `Payslip ${payroll.periodStart} - ${employee.name}`, text });
    res.locals.auditMetadata = { payrollAction: 'payslip-emailed', targetName: employee.name, employeeId: employee.id, periodStart: payroll.periodStart };
    res.json({ message: `Payslip sent to ${employee.email}` });
  } catch (error) {
    console.error('Payslip email failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to email the payslip' });
  }
});

router.post('/payroll/:employeeId/email-summary', async (req, res) => {
  try {
    if (!emailConfigured()) return res.status(503).json({ error: 'Email delivery is not configured' });
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
    const hourlyRate = configuredHourlyRate(employee, settings);
    const paySummary = attendancePaySummary(periodRecords, hourlyRate);
    const hoursWorked = paySummary.hoursWorked;
    const gross = periodRecords.length ? paySummary.grossAmount : Number(employee.grossSalary ?? 0);
    const identifiers = Array.isArray(employee.identifiers) ? employee.identifiers.filter((item) => item?.type && item?.value) : [];

    const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
    const identifierText = identifiers.length ? `\nProfile identifiers:\n${identifiers.map((item) => `${item.type}: ${item.value}`).join('\n')}` : '';
    const activePeriodStart = payrollPeriodKey();
    const legacyActivePeriodStart = currentPayrollPeriodStart().toISOString().slice(0, 10);
    const activePayroll = await mongoose.connection.db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart: { $in: [...new Set([activePeriodStart, legacyActivePeriodStart])] } });
    const displayGross = Number(activePayroll?.grossAmount ?? gross);
    const rateText = (activePayroll?.rateBreakdown?.length ? activePayroll.rateBreakdown : paySummary.rateBreakdown).map(line => `${money(line.rate)}/hour for ${line.hours.toFixed(2)} hours`).join('; ') || `${money(hourlyRate)}/hour`;
    const carryOver = Number(activePayroll?.carryOverAmount || 0);
    const additionLines = (activePayroll?.additions ?? await recurringPayrollAdditions(db, employee, activePeriodStart)).map((item) => [item.label, item.value]);
    const total = additionLines.reduce((sum, item) => sum + item[1], 0);
    const text = `Payroll Summary (15-day period)\nEmployee: ${employee.name}\nEmployee ID: ${employee.id}${identifierText}\nHours Worked: ${Number(activePayroll?.hoursWorked ?? hoursWorked).toFixed(2)}\nHourly Rate(s): ${rateText}\n\nGross Salary: ${money(displayGross)}\n${additionLines.map(([label, value]) => `${label}: +${money(value)}`).join('\n')}\nTotal Additions: +${money(total)}\nUnpaid Balance Carried Forward: +${money(carryOver)}\nNet Salary: ${money(displayGross + total + carryOver)}`;
    const transport = createEmailTransport();
    await transport.sendMail({ from: `WORKPULSE MVL <${process.env.SMTP_USER}>`, to: employee.email, subject: `Payroll Summary - ${employee.name}`, text });
    res.locals.auditMetadata = { payrollAction: 'summary-emailed', targetName: employee.name, employeeId: employee.id };
    res.json({ message: `Payroll summary sent to ${employee.email}` });
  } catch (error) {
    console.error('Payroll email failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to email payroll summary' });
  }
});

router.get('/leave-requests', async (req, res) => {
  try {
    await expirePassedLeaveRequests(mongoose.connection.db);
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ error: 'MongoDB connection not ready' });

    const employeeIds = await visibleEmployeeIds(db);
    const leaveRequests = await db.collection('leave_requests').find({ employeeId: { $in: employeeIds } }).sort({ createdAt: -1, _id: -1 }).limit(2_000).toArray();

    res.json(
      leaveRequests.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        role: r.role,
        leaveType: r.leaveType,
        startDate: r.startDate,
        endDate: r.endDate,
        requestedDates: Array.isArray(r.requestedDates) ? r.requestedDates : [],
        approvedDates: Array.isArray(r.approvedDates) ? r.approvedDates : [],
        totalDays: r.totalDays,
        reason: r.reason,
        status: r.status,
        avatarUrl: undefined,
        initials: r.initials,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

router.patch('/payroll-requests/:id/reset', async (req, res) => {
  try {
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password' });
    }
    const db = mongoose.connection.db;
    const existing = await db.collection('payroll_requests').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Payroll record not found' });
    if (existing.status === 'carried_over' || existing.rolledInto) return res.status(409).json({ error: 'This payroll was carried forward. Review the destination payroll instead.' });
    const quarterlySource = await db.collection('payroll_requests').findOne({ employeeId: existing.employeeId, $or: [{ id: existing.id }, { settledBy: existing.id }, { rolledInto: existing.id }], 'quarterlyKeys.0': { $exists: true } });
    if (existing.carriedQuarterlyAdditions?.length || (quarterlySource && (['paid', 'approved'].includes(existing.status) || quarterlySource.id !== existing.id))) return res.status(409).json({ error: 'Quarterly additions are linked to this payment. Undo a paid payment first; carried quarterly balances must be settled through their destination payroll.' });
    if (['paid', 'approved'].includes(existing.status)) return res.status(409).json({ error: 'Paid payroll cannot be reset. Use Undo Payment with a reason only if payment was not made or was returned.' });
    const resetAt = new Date();
    const result = await db.collection('payroll_requests').findOneAndUpdate(
      { _id: existing._id, status: existing.status, updatedAt: existing.updatedAt ?? { $exists: false } },
      {
        $set: {
          hoursWorked: 0, regularHours: 0, overtimeHours: 0, hourlyRate: 0, rateBreakdown: [], grossAmount: 0, bonusAmount: 0, additions: [], advanceDeduction: 0, currentAmount: 0,
          carryOverAmount: 0, amount: 0, warnings: [], status: 'processing',
          calculationResetAt: resetAt, resetBy: req.auth.actor.email, updatedAt: resetAt,
        },
        $unset: { quarterlyKeys: '', quarterlyAdditions: '', carriedQuarterlyAdditions: '', paidAt: '', approvedBy: '', paymentActionId: '', rejectedAt: '', rejectedBy: '', settledBy: '', undoneAt: '', undoneBy: '' },
      },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(409).json({ error: 'Payroll changed. Refresh before resetting.' });
    res.locals.auditMetadata = { payrollAction: 'reset', targetName: existing.employeeName, employeeId: existing.employeeId, periodStart: existing.periodStart, recordCount: 1 };
    res.json(result);
  } catch (error) {
    console.error('Payroll reset failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Payroll could not be reset' });
  }
});

router.post('/attendance/audit-export', async (req, res) => {
  res.locals.auditMetadata = {
    attendanceAction: 'exported', exportFormat: req.body?.format === 'csv' ? 'csv' : 'unknown',
    from: String(req.body?.from || '').slice(0, 10), to: String(req.body?.to || '').slice(0, 10),
    recordCount: Math.max(0, Math.min(10000, Number(req.body?.recordCount || 0))),
  };
  res.status(204).end();
});

router.post('/payroll/audit-export', async (req, res) => {
  res.locals.auditMetadata = {
    payrollAction: 'exported', exportFormat: req.body?.format === 'csv' ? 'csv' : 'unknown',
    periodStart: String(req.body?.periodStart || '').slice(0, 10), filter: String(req.body?.filter || 'all').slice(0, 30),
    searchApplied: Boolean(req.body?.searchApplied), recordCount: Math.max(0, Math.min(10000, Number(req.body?.recordCount || 0))),
  };
  res.status(204).end();
});

router.get('/leave-requests/:id/approval-preview', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    await expirePassedLeaveRequests(db);
    const employeeIds = await visibleEmployeeIds(db);
    const request = await db.collection('leave_requests').findOne({ id: req.params.id, employeeId: { $in: employeeIds }, status: { $in: ['pending', 'passed'] } });
    if (!request) return res.status(409).json({ error: 'This request is no longer available for review. Refresh leave requests.' });
    const settings = await getSettings(db);
    const preview = await leaveApprovalPreview(db, request, { today: kioskTimestamp().date, isWorkday: date => scheduledWorkStatus(settings, date) });
    if (!preview.dates.length) return res.status(409).json({ error: 'Exact requested dates are missing from this older request. Create a new request with the correct dates before approving.' });
    res.json({ today: preview.today, dates: preview.dates, requestStatus: request.status });
  } catch { res.status(500).json({ error: 'Attendance and payroll could not be checked. Approval is unavailable until the checks succeed.' }); }
});

function leaveDecisionError(error) {
  if (error?.code === 20 || /Transaction numbers are only allowed|replica set/i.test(error?.message ?? '')) {
    return { status: 503, error: 'Leave approval needs MongoDB transaction support. Configure a replica set before approving; no partial changes were saved.' };
  }
  return { status: error?.status ?? 500, error: error?.status ? error.message : 'Leave decision could not be saved safely. Refresh before trying again.' };
}

router.patch('/leave-requests/bulk-status', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    await expirePassedLeaveRequests(db);
    const status = req.body?.status;
    const ids = [...new Set(Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [])].slice(0, 100);
    if (!['approved', 'rejected'].includes(status) || !ids.length) return res.status(400).json({ error: 'Select pending requests and a valid decision.' });
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) return res.status(verification.retryAfterSeconds ? 429 : 401).json({ error: verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect administrator password.' });
    const employeeIds = await visibleEmployeeIds(db);
    const settings = await getSettings(db);
    const successful = [], failed = [];
    for (const id of ids) {
      try {
        const result = await decideLeaveRequest(db, { id, employeeIds, status, actor: req.auth.actor.email, today: kioskTimestamp().date, isWorkday: date => scheduledWorkStatus(settings, date), bulk: true });
        successful.push({ id, employeeName: result.request.employeeName, request: { ...result.request, _id: undefined }, decision: result.decision });
      } catch (error) { failed.push({ id, error: leaveDecisionError(error).error }); }
    }
    res.locals.auditMetadata = { leaveAction: `bulk-${status}`, requestedStatus: status, recordCount: successful.length, failedCount: failed.length, requestIds: ids, decisions: successful.map(item => ({ id: item.id, ...item.decision })) };
    res.json({ status, successful, failed });
  } catch { res.status(500).json({ error: 'Unable to process the selected leave requests.' }); }
});

router.patch('/leave-requests/:id/status', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    await expirePassedLeaveRequests(db);
    const status = req.body?.status;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be approved or rejected' });
    const employeeIds = await visibleEmployeeIds(db);
    const settings = await getSettings(db);
    const { request, decision } = await decideLeaveRequest(db, {
      id: req.params.id, employeeIds, status, approvedDates: req.body?.approvedDates,
      correctionReason: req.body?.correctionReason, confirmPastCorrection: req.body?.confirmPastCorrection === true,
      actor: req.auth.actor.email, today: kioskTimestamp().date, isWorkday: date => scheduledWorkStatus(settings, date),
    });
    res.locals.auditMetadata = { targetName: request.employeeName, employeeId: request.employeeId, requestedStatus: status, leaveAction: status, ...decision };
    res.json({ ...request, _id: undefined });
  } catch (error) { const failure = leaveDecisionError(error); res.status(failure.status).json({ error: failure.error }); }
});
router.patch('/leave-requests/:id/undo-approval', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const today = kioskTimestamp().date;
    const existing = await db.collection('leave_requests').findOne({ id: req.params.id, status: 'approved' });
    if (!existing) return res.status(409).json({ error: 'Only an approved leave request can be undone.' });
    const approvedDates = Array.isArray(existing.approvedDates) ? existing.approvedDates : [];
    const pastDates = approvedDates.filter((date) => date < today);
    const reversibleDates = approvedDates.filter((date) => date >= today);
    if (!reversibleDates.length) return res.status(409).json({ error: 'This leave has no current or future approved dates to undo.' });
    const request = await db.collection('leave_requests').findOneAndUpdate(
      { _id: existing._id, status: 'approved' },
      { $set: { status: pastDates.length ? 'approved' : 'cancelled', approvedDates: pastDates, totalDays: pastDates.length, approvalUndoneAt: new Date(), approvalUndoneBy: req.auth.actor.email } },
      { returnDocument: 'after' },
    );
    await db.collection('attendance').deleteMany({ employeeId: request.employeeId, leaveRequestId: request.id, status: 'On Leave', date: { $gte: today }, $or: [{ checkIn: null }, { checkIn: '' }, { checkIn: { $exists: false } }] });
    res.json({ ...request, _id: undefined });
  } catch { res.status(500).json({ error: 'Unable to undo the leave approval.' }); }
});

// Attendance is stored in `attendance` collection.
router.get('/attendance', async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(500).json({ error: 'MongoDB connection not ready' });

    const settings = await getSettings(db);
    await enforceAutomaticClockOut(db, settings);
    const employeeIds = await visibleEmployeeIds(db);
    const requestedLimit = Number.parseInt(String(req.query.limit ?? '5000'), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(10_000, requestedLimit)) : 5_000;
    const dateFilter = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || ''))) dateFilter.$gte = String(req.query.from);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ''))) dateFilter.$lte = String(req.query.to);
    const attendance = await db.collection('attendance').find(
      { employeeId: { $in: employeeIds }, ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) },
      { projection: { employeeId: 1, name: 1, role: 1, date: 1, checkIn: 1, checkOut: 1, sessions: 1, status: 1, idleDay: 1, autoClockedOut: 1 } },
    ).sort({ date: -1 }).limit(limit).toArray();

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
        manualRecorded: attendanceSessions(a).some((session) => session.captureMethod === 'admin-manual' || session.manualClockOut === true),
        status: attendanceArrivalStatus(a, settings),
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

router.get('/attendance/manual', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const stamp = kioskTimestamp();
    const settings = await getSettings(db);
    await enforceAutomaticClockOut(db, settings);
    const [employees, records, approvedLeaves] = await Promise.all([
      db.collection('employees').find({ archived: { $ne: true }, status: { $ne: 'inactive' } }, { projection: { id: 1, name: 1, role: 1 } }).sort({ name: 1 }).toArray(),
      db.collection('attendance').find({ date: stamp.date }).toArray(),
      db.collection('leave_requests').find({ status: 'approved', startDate: { $lte: stamp.date }, endDate: { $gte: stamp.date } }).toArray(),
    ]);
    const byEmployee = new Map(records.map((record) => [record.employeeId, record]));
    const onLeave = new Set(approvedLeaves.filter((leave) => approvedLeaveCoversDate(leave, stamp.date)).map((leave) => leave.employeeId));
    const workday = scheduledWorkStatus(settings, stamp.date);
    res.json({ date: stamp.date, employees: employees.map((employee) => {
      const sessions = attendanceSessions(byEmployee.get(employee.id));
      const last = sessions.at(-1);
      const clockedIn = Boolean(last?.checkIn && !last?.checkOut);
      const blockedReason = clockedIn ? null : manualAttendanceProblem({ action: 'time-in', sessions, workday, approvedLeave: onLeave.has(employee.id), maxSessions: MAX_DAILY_ATTENDANCE_SESSIONS });
      return { id: employee.id, name: employee.name, role: employeeRoleLabel(employee.role), clockedIn, lastTime: last?.checkOut || last?.checkIn || null, sessionCount: sessions.length, blockedReason };
    }) });
  } catch { res.status(500).json({ error: 'Unable to load today’s attendance.' }); }
});

router.get('/attendance/idle-day', async (req, res) => {
  try {
    const date = String(req.query.date || '');
    if (!validAttendanceDate(date)) return res.status(400).json({ error: 'Choose a valid date.' });
    const db = mongoose.connection.db;
    const settings = await getSettings(db);
    const marker = await db.collection('idle_days').findOne({ date });
    res.json({ date, workday: scheduledWorkStatus(settings, date), idleDay: Boolean(marker) });
  } catch (error) {
    console.error('Idle day status failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to load idle day status.' });
  }
});

router.get('/attendance/idle-days', async (req, res) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!validAttendanceDate(from) || !validAttendanceDate(to) || from > to) return res.status(400).json({ error: 'Choose a valid date range.' });
    const db = mongoose.connection.db;
    const markers = await db.collection('idle_days').find({ date: { $gte: from, $lte: to } }, { projection: { _id: 0, date: 1 } }).sort({ date: 1 }).toArray();
    const dates = markers.map((marker) => marker.date);
    if (!dates.length) return res.json([]);
    const employeeIds = await visibleEmployeeIds(db);
    const records = await db.collection('attendance').find({ date: { $in: dates }, employeeId: { $in: employeeIds }, idleDay: true }, { projection: { date: 1, sessions: 1, checkIn: 1 } }).toArray();
    const counts = new Map(dates.map((date) => [date, { employees: 0, worked: 0 }]));
    for (const record of records) {
      const count = counts.get(record.date);
      if (!count) continue;
      count.employees += 1;
      if (attendanceSessions(record).length) count.worked += 1;
    }
    res.json(markers.map((marker) => ({ date: marker.date, employees: counts.get(marker.date).employees, worked: counts.get(marker.date).worked })));
  } catch { res.status(500).json({ error: 'Unable to load idle day report.' }); }
});

router.post('/attendance/idle-day', async (req, res) => {
  try {
    const date = String(req.body?.date || '');
    const idleDay = req.body?.idleDay;
    if (!validAttendanceDate(date) || typeof idleDay !== 'boolean') return res.status(400).json({ error: 'Choose a valid date and action.' });
    const yesterday = new Date(`${kioskTimestamp().date}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (date < yesterday.toISOString().slice(0, 10)) return res.status(400).json({ error: 'Idle days can only be changed from yesterday onward.' });
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password' });
    }
    const db = mongoose.connection.db;
    const settings = await getSettings(db);
    if (!scheduledWorkStatus(settings, date)) return res.status(409).json({ error: 'This is already a non-working day. No idle-day change is needed.' });
    const employees = await db.collection('employees').find({ archived: { $ne: true }, status: { $ne: 'inactive' } }).toArray();
    const ids = employees.map(employee => employee.id);
    const [existingRecords, leaves] = await Promise.all([
      db.collection('attendance').find({ employeeId: { $in: ids }, date }).toArray(),
      db.collection('leave_requests').find({ employeeId: { $in: ids }, status: 'approved', startDate: { $lte: date }, endDate: { $gte: date } }).toArray(),
    ]);
    const byEmployee = new Map(existingRecords.map(record => [record.employeeId, record]));
    const onLeave = new Set(leaves.filter(leave => approvedLeaveCoversDate(leave, date)).map(leave => leave.employeeId));
    const now = new Date();
    if (idleDay) await db.collection('idle_days').updateOne({ date }, { $set: { date, setBy: req.auth.actor.email, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
    else await db.collection('idle_days').deleteOne({ date });
    for (const employee of employees) {
      const collection = db.collection('attendance');
      const existing = byEmployee.get(employee.id);
      if (idleDay) {
        if (onLeave.has(employee.id) || existing?.status === 'On Leave') continue;
        if (existing) await collection.updateOne({ _id: existing._id }, { $set: { idleDay: true, status: 'Idle', idleDayBy: req.auth.actor.email, idleDayAt: now, updatedAt: now }, $unset: { automaticAbsence: '' } });
        else await collection.insertOne({ employeeId: employee.id, name: employee.name, role: employeeRoleLabel(employee.role), date, checkIn: null, checkOut: null, sessions: [], status: 'Idle', idleDay: true, idleDayBy: req.auth.actor.email, idleDayAt: now, createdAt: now, updatedAt: now });
      } else if (existing?.idleDay) {
        if (attendanceSessions(existing).length) await collection.updateOne({ _id: existing._id }, { $set: { status: attendanceArrivalStatus({ ...existing, idleDay: false }, settings), updatedAt: now }, $unset: { idleDay: '', idleDayBy: '', idleDayAt: '' } });
        else if (date < kioskTimestamp().date) await collection.updateOne({ _id: existing._id }, { $set: { status: 'Absent', automaticAbsence: true, updatedAt: now }, $unset: { idleDay: '', idleDayBy: '', idleDayAt: '' } });
        else await collection.deleteOne({ _id: existing._id });
      }
    }
    aiInsightsCache = { expiresAt: 0, value: null };
    res.locals.auditMetadata = { attendanceAction: idleDay ? 'company-idle-day-added' : 'company-idle-day-removed', date, recordCount: ids.length };
    res.json({ idleDay, updated: ids.length });
  } catch (error) {
    console.error('Company idle day update failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to update idle day. Refresh and try again.' });
  }
});

function manualAttendanceFailure(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function recordManualAttendance(db, { employeeId, action, stamp, settings, actor, note, firstSessionOnly = false }) {
  const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true }, banned: { $ne: true }, status: { $ne: 'inactive' } });
  if (!employee) throw manualAttendanceFailure('This employee is inactive or unavailable.', 404);
  const existing = await db.collection('attendance').findOne({ employeeId, date: stamp.date });
  const companyIdleDay = Boolean(await db.collection('idle_days').findOne({ date: stamp.date }));
  const sessions = attendanceSessions(existing);
  const last = sessions.at(-1);
  if (firstSessionOnly && sessions.length) throw manualAttendanceFailure('This employee has already clocked in today.');
  let approvedLeave = false;
  if (action === 'time-in') {
    const leaves = await db.collection('leave_requests').find({ employeeId, status: 'approved', startDate: { $lte: stamp.date }, endDate: { $gte: stamp.date } }).toArray();
    approvedLeave = leaves.some((leave) => approvedLeaveCoversDate(leave, stamp.date));
  }
  const problem = manualAttendanceProblem({ action, sessions, workday: scheduledWorkStatus(settings, stamp.date), approvedLeave, maxSessions: MAX_DAILY_ATTENDANCE_SESSIONS });
  if (problem) throw manualAttendanceFailure(problem);
  const details = { captureMethod: 'admin-manual', manualReason: 'Scanner unavailable', manualNote: note, manualRecordedBy: actor };
  if (action === 'time-in' && !existing) {
    const record = { employeeId, name: employee.name, role: employeeRoleLabel(employee.role), date: stamp.date, checkIn: stamp.time, checkOut: null,
      sessions: [{ checkIn: stamp.time, checkOut: null, checkInAt: stamp.now, hourlyRate: configuredHourlyRate(employee, settings), workStartTime: settings.shift.startTime, workStopTime: settings.shift.workStopTime, overtimeStopTime: settings.shift.autoClockOutTime, ...details }],
      sessionCount: 1, lastAction: action, status: companyIdleDay ? 'Idle' : 'Present', idleDay: companyIdleDay,
      ...details, identityVerified: false, createdAt: stamp.now, updatedAt: stamp.now };
    try { await db.collection('attendance').insertOne(record); }
    catch (error) { if (error?.code === 11000) throw manualAttendanceFailure('Attendance changed. Refresh and try again.'); throw error; }
  } else {
    if (action === 'time-out') {
      if (!checkoutIsChronological(stamp.date, last, stamp.now)) throw manualAttendanceFailure('Time-out must be after time-in.');
      sessions[sessions.length - 1] = { ...last, checkOut: stamp.time, checkOutAt: stamp.now, manualClockOut: true, manualClockOutBy: actor, manualClockOutReason: 'Scanner unavailable', manualClockOutNote: note };
    } else {
      sessions.push({ checkIn: stamp.time, checkOut: null, checkInAt: stamp.now, hourlyRate: configuredHourlyRate(employee, settings), workStartTime: settings.shift.startTime, workStopTime: settings.shift.workStopTime, overtimeStopTime: settings.shift.autoClockOutTime, ...details });
    }
    const update = { sessions, sessionCount: sessions.length, checkIn: sessions[0].checkIn, checkOut: action === 'time-out' ? stamp.time : null, lastAction: action, updatedAt: stamp.now,
      ...(action === 'time-in' ? { status: existing.idleDay || companyIdleDay ? 'Idle' : 'Present', ...(companyIdleDay ? { idleDay: true } : {}), ...(!existing.checkIn ? { ...details, identityVerified: false } : {}) } : { manualClockOutBy: actor, manualClockOutAt: stamp.now }) };
    const updated = await db.collection('attendance').findOneAndUpdate(
      { _id: existing._id, updatedAt: existing.updatedAt ?? { $exists: false }, sessions: existing.sessions ?? { $exists: false } },
      { $set: update, $unset: { automaticAbsence: '' } }, { returnDocument: 'after' },
    );
    if (!updated) throw manualAttendanceFailure('Attendance changed. Refresh and try again.');
  }
  let payrollWarning = null;
  if (action === 'time-out') {
    try { await preparePayrollRecord(db, employee, payrollPeriodKey(new Date(`${stamp.date}T12:00:00+08:00`)), settings); }
    catch (error) { console.error('Manual attendance was saved, but payroll refresh failed:', error instanceof Error ? error.message : error); payrollWarning = 'Attendance was saved, but payroll did not refresh. Review this employee\'s payroll.'; }
  }
  return { employeeId, name: employee.name, action, time: stamp.time, date: stamp.date, payrollWarning };
}

router.post('/attendance/manual', async (req, res) => {
  try {
    const { employeeId, action, date } = req.body ?? {};
    if (typeof employeeId !== 'string' || !employeeId || !['time-in', 'time-out'].includes(action)) return res.status(400).json({ error: 'Choose an employee and attendance action.' });
    const stamp = kioskTimestamp();
    if (date !== stamp.date) return res.status(409).json({ error: 'The day changed. Refresh attendance and try again.' });
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password' });
    }
    const db = mongoose.connection.db;
    const settings = await getSettings(db);
    await enforceAutomaticClockOut(db, settings);
    const note = String(req.body?.note ?? '').trim().slice(0, 500);
    const result = await recordManualAttendance(db, { employeeId, action, stamp, settings, actor: req.auth.actor.email, note });
    res.locals.auditMetadata = { attendanceAction: action, captureMethod: 'admin-manual', employeeId, targetName: result.name, eventTime: stamp.time, date: stamp.date, manualReason: 'Scanner unavailable', manualNote: note };
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Manual attendance failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to record attendance. Refresh before retrying.' });
  }
});

router.post('/attendance/manual/bulk', async (req, res) => {
  try {
    const { employeeIds, action, date, employeeActions } = req.body ?? {};
    if (!Array.isArray(employeeIds) || !employeeIds.length || employeeIds.length > 500 || employeeIds.some((id) => typeof id !== 'string' || !id || id.length > 200) || !['time-in', 'time-out', 'mixed'].includes(action)) return res.status(400).json({ error: 'Choose employees and an attendance action.' });
    const ids = [...new Set(employeeIds)];
    // Capture explicit intentions from the displayed status. Do not toggle based
    // on a newer status, which could reverse the intended action after a scan.
    if (action === 'mixed' && (!Array.isArray(employeeActions) || employeeActions.length !== ids.length || new Set(employeeActions.map(item => item?.employeeId)).size !== ids.length || employeeActions.some(item => !ids.includes(item?.employeeId) || !['time-in', 'time-out'].includes(item?.action)))) return res.status(400).json({ error: 'Choose a clock-in or clock-out action for every selected employee.' });
    const stamp = kioskTimestamp();
    if (date !== stamp.date) return res.status(409).json({ error: 'The day changed. Refresh attendance and try again.' });
    const verification = await verifyAdminPassword(req, req.body?.password);
    if (!verification.valid) {
      if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
      return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password' });
    }
    const db = mongoose.connection.db;
    const settings = await getSettings(db);
    await enforceAutomaticClockOut(db, settings);
    const note = String(req.body?.note ?? '').trim().slice(0, 500);
    const results = [];
    for (const employeeId of ids) {
      const employeeAction = action === 'mixed' ? employeeActions.find(item => item.employeeId === employeeId).action : action;
      try { results.push({ ok: true, ...await recordManualAttendance(db, { employeeId, action: employeeAction, stamp, settings, actor: req.auth.actor.email, note, firstSessionOnly: employeeAction === 'time-in' && req.body?.selectionMode === 'all' }) }); }
      catch (error) { results.push({ ok: false, employeeId, error: error?.status ? error.message : 'Could not record attendance. Review this employee.' }); }
    }
    const recorded = results.filter((result) => result.ok).length;
    res.locals.auditMetadata = { attendanceAction: action, captureMethod: 'admin-manual', scope: 'bulk', recordCount: recorded, failedCount: results.length - recorded, date: stamp.date, manualReason: 'Scanner unavailable', manualNote: note };
    if (recorded < results.length) res.locals.auditOutcome = 'failure';
    res.json({ action, date: stamp.date, time: stamp.time, recorded, skipped: results.length - recorded, results });
  } catch (error) {
    console.error('Bulk manual attendance failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Unable to record attendance. Refresh before retrying.' });
  }
});
router.post('/attendance/kiosk', async (req, res) => {
  if ((await getSystemControls(mongoose.connection.db)).maintenanceMode) return res.status(503).json({ error: 'Employee clock-in is unavailable during maintenance.' });
  res.locals.auditMetadata = { kioskAction: 'fingerprint scan', attendanceRecorded: false };
  const rejectScan = (status, reason, error, extra = {}) => {
    res.locals.auditMetadata = { ...res.locals.auditMetadata, kioskReason: reason, failureReason: error };
    return res.status(status).json({ error, ...extra });
  };
  try {
    const db = mongoose.connection?.db;
    if (!db) return rejectScan(503, 'database-unavailable', 'MongoDB connection not ready');
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
    if (!matched) return rejectScan(404, 'no-match', 'Fingerprint not recognized. Use a registered finger.');
    const employeeId = matched.employeeId;
    const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true }, banned: { $ne: true }, status: { $ne: 'inactive' } });
    if (!employee) return rejectScan(404, 'employee-unavailable', 'Active employee not found');
    res.locals.auditMetadata = { ...res.locals.auditMetadata, targetName: employee.name, employeeId };

    const stamp = kioskTimestamp();
    const existing = await db.collection('attendance').findOne({ employeeId, date: stamp.date });
    const settings = await getSettings(db);
    const companyIdleDay = Boolean(await db.collection('idle_days').findOne({ date: stamp.date }));
    const hasOpenSession = attendanceSessions(existing).some((session) => !session.checkOut);
    const leaveCandidates = await db.collection('leave_requests').find({ employeeId, status: 'approved', startDate: { $lte: stamp.date }, endDate: { $gte: stamp.date } }).toArray();
    const approvedLeave = leaveCandidates.some((leave) => approvedLeaveCoversDate(leave, stamp.date));
    if (approvedLeave && !hasOpenSession) {
      if (verificationAttemptId) await db.collection('biometric_verification_attempts').updateOne({ _id: verificationAttemptId }, { $set: { action: 'approved-leave', eventTime: stamp.time, attendanceDate: stamp.date } });
      return rejectScan(403, 'approved-leave', 'Time-in is unavailable because you have approved leave today.');
    }
    if (scheduledWorkStatus(settings, stamp.date) === false && !hasOpenSession) {
      if (verificationAttemptId) await db.collection('biometric_verification_attempts').updateOne({ _id: verificationAttemptId }, { $set: { action: 'non-working-day', eventTime: stamp.time, attendanceDate: stamp.date } });
      return rejectScan(403, 'non-working-day', 'Time-in is unavailable today because this date is marked as a non-working day.');
    }
    if (!existing) {
      const record = {
        employeeId, name: employee.name, role: employeeRoleLabel(employee.role),
        date: stamp.date, checkIn: stamp.time, checkOut: null,
        sessions: [{ checkIn: stamp.time, checkOut: null, checkInAt: stamp.now, hourlyRate: configuredHourlyRate(employee, settings), workStartTime: settings.shift.startTime, workStopTime: settings.shift.workStopTime, overtimeStopTime: settings.shift.autoClockOutTime, deviceUid: deviceUid || null, matchScore: matched.score }],
        sessionCount: 1, lastAction: 'time-in',
        status: companyIdleDay ? 'Idle' : 'Present', idleDay: companyIdleDay,
        captureMethod: 'digitalpersona-fingerjet', deviceUid: deviceUid || null,
        identityVerified: true, matchScore: matched.score, matcherFormat: matched.format,
        createdAt: stamp.now, updatedAt: stamp.now,
      };
      try { await db.collection('attendance').insertOne(record); }
      catch (error) {
        if (error?.code === 11000) return rejectScan(409, 'conflict', 'Attendance was already recorded for this employee today');
        throw error;
      }
      res.locals.auditMetadata = { ...res.locals.auditMetadata, attendanceRecorded: true, kioskAction: 'time-in', eventTime: stamp.time };
      if (verificationAttemptId) await db.collection('biometric_verification_attempts').updateOne({ _id: verificationAttemptId }, { $set: { action: 'time-in', eventTime: stamp.time, attendanceDate: stamp.date } });
      res.locals.auditMetadata = { ...res.locals.auditMetadata, kioskAction: 'time-in', eventTime: stamp.time };
      return res.status(201).json({ action: 'time-in', record: { ...record, eventTime: stamp.time, _id: undefined } });
    }

    const lastAttendanceUpdate = new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime();
    const duplicateScanWindowMs = 30_000;
    const elapsedSinceTimeIn = stamp.now.getTime() - lastAttendanceUpdate;
    if (Number.isFinite(lastAttendanceUpdate) && elapsedSinceTimeIn >= 0 && elapsedSinceTimeIn < duplicateScanWindowMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((duplicateScanWindowMs - elapsedSinceTimeIn) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return rejectScan(429, 'duplicate-scan', 'Attendance was just recorded. Remove your finger before the next scan.', { retryAfterSeconds });
    }

    const sessions = attendanceSessions(existing);
    const lastSession = sessions.at(-1);
    const versionFilter = { _id: existing._id, ...(existing.updatedAt ? { updatedAt: existing.updatedAt } : {}) };
    let action;
    let update;
    if (lastSession && !lastSession.checkOut) {
      if (!checkoutIsChronological(existing.date, lastSession, stamp.now)) return rejectScan(409, 'invalid-checkout-time', 'Time-out must be later than time-in.');
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
        return rejectScan(409, 'daily-limit', 'Daily attendance limit reached: three time-in/time-out sessions are already complete.');
      }
      sessions.push({ checkIn: stamp.time, checkOut: null, checkInAt: stamp.now, hourlyRate: configuredHourlyRate(employee, settings), workStartTime: settings.shift.startTime, workStopTime: settings.shift.workStopTime, overtimeStopTime: settings.shift.autoClockOutTime, deviceUid: deviceUid || null, matchScore: matched.score });
      action = 'time-in';
      update = {
        sessions, sessionCount: sessions.length, checkOut: null, lastAction: action, updatedAt: stamp.now,
        ...(existing.idleDay || companyIdleDay ? { status: 'Idle', idleDay: true } : {}),
        lastCheckIn: stamp.time, deviceUid: deviceUid || null, matchScore: matched.score,
      };
    }

    const updated = await db.collection('attendance').findOneAndUpdate(versionFilter, { $set: update }, { returnDocument: 'after' });
    if (!updated) return rejectScan(409, 'conflict', 'Attendance was updated by another request');
    res.locals.auditMetadata = { ...res.locals.auditMetadata, attendanceRecorded: true, kioskAction: action, eventTime: stamp.time };
    if (action === 'time-out') {
      const attendancePeriod = payrollPeriodKey(new Date(`${stamp.date}T12:00:00+08:00`));
      await preparePayrollRecord(db, employee, attendancePeriod, settings);
    }
    if (verificationAttemptId) await db.collection('biometric_verification_attempts').updateOne({ _id: verificationAttemptId }, { $set: { action, eventTime: stamp.time, attendanceDate: stamp.date } });
    res.locals.auditMetadata = { ...res.locals.auditMetadata, kioskAction: action, eventTime: stamp.time };
    return res.json({ action, record: { ...updated, eventTime: stamp.time, _id: undefined } });
  } catch (error) {
    if (error instanceof BiometricError) return rejectScan(error.status, error.status === 503 ? 'matcher-unavailable' : error.status === 422 ? 'unsupported-sample' : 'invalid-sample', error.message);
    console.error('Kiosk attendance failed:', error instanceof Error ? error.message : error);
    rejectScan(500, 'internal-error', res.locals.auditMetadata.attendanceRecorded ? 'Attendance was saved, but a follow-up operation failed.' : 'Unable to record kiosk attendance');
  }
});

export default router;


