import { payrollTransaction } from './payroll-transaction.js';

function problem(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

export function hasRecordedWork(record) {
  return Boolean(record?.checkIn || record?.checkOut || record?.sessions?.some(session => session.checkIn || session.checkOut));
}

export function requestedLeaveDates(request) {
  return [...new Set(Array.isArray(request.requestedDates) ? request.requestedDates.map(String) : [])].sort();
}

export function payrollCoversDate(record, date) {
  const start = String(record.periodStart ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
  const [year, month, day] = start.split('-').map(Number);
  const end = record.periodEnd ? String(record.periodEnd).slice(0, 10)
    : `${start.slice(0, 7)}-${day <= 15 ? '15' : String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  return start <= date && date <= end;
}

export async function leaveApprovalPreview(db, request, { today, isWorkday }) {
  const dates = requestedLeaveDates(request);
  const attendance = await db.collection('attendance').find({ employeeId: request.employeeId, date: { $in: dates } }).toArray();
  const payroll = await db.collection('payroll_requests').find({ employeeId: request.employeeId }).toArray();
  const approvedLeaves = await db.collection('leave_requests').find({ employeeId: request.employeeId, status: 'approved' }).toArray();
  return {
    today,
    dates: dates.map(date => {
      const records = attendance.filter(record => record.date === date);
      const coveringPayroll = payroll.filter(record => payrollCoversDate(record, date));
      const paidPayroll = coveringPayroll.some(record => ['paid', 'approved'].includes(record.status) || record.paidAt || record.settledBy);
      const worked = records.some(hasRecordedWork);
      const overlappingLeave = approvedLeaves.some(leave => leave.id !== request.id && (leave.approvedDates?.length ? leave.approvedDates.includes(date) : leave.startDate <= date && date <= leave.endDate));
      const blockedReason = worked ? 'Time-in or time-out recorded. Existing work cannot be replaced.'
        : paidPayroll ? 'Payroll already paid. Use a separate payroll adjustment process.'
        : !isWorkday(date) ? 'Holiday or rest day. Leave cannot be approved.'
        : overlappingLeave || records.some(record => record.status === 'On Leave' && record.leaveRequestId !== request.id) ? 'Already covered by approved leave.' : null;
      return { date, past: date < today, attendanceStatus: records[0]?.status ?? 'No record', blockedReason, paidPayroll, hasTimeIn: worked };
    }),
    attendance,
    payroll,
  };
}

/** Save the request, attendance changes, and correction history in one snapshot. */
export async function decideLeaveRequest(db, { id, employeeIds, status, approvedDates, correctionReason, confirmPastCorrection, actor, today, isWorkday, bulk = false }) {
  if (!['approved', 'rejected'].includes(status)) throw problem('Choose an approval or decline decision.', 400);
  const saveDecision = async transactionDb => {
    const request = await transactionDb.collection('leave_requests').findOne({ id, employeeId: { $in: employeeIds }, status: { $in: status === 'approved' ? ['pending', 'passed'] : ['pending'] } });
    if (!request) throw problem('Request is no longer available for this decision. Refresh leave requests.');
    let selected = [];
    let preview;
    let pastDates = [];
    const reason = String(correctionReason ?? '').trim();
    if (status === 'approved') {
      if (!request.employeeId) throw problem('This request has no employee account to update.');
      const requested = requestedLeaveDates(request);
      selected = [...new Set((Array.isArray(approvedDates) ? approvedDates : requested.filter(date => date >= today)).map(String))].sort();
      if (bulk && requested.some(date => date < today)) throw problem('Contains past dates. Review this request individually; bulk approval cannot correct past attendance.');
      if (!selected.length || selected.some(date => !requested.includes(date))) throw problem('Select at least one of the employee’s requested dates.', 400);
      if (selected.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw problem('The request contains an invalid leave date.', 400);
      pastDates = selected.filter(date => date < today);
      if (pastDates.length && (!confirmPastCorrection || reason.length < 5 || reason.length > 500)) throw problem('Past dates require a correction reason (5–500 characters) and explicit confirmation.', 400);
      preview = await leaveApprovalPreview(transactionDb, request, { today, isWorkday });
      const blocked = preview.dates.find(item => selected.includes(item.date) && item.blockedReason);
      if (blocked) throw problem(`${blocked.date}: ${blocked.blockedReason}`);

      // Touch covering unpaid payroll records so a concurrent payment changes
      // this transaction's snapshot and forces the paid-payroll check to retry.
      for (const payroll of preview.payroll.filter(record => selected.some(date => payrollCoversDate(record, date)))) {
        const locked = await transactionDb.collection('payroll_requests').updateOne({ _id: payroll._id, status: payroll.status }, { $inc: { leaveReviewVersion: 1 } });
        if (!locked.matchedCount) throw problem('Payroll changed during review. Refresh and try again.');
      }
      for (const date of selected) {
        const records = preview.attendance.filter(record => record.date === date);
        if (records.length > 1) throw problem(`${date}: duplicate attendance records need administrator review.`);
        const attendance = records[0];
        const fields = { name: request.employeeName, role: request.role, status: 'On Leave', leaveRequestId: request.id, updatedAt: new Date() };
        if (attendance) {
          const updated = await transactionDb.collection('attendance').updateOne({ _id: attendance._id, status: attendance.status }, {
            $set: fields, $unset: { idleDay: '', idleDayBy: '', idleDayAt: '', automaticAbsence: '' },
          });
          if (!updated.matchedCount) throw problem('Attendance changed during review. Refresh and try again.');
        } else {
          await transactionDb.collection('attendance').insertOne({ employeeId: request.employeeId, date, checkIn: null, checkOut: null, sessions: [], createdAt: new Date(), ...fields });
        }
      }
    }
    const reviewedAt = new Date();
    const decision = { status, approvedDates: selected, pastDates, correctionReason: pastDates.length ? reason : '', reviewedBy: actor, reviewedAt,
      attendanceChanges: selected.map(date => ({ date, before: preview.dates.find(item => item.date === date)?.attendanceStatus ?? 'No record', after: 'On Leave' })) };
    const updated = await transactionDb.collection('leave_requests').findOneAndUpdate({ _id: request._id, status: request.status }, {
      $set: { status, approvedDates: selected, totalDays: status === 'approved' ? selected.length : request.totalDays, reviewedAt, reviewedBy: actor },
      $push: { approvalHistory: decision },
    }, { returnDocument: 'after' });
    if (!updated) throw problem('Leave request changed during review. Refresh and try again.');
    return { request: updated, decision };
  };
  // A decline only touches one document. It stays atomic without requiring a
  // multi-document transaction or affecting local installations' decline flow.
  return status === 'approved' ? payrollTransaction(db, saveDecision) : saveDecision(db);
}
