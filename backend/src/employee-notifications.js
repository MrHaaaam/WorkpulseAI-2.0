import crypto from 'node:crypto';
import mongoose from 'mongoose';

// Only committed business actions appear in the employee inbox. Never copy request
// bodies or audit metadata: those can contain passwords and other employees' pay.
export function employeeActionCopy(path, body = {}, meta = {}) {
  if (/^\/employees\/[^/]+\/fingerprint$/.test(path)) return { category: 'profile', section: 'profile', title: 'Fingerprint registration updated', description: 'Your administrator updated your fingerprint registration.' };
  if (/^\/employees\/[^/]+\/send-login-email$/.test(path)) return { category: 'profile', section: 'profile', title: 'Login details sent', description: 'Your administrator sent your login details to your registered email.' };
  if (/^\/employees(?:\/[^/]+(?:\/(?:archive|unarchive))?)?$/.test(path)) return { category: 'profile', section: 'profile', title: path.endsWith('/archive') ? 'Employee account archived' : path.endsWith('/unarchive') ? 'Employee account restored' : path === '/employees' ? 'Employee account created' : 'Employee details updated', description: 'Your administrator updated your employee record. Review My Profile for your latest details.' };
  if (/^\/admin\/employees\/[^/]+\/access$/.test(path)) return { category: 'profile', section: 'profile', title: meta.adminAction === 'employee-access-blocked' ? 'Account access restricted' : 'Account access restored', description: 'Your administrator changed your account access.' };
  if (path === '/attendance/manual' || path === '/attendance/manual/bulk' || path === '/admin/force-clock-out' || path === '/attendance/kiosk') {
    const action = meta.attendanceAction || meta.kioskAction;
    const title = path === '/admin/force-clock-out' ? 'Time-out recorded by administrator' : path === '/attendance/kiosk' && action === 'time-in' ? 'You clocked in' : path === '/attendance/kiosk' && action === 'time-out' ? 'You clocked out' : 'Attendance recorded';
    return { category: 'attendance', section: 'attendance', title, description: `Attendance was recorded${meta.date ? ` for ${meta.date}` : ''}${meta.eventTime ? ` at ${meta.eventTime}` : ''}${['time-in', 'time-out'].includes(action) ? ` (${action})` : ''}. Review My Attendance for your times.` };
  }
  if (path === '/attendance/idle-day') return { category: 'attendance', section: 'calendar', title: body.idleDay ? 'Idle day scheduled' : 'Idle day removed', description: `Your administrator ${body.idleDay ? 'scheduled' : 'removed'} an idle day for ${body.date}. Review My Calendar.` };
  if (/^\/leave-requests\/(?:[^/]+\/status|bulk-status|[^/]+\/undo-approval)$/.test(path)) return { category: 'leave', section: 'leave', title: path.endsWith('/undo-approval') ? 'Leave approval changed' : `Leave request ${body.status === 'approved' ? 'approved' : 'rejected'}`, description: 'Your administrator updated your leave request. Review Leave Requests for the approved dates and decision.' };
  if (/^\/cash-advance-requests\/[^/]+\/(?:decision|disburse)$/.test(path) || path === '/cash-advances') return { category: 'cash-advance', section: 'payroll', title: path.endsWith('/disburse') || path === '/cash-advances' ? 'Cash advance recorded' : `Cash advance ${meta.cashAdvanceAction || 'updated'}`, description: 'Your administrator updated your cash advance. Review the cash advance panel in My Payroll.' };
  if (path === '/settings') return { category: 'profile', section: 'calendar', title: 'Work schedule or pay settings updated', description: 'Your administrator updated company work schedule or pay settings. Review your calendar and payroll for the current information.' };
  if ((path.startsWith('/payroll-requests') && !/\/(?:prepare-bulk|preview)$/.test(path)) || /^\/payroll\/[^/]+\/email$/.test(path)) {
    const action = meta.payrollAction;
    const title = ({ 'individual-paid': 'Payroll payment confirmed', 'bulk-paid': 'Payroll payment confirmed', 'payment-undone': 'Payroll payment reversed', 'payment-held': 'Payroll payment put on hold', 'hold-removed': 'Payroll payment hold removed', 'bonus-added': 'Payroll bonus added', 'reset': 'Payroll reset', 'payslip-emailed': 'Payslip emailed', 'summary-emailed': 'Payroll summary emailed', 'quarterly-additions-included': 'Payroll allowance added', 'quarterly-additions-removed': 'Payroll allowance removed' })[action] || 'Payroll updated';
    return { category: 'payroll', section: 'payroll', title, description: `Your administrator updated your payroll${meta.periodStart ? ` for the period starting ${meta.periodStart}` : ''}. Review My Payroll for the amount and status.` };
  }
  return null;
}

export async function notifyAdminAction(db, { path, body = {}, payload = {}, meta = {}, statusCode = 200, actorRole, skip = false, requestId }) {
  const savedKioskAttendance = path === '/attendance/kiosk' && meta.attendanceRecorded === true && ['time-in', 'time-out'].includes(meta.kioskAction);
  if (skip || actorRole !== 'admin' || (statusCode >= 400 && !meta.employeeNotificationPartial && !savedKioskAttendance) || path === '/attendance/correction') return [];
  payload ??= {};
  const copy = employeeActionCopy(path, body, meta);
  if (!copy) return [];
  let ids = [];
  if (Array.isArray(meta.employeeNotificationIds)) ids = meta.employeeNotificationIds;
  else if (path === '/leave-requests/bulk-status') ids = (payload.successful || []).map(item => item.request?.employeeId);
  else if (path === '/attendance/manual/bulk') ids = (payload.results || []).filter(item => item.ok).map(item => item.employeeId);
  else if (meta.employeeId || payload.employeeId) ids = [meta.employeeId || payload.employeeId];
  else if (/^\/(?:admin\/)?employees\/[^/]+/.test(path)) ids = [decodeURIComponent(path.split('/')[path.startsWith('/admin/') ? 3 : 2])];
  else if (path.startsWith('/payroll-requests')) {
    let requestIds = [];
    if (Array.isArray(payload.results)) requestIds = payload.results.filter(item => item.included).map(item => item.requestId);
    else if (Array.isArray(payload.ids)) requestIds = payload.ids;
    else if (body.requestId) requestIds = [body.requestId];
    else if (/^\/payroll-requests\/[^/]+\//.test(path)) requestIds = [decodeURIComponent(path.split('/')[2])];
    if (requestIds.length) ids = (await db.collection('payroll_requests').find({ id: { $in: requestIds } }, { projection: { employeeId: 1 } }).toArray()).map(item => item.employeeId);
  }
  ids = [...new Set(ids.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 200))];
  const createdAt = new Date();
  const events = ids.map(employeeId => ({ id: crypto.randomUUID(), employeeId, ...copy, createdAt, read: false, ...(meta.date ? { date: meta.date } : {}), requestId }));
  for (const event of events) await db.collection('employee_notifications').insertOne(event);
  return events;
}

export function employeeNotificationMiddleware(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  let payload;
  const path = req.path;
  const originalJson = res.json;
  res.json = function (value) { payload = value; return originalJson.call(this, value); };
  res.on('finish', () => {
    void notifyAdminAction(mongoose.connection.db, { path, body: req.body, payload, meta: res.locals.auditMetadata,
      statusCode: res.statusCode, actorRole: req.auth?.actor?.role, skip: res.locals.skipAudit, requestId: req.requestId,
    }).catch(error => console.error('Employee notification write failed:', error.message));
  });
  next();
}
