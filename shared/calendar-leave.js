export function requestedLeaveDatesFor(request) {
  if (request.requestedDates?.length) return [...new Set(request.requestedDates)].sort();
  const start = new Date(`${request.startDate}T00:00:00Z`);
  const end = new Date(`${request.endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const dates = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(cursor.toISOString().slice(0, 10));
  return dates;
}

export function leaveDateStatus(request, date, today) {
  return request.status === 'pending' && date < today ? 'passed' : request.status;
}

export function leaveDateProgress(request, today) {
  const dates = requestedLeaveDatesFor(request);
  const pendingDates = request.status === 'pending' ? dates.filter(date => date >= today) : [];
  const passedDates = ['pending', 'passed'].includes(request.status) ? dates.filter(date => date < today) : [];
  const status = request.status === 'pending' && dates.length && !pendingDates.length ? 'passed' : request.status;
  return { status, pendingDates, passedDates };
}

// A request can have passed dates while its remaining dates still need review.
export function calendarLeavesForDate(requests, date, today) {
  return requests.filter(request => {
    if (!['approved', 'pending', 'passed'].includes(request.status)) return false;
    const dates = request.status === 'approved' ? request.approvedDates : request.requestedDates;
    return Array.isArray(dates) && dates.length ? dates.includes(date) : request.startDate <= date && date <= request.endDate;
  }).map(request => ({ ...request, status: leaveDateStatus(request, date, today) }));
}
