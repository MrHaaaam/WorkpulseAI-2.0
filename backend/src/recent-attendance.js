function eventDate(date, value, timestamp) {
  if (timestamp) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > (match[4] ? 12 : 23) || (match[4] && hour === 0)) return null;
  if (match[4]) hour = hour % 12 + (match[4].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}+08:00`);
}

export function recentAttendanceEvents(records, { today, limit = 8 }) {
  const events = [];
  for (const record of records) {
    if (record.date !== today || !record.employeeId) continue;
    const sessions = record.sessions?.length ? record.sessions : record.checkIn ? [record] : [];
    for (const [index, session] of sessions.entries()) {
      for (const [action, field] of [['time-in', 'checkIn'], ['time-out', 'checkOut']]) {
        if (!session[field]) continue;
        const date = eventDate(record.date, session[field], session[`${field}At`]);
        if (!date || Number.isNaN(date.getTime())) continue;
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        if (`${parts.year}-${parts.month}-${parts.day}` !== today) continue;
        events.push({
          id: `${record.employeeId}:${record.date}:${index}:${action}`,
          employeeId: record.employeeId, name: record.name || record.employeeId, action,
          recordedAt: date.toISOString(),
          time: date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }),
          automatic: action === 'time-out' && session.autoClockedOut === true,
        });
      }
    }
  }
  return events.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id)).slice(0, limit);
}
