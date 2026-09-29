const clockMinutes = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '')
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null;

export function workHourOrderError(startTime, workStopTime, overtimeStopTime) {
  const start = clockMinutes(startTime);
  const stop = clockMinutes(workStopTime);
  const overtimeStop = clockMinutes(overtimeStopTime);
  if (start == null || stop == null || overtimeStop == null) return 'Enter all three work times.';
  const regularMinutes = (stop - start + 1440) % 1440;
  const maximumMinutes = (overtimeStop - start + 1440) % 1440;
  if (!regularMinutes || !maximumMinutes || regularMinutes > maximumMinutes) return 'Set Work stops after Work starts, and Overtime stops at or after Work stops.';
  return null;
}
