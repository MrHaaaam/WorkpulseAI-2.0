export function checkoutIsChronological(date, session, checkoutAt) {
  let checkInAt;
  if (session.checkInAt) checkInAt = new Date(session.checkInAt);
  else {
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(session.checkIn ?? '');
    if (!match) return false;
    let hour = Number(match[1]);
    if (Number(match[2]) > 59 || Number(match[3] ?? 0) > 59 || (match[4] ? hour < 1 || hour > 12 : hour > 23)) return false;
    if (match[4]) hour = hour % 12 + (match[4].toUpperCase() === 'PM' ? 12 : 0);
    checkInAt = new Date(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}+08:00`);
  }
  const end = new Date(checkoutAt).getTime();
  return Number.isFinite(end) && Number.isFinite(checkInAt.getTime()) && end > checkInAt.getTime();
}
