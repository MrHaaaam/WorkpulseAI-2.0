function clockMinutes(value) {
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM)?$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  } else if (hour > 23) return null;
  return hour * 60 + Number(match[2]);
}

export function recordedDayTime(record) {
  const sessions = record?.sessions?.length ? record.sessions : record?.checkIn ? [record] : [];
  let minutes = 0;
  let openSessions = 0;
  for (const session of sessions) {
    const start = clockMinutes(session.checkIn);
    if (start === null) continue;
    if (!session.checkOut) { openSessions++; continue; }
    const end = clockMinutes(session.checkOut);
    if (end === null) continue;
    minutes += end < start ? end + 1440 - start : end - start;
  }
  return { minutes, openSessions, label: `${Math.floor(minutes / 60)}h ${minutes % 60}m` };
}
