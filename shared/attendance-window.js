export function attendanceWindowError(checkIn, checkOut, schedule) {
  if (!checkIn || !schedule?.workStartTime || !schedule?.overtimeStopTime) return null;
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(schedule.workStartTime);
  let cutoff = minutes(schedule.overtimeStopTime);
  if (cutoff <= start) cutoff += 1440;
  const enteredStart = minutes(checkIn);
  let enteredEnd = checkOut ? minutes(checkOut) : null;
  if (enteredEnd !== null && enteredEnd < enteredStart) enteredEnd += 1440;
  const allowed = `Allowed attendance window: ${schedule.workStartTime} to ${schedule.overtimeStopTime}${cutoff >= 1440 ? ' the next day' : ''}.`;
  if (enteredStart < start) return `Time-in ${checkIn} is before the scheduled start ${schedule.workStartTime}. ${allowed} Enter a time within this window; times are not adjusted automatically.`;
  if (enteredStart > cutoff) return `Time-in ${checkIn} is after the final cutoff ${schedule.overtimeStopTime}. ${allowed} Enter a time within this window; times are not adjusted automatically.`;
  if (enteredEnd !== null && enteredEnd > cutoff) return `Time-out ${checkOut} is after the final cutoff ${schedule.overtimeStopTime}. ${allowed} Enter a time-out within this window; times are not adjusted automatically.`;
  return null;
}
