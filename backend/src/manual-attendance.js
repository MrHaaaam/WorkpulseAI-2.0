export function manualAttendanceProblem({ action, sessions, workday, approvedLeave, maxSessions = 3 }) {
  const last = sessions.at(-1);
  const clockedIn = Boolean(last?.checkIn && !last?.checkOut);
  if (action === 'time-out') return clockedIn ? null : 'This employee is not clocked in. Refresh attendance.';
  if (action !== 'time-in') return 'Choose an attendance action.';
  if (clockedIn) return 'This employee is already clocked in. Refresh attendance.';
  if (!workday) return 'Today is a holiday or rest day. Time-in is unavailable.';
  if (approvedLeave) return 'This employee has approved leave today.';
  if (sessions.length >= maxSessions) return 'This employee has already completed three attendance sessions today.';
  return null;
}

export function approvedLeaveCoversDate(leave, date) {
  if (!leave || leave.status !== 'approved') return false;
  if (Array.isArray(leave.approvedDates) && leave.approvedDates.length) return leave.approvedDates.includes(date);
  return leave.startDate <= date && leave.endDate >= date;
}
