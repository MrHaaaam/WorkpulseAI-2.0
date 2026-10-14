import mongoose from 'mongoose';
import { requireRole } from '../security.js';
import { verifyAdminPassword } from './auth.js';
import { attendanceCorrectionBlockReason, attendanceSessions, attendanceVersion, correctAttendance, validAttendanceDate } from '../attendance-corrections.js';

const employeeAccess = requireRole('regular', 'extra', 'manager', 'supervisor');
function fail(res, error) {
  console.error('Employee update failed:', error.message);
  res.status(error.status || (error.code === 11000 ? 409 : 500)).json({ error: error.status ? error.message : error.code === 11000 ? 'Attendance changed. Reload and try again.' : 'Unable to save changes safely. Refresh before retrying.' });
}
export function registerEmployeeUpdates(router, { getSettings, configuredHourlyRate, preparePayrollRecord, payrollPeriodKey, enforceAutomaticClockOut, invalidateInsights }) {
  router.get('/employee/me/notifications', employeeAccess, async (req, res) => {
    try {
      const notifications = await mongoose.connection.db.collection('employee_notifications').find({ employeeId: req.auth.actor.employeeId }, { projection: { _id: 0, id: 1, category: 1, section: 1, title: 1, description: 1, createdAt: 1, read: 1, date: 1 } }).sort({ createdAt: -1 }).limit(200).toArray();
      res.json(notifications);
    } catch { res.status(500).json({ error: 'Unable to load your notifications.' }); }
  });
  router.post('/employee/me/notifications/read', employeeAccess, async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== 'string' || id.length > 200)) return res.status(400).json({ error: 'Choose valid notification IDs.' });
    try {
      const db = mongoose.connection.db;
      const filter = { employeeId: req.auth.actor.employeeId, id: { $in: ids } };
      const owned = await db.collection('employee_notifications').find(filter, { projection: { id: 1 } }).toArray();
      await db.collection('employee_notifications').updateMany(filter, { $set: { read: true, readAt: new Date() } });
      res.json({ readIds: owned.map(item => item.id) });
    } catch { res.status(500).json({ error: 'Unable to mark your notifications as read.' }); }
  });
  router.get('/attendance/correction', requireRole('admin'), async (req, res) => {
    try {
      const date = String(req.query.date || ''); const employeeId = String(req.query.employeeId || '');
      if (!validAttendanceDate(date) || !employeeId) return res.status(400).json({ error: 'Choose an employee and valid date.' });
      const db = mongoose.connection.db;
      const employee = await db.collection('employees').findOne({ id: employeeId, archived: { $ne: true } });
      if (!employee) return res.status(404).json({ error: 'Employee not found.' });
      await enforceAutomaticClockOut(db, await getSettings(db));
      const attendance = await db.collection('attendance').findOne({ employeeId, date });
      const [leaves, payroll] = await Promise.all([
        db.collection('leave_requests').find({ employeeId, status: 'approved' }).toArray(),
        db.collection('payroll_requests').find({ employeeId }).toArray(),
      ]);
      const blockedReason = attendanceCorrectionBlockReason({ employee, attendance, leaves, payroll, date });
      const settings = await getSettings(db);
      res.json({ employee: { id: employee.id, name: employee.name }, date, blockedReason, schedule: { workStartTime: settings.shift.startTime, overtimeStopTime: settings.shift.autoClockOutTime }, sessions: attendanceSessions(attendance).map(item => ({ checkIn: item.checkIn, checkOut: item.checkOut, workStartTime: item.workStartTime, overtimeStopTime: item.overtimeStopTime })), version: attendanceVersion(attendance) });
    } catch (error) { fail(res, error); }
  });
  router.patch('/attendance/correction', requireRole('admin'), async (req, res) => {
    try {
      const verification = await verifyAdminPassword(req, req.body?.password);
      if (!verification.valid) {
        if (verification.retryAfterSeconds) res.setHeader('Retry-After', String(verification.retryAfterSeconds));
        return res.status(verification.forbidden ? 403 : verification.retryAfterSeconds ? 429 : 401).json({ error: verification.forbidden ? 'Administrator access required' : verification.retryAfterSeconds ? `Incorrect admin password. Try again in ${verification.retryAfterSeconds} seconds.` : 'Incorrect admin password' });
      }
      const db = mongoose.connection.db;
      await enforceAutomaticClockOut(db, await getSettings(db));
      const result = await correctAttendance(db, { employeeId: req.body?.employeeId, date: req.body?.date, sessionNumber: req.body?.sessionNumber, reason: req.body?.reason,
        version: req.body?.version, checkIn: req.body?.checkIn, checkOut: req.body?.checkOut || '', actor: req.auth.actor.email, actorName: req.auth.actor.name || req.auth.actor.fullName || req.auth.actor.email,
        getSessionDefaults: async (tx, employee) => { const current = await getSettings(tx); return { hourlyRate: configuredHourlyRate(employee, current), workStartTime: current.shift.startTime, workStopTime: current.shift.workStopTime, overtimeStopTime: current.shift.autoClockOutTime }; },
        refreshPayroll: async (tx, employee, date) => preparePayrollRecord(tx, employee, payrollPeriodKey(new Date(`${date}T12:00:00+08:00`)), await getSettings(tx)),
      });
      invalidateInsights(); res.locals.auditMetadata = { ...result, attendanceAction: 'corrected' };
      res.json({ employeeId: result.employeeId, date: result.date, sessions: result.after.map(item => ({ checkIn: item.checkIn, checkOut: item.checkOut })) });
    } catch (error) { fail(res, error); }
  });
}
