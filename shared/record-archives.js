export function archiveCutoff(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [year, month, day] = today.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 4, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function dateOnly(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function recordArchiveDate(kind, record) {
  if (kind === 'leave') return [...(record.requestedDates || []), record.endDate, record.startDate].filter(Boolean).sort().at(-1) || '';
  if (kind === 'additions') return dateOnly(record.paidAt);
  if (kind === 'payroll') {
    if (!/^\d{4}-\d{2}-(01|16)$/.test(record.periodStart || '')) return '';
    const [year, month, day] = record.periodStart.split('-').map(Number);
    return `${record.periodStart.slice(0, 7)}-${day === 1 ? '15' : new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  }
  if (kind === 'repayment') return dateOnly(record.paidAt) || record.periodStart || '';
  if (kind === 'cash-given') return dateOnly(record.date || record.createdAt);
  return dateOnly(record.requestedAt);
}

export function isArchivedRecord(kind, record, cutoff = archiveCutoff()) {
  const date = recordArchiveDate(kind, record);
  return Boolean(date && date <= cutoff);
}

export function keepActiveRecord(kind, record, cutoff = archiveCutoff()) {
  if (!isArchivedRecord(kind, record, cutoff)) return true;
  if (kind === 'leave') return record.status === 'pending';
  if (kind === 'cash') return ['pending', 'approved', 'accepted'].includes(record.status);
  if (kind === 'payroll') return !['paid', 'approved', 'carried_over'].includes(record.status);
  return false;
}
