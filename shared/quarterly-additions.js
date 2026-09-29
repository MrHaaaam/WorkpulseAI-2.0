import { ADDITION_MAX, validBoundedNumber } from './field-limits.js';

export const additionFrequency = (item) => item.frequency === 'per-payroll' ? 'per-payroll' : 'quarterly';
export const quarterForDate = (date) => `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
export const validQuarter = (quarter) => typeof quarter === 'string' && /^(20\d{2})-Q[1-4]$/.test(quarter);
export const quarterLabel = (quarter) => `${quarter.slice(5)} ${quarter.slice(0, 4)}`;
export const nextQuarter = (quarter) => quarter.endsWith('4') ? `${Number(quarter.slice(0, 4)) + 1}-Q1` : `${quarter.slice(0, 6)}${Number(quarter.slice(-1)) + 1}`;
export const allowanceKey = (item) => String(item.sourceKey || item.type || item.label || '').replace(/ allowance \(Q[1-4] \d{4}\)$/, '').normalize('NFC').trim().toLowerCase();
export function manilaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function frequencyForQuarter(item, quarter) {
  const history = item.frequencyHistory;
  if (!quarter || !Array.isArray(history) || !history.length) return additionFrequency(item);
  const applicable = history.filter(entry => entry.fromQuarter <= quarter).sort((a, b) => a.fromQuarter.localeCompare(b.fromQuarter));
  return applicable.at(-1)?.frequency ?? null;
}

// History is server-owned. Changing an existing frequency only changes the next quarter.
export function scheduleIdentifierFrequencies(existing, identifiers, today = manilaDate()) {
  const currentQuarter = quarterForDate(today);
  const effectiveQuarter = nextQuarter(currentQuarter);
  return identifiers.map(item => {
    const previous = (existing?.identifiers || []).find(old => allowanceKey(old) === allowanceKey(item));
    if (!previous) return { ...item, eligibleFromQuarter: currentQuarter, frequencyHistory: [{ fromQuarter: currentQuarter, frequency: additionFrequency(item) }] };
    const history = previous.frequencyHistory?.length ? previous.frequencyHistory : [{ fromQuarter: previous.eligibleFromQuarter || '2000-Q1', frequency: additionFrequency(previous) }];
    const retained = history.filter(entry => entry.fromQuarter < effectiveQuarter);
    const currentFrequency = frequencyForQuarter({ ...previous, frequencyHistory: retained }, currentQuarter);
    if (additionFrequency(item) !== currentFrequency) retained.push({ fromQuarter: effectiveQuarter, frequency: additionFrequency(item) });
    return { ...item, eligibleFromQuarter: previous.eligibleFromQuarter, frequencyHistory: retained };
  });
}
export function configuredAdditions(employee, frequency, quarter) {
  return (Array.isArray(employee.identifiers) ? employee.identifiers : [])
    .filter((item) => item?.value && (!quarter || !item.eligibleFromQuarter || item.eligibleFromQuarter <= quarter) && frequencyForQuarter(item, quarter) === frequency && validBoundedNumber(item.amount, 0.01, ADDITION_MAX))
    .map((item) => ({
      label: `${String(item.type).trim()}${frequency === 'quarterly' ? ` allowance (${quarterLabel(quarter)})` : ''}`,
      value: item.amount,
      sourceKey: allowanceKey(item), frequency,
      ...(quarter ? { coverageQuarter: quarter } : {}),
      ...(frequency === 'quarterly' ? { quarter } : {}),
    }));
}
