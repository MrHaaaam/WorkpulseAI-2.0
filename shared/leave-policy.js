export const MAX_LEAVE_REQUEST_DAYS = 10;

export function leaveRequestDaysError(dates) {
  const count = new Set(dates).size;
  return count < 1 || count > MAX_LEAVE_REQUEST_DAYS
    ? `Select between 1 and ${MAX_LEAVE_REQUEST_DAYS} leave days per request.`
    : null;
}
