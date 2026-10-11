import { employeeRoleLabel } from '../../shared/employee-roles.js';
import crypto from 'node:crypto';
import { payrollTransaction } from './payroll-transaction.js';
import { correctAttendance, validAttendanceDate, manilaDate } from './attendance-corrections.js';
import { leaveRequestDaysError } from '../../shared/leave-policy.js';

const problem = (message, status = 409) => Object.assign(new Error(message), { status });
export function offlineOperationKey(actor, id) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id || '')) throw problem('Invalid offline operation ID.', 400);
  if (!actor?._id) throw problem('Sign in before synchronizing.', 401);
  return `${actor.role === 'admin' ? 'admin' : 'employee'}:${String(actor._id)}:${id}`;
}
export async function syncOfflineOperation(db, { actor, operation, now = new Date(), getSettings, scheduledWorkStatus, payrollPeriodKey, getSessionDefaults, refreshPayroll }) {
  const key = offlineOperationKey(actor, operation?.id);
  const kind = operation?.kind;
  const body = operation?.payload;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw problem('Invalid offline payload.', 400);
  const operationHash = crypto.createHash('sha256').update(JSON.stringify({ kind, body })).digest('hex');
  if (kind === 'attendance') {
    if (actor.role !== 'admin') throw problem('Administrator access required.', 403);
    return correctAttendance(db, { ...body, actor: actor.email, now, operationKey: key, operationHash, getSessionDefaults, refreshPayroll });
  }
  if (!['leave', 'cash-advance'].includes(kind) || !['regular', 'extra', 'manager', 'supervisor'].includes(actor.role) || !actor.employeeId) throw problem('This action is unavailable for offline synchronization.', 403);
  const employeeId = actor.employeeId;
  return payrollTransaction(db, async tx => {
    const receipt = await tx.collection('offline_operations').findOne({ _id: key });
    if (receipt) {
      if (receipt.kind !== kind || receipt.operationHash !== operationHash) throw problem('Offline operation ID already belongs to a different action or payload.');
      return receipt.result;
    }
    const employee = await tx.collection('employees').findOne({ id: employeeId, archived: { $ne: true }, banned: { $ne: true }, status: { $ne: 'inactive' } });
    if (!employee) throw problem('Active employee profile not found.', 403);
    // Serializes concurrent requests for the same employee, including overlap checks.
    const lock = await tx.collection('employees').updateOne({ _id: employee._id }, { $inc: { offlineReviewVersion: 1 } });
    if (!lock.matchedCount) throw problem('Employee changed during synchronization.');
    const settings = await getSettings(tx);
    let result;
    if (kind === 'leave') {
      const dates = Array.isArray(body.requestedDates) ? [...new Set(body.requestedDates)].sort() : [];
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!['Annual Leave', 'Sick Leave', 'Personal Leave', 'Maternity Leave'].includes(body.leaveType)) throw problem('Select a valid leave type.', 400);
      const daysError = leaveRequestDaysError(dates);
      if (daysError || dates.some(date => !validAttendanceDate(date))) throw problem(daysError || 'Invalid leave date.', 400);
      const capturedOn = validAttendanceDate(body.capturedOn) ? body.capturedOn : null;
      if (capturedOn && capturedOn > manilaDate(now)) throw problem('The device capture date is in the future. Check the device clock.', 400);
      // Preserve the existing online workflow for deliberately backdated requests.
      // Dates that passed while a future/current request waited offline need review.
      if (dates.some(date => date < manilaDate(now) && (!capturedOn || date >= capturedOn))) throw problem('A queued leave date has passed. Review the dates and submit a new request.');
      if (dates.some(date => !scheduledWorkStatus(settings, date))) throw problem('A leave date is now a scheduled non-working day. Review the dates.');
      if (reason.length < 5 || reason.length > 500) throw problem('Provide a reason between 5 and 500 characters.', 400);
      const existing = await tx.collection('leave_requests').find({ employeeId, status: { $in: ['pending', 'approved'] } }).toArray();
      if (existing.some(item => dates.some(date => (item.approvedDates?.length ? item.approvedDates : item.requestedDates)?.includes(date) || (!item.requestedDates?.length && !item.approvedDates?.length && item.startDate <= date && date <= item.endDate)))) throw problem('Selected dates overlap another leave request.');
      result = { id: `LR-${crypto.randomUUID()}`, employeeId, employeeName: employee.name, role: employeeRoleLabel(employee.role), leaveType: body.leaveType,
        requestedDates: dates, approvedDates: [], startDate: dates[0], endDate: dates.at(-1), totalDays: dates.length, reason, status: 'pending',
        initials: employee.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(), createdAt: now, offlineOperationId: operation.id };
      await tx.collection('leave_requests').insertOne(result);
    } else {
      const amount = body.amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7 || amount > Math.min(1000000, settings.payroll.cashAdvanceMax)) throw problem('Enter a valid amount within the current cash advance limit.', 400);
      if (body.repaymentAgreed !== true) throw problem('Confirm the repayment terms.', 400);
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length > 500) throw problem('Reason must be 500 characters or fewer.', 400);
      const requestPeriod = payrollPeriodKey(now);
      if (body.requestPeriod !== requestPeriod) throw problem('The queued cash request belongs to an earlier payroll period. Review and submit it again.');
      if (await tx.collection('cash_advance_requests').findOne({ employeeId, $or: [{ open: true }, { requestPeriod, periodClaim: true }] })) throw problem('Another cash advance request is open or already exists for this period.');
      if (await tx.collection('cash_advances').findOne({ employeeId, issuePeriod: requestPeriod, reversedAt: { $exists: false } })) throw problem('Cash was already given for this payroll period.');
      result = { id: `CAR-${crypto.randomUUID()}`, employeeId, employeeName: employee.name, amount, reason, requestPeriod, periodClaim: true, status: 'pending', open: true, repaymentAgreedAt: now, requestedAt: now, offlineOperationId: operation.id };
      await tx.collection('cash_advance_requests').insertOne(result);
    }
    const publicResult = { ...result }; delete publicResult._id;
    await tx.collection('offline_operations').insertOne({ _id: key, kind, operationHash, result: publicResult, createdAt: now });
    return publicResult;
  });
}
