import { employeeRoleLabel } from '../../shared/employee-roles.js';
import crypto from 'node:crypto';
import { attendanceWindowError } from '../../shared/attendance-window.js';
import { payrollTransaction } from './payroll-transaction.js';
import { payrollCoversDate } from './leave-approval.js';
import { approvedLeaveCoversDate } from './manual-attendance.js';

const problem = (message, status = 409) => Object.assign(new Error(message), { status });
export function attendanceCorrectionBlockReason({ employee, attendance, leaves = [], payroll = [], date, now = new Date() }) {
  if (!employee || employee.archived || employee.banned || employee.status === 'inactive') return 'This employee is inactive or unavailable.';
  if (date > manilaDate(now)) return 'Choose today or a valid past date.';
  if (attendance?.status === 'On Leave' || leaves.some(leave => approvedLeaveCoversDate(leave, date))) return 'This date has approved leave. Resolve the leave before correcting attendance.';
  if (payroll.some(item => payrollCoversDate(item, date) && (['paid', 'approved', 'carried_over'].includes(item.status) || item.paidAt || item.settledBy || item.rolledInto || item.calculationResetAt))) return 'Payroll for this date is already paid, settled, carried forward, or reset. Resolve payroll separately before correcting attendance.';
  if (!attendanceSessions(attendance).length && employee.createdAt && date < manilaDate(new Date(employee.createdAt))) return 'New attendance cannot precede the employee account. Select a date on or after account creation.';
  return null;
}
export function manilaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function validAttendanceDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
export function inputTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '';
  let hour = Number(match[1]);
  if (match[3]) { if (hour < 1 || hour > 12) return ''; hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0); }
  return hour < 24 && Number(match[2]) < 60 ? `${String(hour).padStart(2, '0')}:${match[2]}` : '';
}
function requiredTime(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw problem('Use a valid time in HH:MM format.', 400);
  return time;
}
export function attendanceSessions(record) {
  return record?.sessions?.length ? record.sessions.map(session => ({ ...session })) : record?.checkIn ? [{ checkIn: record.checkIn, checkOut: record.checkOut || null }] : [];
}
export function attendanceVersion(record) {
  return crypto.createHash('sha256').update(JSON.stringify(record ?? null)).digest('hex');
}
function displayTime(time) {
  const [hour, minute] = time.split(':').map(Number);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function timesForSession(date, checkIn, checkOut) {
  const start = checkIn ? new Date(`${date}T${requiredTime(inputTime(checkIn))}:00+08:00`) : null;
  const end = checkOut ? new Date(`${date}T${requiredTime(inputTime(checkOut))}:00+08:00`) : null;
  if (start && end && end < start) end.setUTCDate(end.getUTCDate() + 1);
  if (start && end && end.getTime() === start.getTime()) throw problem('Time-out must be after time-in.', 400);
  return { start, end };
}

export function correctedSessions(record, correction, { checkIn, checkOut, now, actor, actorName, reason, sessionDefaults }) {
  const sessions = attendanceSessions(record);
  const index = correction.sessionNumber - 1;
  if (index > sessions.length || sessions.length > 3) throw problem('Correct earlier sessions first; sessions cannot be skipped.');
  const previous = sessions[index];
  if (!checkIn) {
    if (checkOut) throw problem('Time-out requires a time-in. Clear both times to remove an accidental session.', 400);
    if (!previous) throw problem('There is no existing session to remove.', 400);
    sessions.splice(index, 1);
    return sessions;
  }
  requiredTime(checkIn);
  if (checkOut) requiredTime(checkOut);
  if (!checkOut && correction.date < manilaDate(now) && !previous) throw problem('Past attendance needs both time-in and time-out.', 400);
  const target = timesForSession(correction.date, checkIn, checkOut);
  const windowError = attendanceWindowError(checkIn, checkOut, { ...sessionDefaults, ...previous });
  if (windowError) throw problem(windowError, 400);
  if (target.start > now || target.end > now) throw problem('Attendance times cannot be in the future.', 400);
  sessions[index] = { ...sessionDefaults, ...previous, checkIn: displayTime(checkIn), checkOut: checkOut ? displayTime(checkOut) : null,
    checkInAt: target.start, checkOutAt: target.end, captureMethod: 'admin-manual', manualReason: 'Attendance correction',
    manualNote: reason, manualRecordedBy: actor, manualRecordedByName: actorName || actor, correctedAt: now,
    autoClockedOut: false, suppressAutomaticClockOut: !checkOut && Boolean(previous?.checkOut || previous?.suppressAutomaticClockOut), ...(checkOut ? { manualClockOut: true, manualClockOutBy: actor } : { manualClockOut: false }) };
  let lastEnd = null;
  sessions.forEach((session, position) => {
    const { start, end } = timesForSession(correction.date, session.checkIn, session.checkOut);
    if (position && (!lastEnd || start < lastEnd)) {
      const previousSession = sessions[position - 1];
      throw problem(`Session ${position + 1} cannot start at ${session.checkIn}: Session ${position} is ${previousSession.checkIn} to ${previousSession.checkOut || 'Open (no time-out)'}. ${lastEnd ? `Start Session ${position + 1} at or after Session ${position}'s time-out ${previousSession.checkOut}. Sessions cannot overlap or run in reverse order.` : `Complete Session ${position}'s time-out before starting another session.`} No attendance changes were saved.`, 400);
    }
    if (!end && position !== sessions.length - 1) throw problem('Only the last session can remain open.', 400);
    lastEnd = end;
  });
  return sessions;
}

export async function correctAttendance(db, { employeeId, date, sessionNumber, reason, version, checkIn, checkOut, actor, actorName, now = new Date(), getSessionDefaults, refreshPayroll, operationKey, operationHash, captureOnly = false }) {
  if (typeof employeeId !== 'string' || !employeeId || employeeId.length > 200) throw problem('Choose an employee.', 400);
  if (!validAttendanceDate(date) || date > manilaDate(now)) throw problem('Choose today or a valid past date.', 400);
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 3) throw problem('Choose session 1, 2, or 3.', 400);
  if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) throw problem('Provide a correction reason in 5–500 characters.', 400);
  const timeOutOnly = Boolean(operationKey && captureOnly && !checkIn && checkOut);
  const preserveTimeIn = Boolean(!checkIn && checkOut);
  if (captureOnly && !checkIn && !timeOutOnly) throw problem('Enter a time-in or a time-out to capture offline attendance.', 400);
  const correction = { employeeId, date, sessionNumber };
  const work = async tx => {
    if (operationKey) {
      const receipt = await tx.collection('offline_operations').findOne({ _id: operationKey });
      if (receipt) {
        if (receipt.kind !== 'attendance' || receipt.operationHash !== operationHash) throw problem('Offline operation ID already belongs to a different action or payload.');
        return receipt.result;
      }
    }
    const decision = { correctedBy: actor, correctedByName: actorName || actor, correctedAt: now, reason: reason.trim(), sessionNumber };
      const employee = await tx.collection('employees').findOne({ id: employeeId });
      if (!employee || employee.archived || employee.banned || employee.status === 'inactive') throw problem('This employee is inactive or unavailable.');
      // Share the employee write lock with payroll preparation/payment, including
      // periods whose payroll statement did not exist when this transaction began.
      const employeeLock = await tx.collection('employees').updateOne({ id: employeeId }, { $inc: { attendanceReviewVersion: 1 } });
      if (!employeeLock.matchedCount) throw problem('Employee changed during review. Refresh and try again.');
      const existing = await tx.collection('attendance').findOne({ employeeId, date });
      if (!captureOnly && !checkIn && checkOut) {
        const selected = attendanceSessions(existing)[sessionNumber - 1];
        if (!selected?.checkIn || selected.checkOut) throw problem(`Time-out ${checkOut} cannot be saved for ${employeeId} on ${date}: Session ${sessionNumber} ${selected?.checkOut ? `is already closed (${selected.checkIn} to ${selected.checkOut})` : 'has no recorded time-in'}. Select an open session with a time-in and no time-out. No attendance was changed.`, 400);
        checkIn = inputTime(selected.checkIn);
      }
      if (timeOutOnly) {
        const currentSessions = attendanceSessions(existing);
        const open = currentSessions.at(-1);
        if (!open || open.checkOut) throw problem(`Time-out ${checkOut} not applied for ${employeeId} on ${date}: ${open ? `Session ${currentSessions.length} is already closed (${open.checkIn} to ${open.checkOut})` : 'no recorded time-in exists'}. A time-out can only complete an open session. No attendance was changed.`);
        if (version !== attendanceVersion(null) && version !== attendanceVersion(existing)) throw problem(`Time-out ${checkOut} not applied for ${employeeId}: attendance changed since capture. Current open Session ${currentSessions.length} started at ${open.checkIn}. Review this session online before retrying; no attendance was changed.`);
        checkIn = inputTime(open.checkIn);
        if (timesForSession(date, checkIn, checkOut).end <= timesForSession(date, checkIn, '').start) throw problem(`Time-out ${checkOut} must be later than Session ${currentSessions.length}'s time-in ${open.checkIn}. No attendance was changed.`, 400);
        sessionNumber = currentSessions.length;
        correction.sessionNumber = sessionNumber;
        decision.sessionNumber = sessionNumber;
      }
      // Imported historical time records can predate account registration.
      // Their recorded sessions remain editable; registration still bounds new attendance.
      if (!attendanceSessions(existing).length && employee.createdAt && date < manilaDate(new Date(employee.createdAt))) throw problem('New attendance cannot precede the employee account. Select a date on or after account creation.');
      const emptyOfflineCapture = operationKey && captureOnly === true && version === attendanceVersion(null) && !attendanceSessions(existing).length;
      if (!timeOutOnly && !emptyOfflineCapture && version !== attendanceVersion(existing)) {
        if (operationKey) {
          const sessions = attendanceSessions(existing);
          const current = sessions.length ? sessions.map((session, index) => `Session ${index + 1}: ${session.checkIn} to ${session.checkOut || 'Open (not yet timed out)'}`).join('; ') : 'No recorded sessions';
          throw problem(`Attendance sync blocked for ${employeeId} on ${date}: attendance changed after this offline entry was captured. Current server attendance: ${current}. Your queued Session ${sessionNumber} (${checkIn || 'no time-in'} to ${checkOut || 'no time-out'}) was not applied. Existing time-in and time-out were not overwritten, and no new session was created. Open Edit Attendance for this employee and date, compare the times, and save a correction if needed. Retrying this unchanged offline entry will not resolve the conflict.`);
        }
        throw problem('Attendance changed. Reload the current times before saving.');
      }
      const leaves = await tx.collection('leave_requests').find({ employeeId, status: 'approved' }).toArray();
      if (operationKey && captureOnly && !timeOutOnly) {
        const currentSessions = attendanceSessions(existing);
        if (currentSessions.some(session => !session.checkOut)) throw problem('Offline capture cannot replace an open server session. Reconnect and use Edit Attendance to complete it. The local entry was not applied.');
        if (sessionNumber !== currentSessions.length + 1) throw problem('Offline capture can only add the next attendance session; it cannot edit existing sessions. The local entry was not applied.');
      }
      const payroll = await tx.collection('payroll_requests').find({ employeeId }).toArray();
      // Lock every payroll statement: a later carried statement may already contain this date's earnings.
      const blockedReason = attendanceCorrectionBlockReason({ employee, attendance: existing, leaves, payroll, date, now });
      if (blockedReason) throw problem(blockedReason);
      for (const item of payroll) {
        const locked = await tx.collection('payroll_requests').updateOne({ _id: item._id, status: item.status }, { $inc: { attendanceReviewVersion: 1 } });
        if (!locked.matchedCount) throw problem('Payroll changed during review. Refresh and try again.');
      }
      const sessions = correctedSessions(existing, correction, { checkIn, checkOut, now, actor, actorName: decision.correctedByName, reason: decision.reason, sessionDefaults: await getSessionDefaults(tx, employee) });
      if (preserveTimeIn) {
        const original = attendanceSessions(existing)[sessionNumber - 1];
        sessions[sessionNumber - 1].checkIn = original.checkIn;
        if (original.checkInAt) sessions[sessionNumber - 1].checkInAt = original.checkInAt;
      }
      const adjacentDates = [-1, 1].map(offset => { const adjacentDate = new Date(`${date}T00:00:00Z`); adjacentDate.setUTCDate(adjacentDate.getUTCDate() + offset); return adjacentDate.toISOString().slice(0, 10); });
      const adjacent = await tx.collection('attendance').find({ employeeId, date: { $in: adjacentDates } }).toArray();
      for (const other of adjacent) {
        for (const otherSession of attendanceSessions(other)) {
          const otherTimes = timesForSession(other.date, otherSession.checkIn, otherSession.checkOut);
          for (const session of sessions) {
            const targetTimes = timesForSession(date, session.checkIn, session.checkOut);
            if (targetTimes.start < (otherTimes.end ?? now) && otherTimes.start < (targetTimes.end ?? now)) throw problem('These times overlap attendance on an adjacent date. Review both days first.');
          }
        }
      }
      const companyIdle = await tx.collection('idle_days').findOne({ date });
      const fields = { name: employee.name, role: employeeRoleLabel(employee.role), sessions, sessionCount: sessions.length,
        checkIn: sessions[0]?.checkIn || null, checkOut: sessions.at(-1)?.checkOut || null, status: existing?.idleDay || companyIdle ? 'Idle' : sessions.length ? 'Present' : 'Absent',
        lastAction: sessions.length ? sessions.at(-1).checkOut ? 'time-out' : 'time-in' : null, autoClockedOut: false, updatedAt: now, manualRecordedBy: actor,
        ...(companyIdle ? { idleDay: true } : {}) };
      decision.before = attendanceSessions(existing);
      decision.after = sessions;
      const selectedAfter = sessions.length < decision.before.length ? null : sessions[sessionNumber - 1];
      if (existing) {
        const updated = await tx.collection('attendance').updateOne({ _id: existing._id, updatedAt: existing.updatedAt ?? { $exists: false }, sessions: existing.sessions ?? { $exists: false } }, { $set: fields, $unset: { automaticAbsence: '' }, $push: { correctionHistory: decision } });
        if (!updated.matchedCount) throw problem('Attendance changed during review.');
      } else {
        await tx.collection('attendance').insertOne({ employeeId: employee.id, date, ...fields, createdAt: now, identityVerified: false, correctionHistory: [decision] });
      }
      await refreshPayroll(tx, employee, date);
      await tx.collection('employee_notifications').insertOne({ id: crypto.randomUUID(), employeeId, category: 'attendance', title: `Attendance corrected by admin ${decision.correctedByName}`,
        description: `${date}, session ${sessionNumber}: ${decision.before[sessionNumber - 1]?.checkIn || 'No time-in'} → ${decision.before[sessionNumber - 1]?.checkOut || 'No time-out'} changed to ${selectedAfter?.checkIn || 'No time-in'} → ${selectedAfter?.checkOut || (selectedAfter ? 'Open' : 'No time-out')}. Reason: ${decision.reason}`,
        section: 'attendance', date, createdAt: now, read: false });
      const result = { employeeId, date, ...decision };
      if (operationKey) await tx.collection('offline_operations').insertOne({ _id: operationKey, kind: 'attendance', operationHash, result, createdAt: now });
      return result;
  };
  return payrollTransaction(db, work);
}
