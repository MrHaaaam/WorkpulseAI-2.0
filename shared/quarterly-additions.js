import { ADDITION_MAX, validBoundedNumber } from './field-limits.js';

export const additionFrequency = (item) => item.frequency === 'per-payroll' ? 'per-payroll' : 'quarterly';
export const quarterForDate = (date) => `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
export const validQuarter = (quarter) => typeof quarter === 'string' && /^(20\d{2})-Q[1-4]$/.test(quarter);
export const quarterLabel = (quarter) => `${quarter.slice(5)} ${quarter.slice(0, 4)}`;
export const nextQuarter = (quarter) => quarter.endsWith('4') ? `${Number(quarter.slice(0, 4)) + 1}-Q1` : `${quarter.slice(0, 6)}${Number(quarter.slice(-1)) + 1}`;
export const allowanceKey = (item) => String(item.sourceKey || item.type || item.label || '').replace(/ allowance \(Q[1-4] \d{4}\)$/, '').normalize('NFC').trim().toLowerCase();
export const COMBINED_ADDITION_KEY = 'owner-funded-addition';
export function combinedSalaryAddition(employee) {
  if (employee.salaryAddition) return employee.salaryAddition;
  const parts = (employee.identifiers || []).filter(item => validBoundedNumber(item.amount, 0.01, ADDITION_MAX));
  if (!parts.length) return { amount: 0, frequency: 'quarterly' };
  const amount = Math.round(parts.reduce((sum, item) => sum + Number(item.amount), 0) * 100) / 100;
  const starts = parts.map(item => item.eligibleFromQuarter).filter(Boolean).sort();
  return { amount, frequency: 'quarterly', ...(starts.length ? { eligibleFromQuarter: starts[0] } : {}) };
}
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
export function scheduleIdentifierFrequencies(existing, identifiers, today = manilaDate(), newAllowanceQuarter = quarterForDate(today)) {
  const currentQuarter = quarterForDate(today);
  const effectiveQuarter = nextQuarter(currentQuarter);
  return identifiers.map(item => {
    const previous = (existing?.identifiers || []).find(old => allowanceKey(old) === allowanceKey(item));
    if (!previous) return { ...item, eligibleFromQuarter: newAllowanceQuarter, frequencyHistory: [{ fromQuarter: newAllowanceQuarter, frequency: additionFrequency(item) }] };
    const history = previous.frequencyHistory?.length ? previous.frequencyHistory : [{ fromQuarter: previous.eligibleFromQuarter || '2000-Q1', frequency: additionFrequency(previous) }];
    const retained = history.filter(entry => entry.fromQuarter < effectiveQuarter);
    const currentFrequency = frequencyForQuarter({ ...previous, frequencyHistory: retained }, currentQuarter);
    if (additionFrequency(item) !== currentFrequency) retained.push({ fromQuarter: effectiveQuarter, frequency: additionFrequency(item) });
    return { ...item, eligibleFromQuarter: previous.eligibleFromQuarter, frequencyHistory: retained };
  });
}
export function scheduleSalaryAddition(existing, incoming, today = manilaDate(), newAllowanceQuarter = quarterForDate(today)) {
  const previous = existing?.salaryAddition || (existing ? combinedSalaryAddition(existing) : null);
  const currentQuarter = quarterForDate(today);
  const oldEveryPayroll = existing?.salaryAddition?.frequency === 'per-payroll' || (existing && !existing.salaryAddition && (existing.identifiers || []).some(item => Number(item.amount) > 0 && additionFrequency(item) === 'per-payroll'));
  const eligibleFromQuarter = oldEveryPayroll ? nextQuarter(currentQuarter) : previous?.amount > 0 ? previous.eligibleFromQuarter || newAllowanceQuarter : newAllowanceQuarter;
  return { amount: incoming.amount, frequency: 'quarterly', eligibleFromQuarter, frequencyHistory: [{ fromQuarter: eligibleFromQuarter, frequency: 'quarterly' }] };
}
export function configuredAdditions(employee, frequency, quarter) {
  if (!employee.salaryAddition) return (Array.isArray(employee.identifiers) ? employee.identifiers : [])
    .filter((item) => item?.value && (!quarter || !item.eligibleFromQuarter || item.eligibleFromQuarter <= quarter) && frequencyForQuarter(item, quarter) === frequency && validBoundedNumber(item.amount, 0.01, ADDITION_MAX))
    .map((item) => ({ label: `${String(item.type).trim()}${frequency === 'quarterly' ? ` allowance (${quarterLabel(quarter)})` : ''}`, value: item.amount, sourceKey: allowanceKey(item), frequency,
      ...(quarter ? { coverageQuarter: quarter } : {}), ...(frequency === 'quarterly' ? { quarter } : {}) }));
  const addition = combinedSalaryAddition(employee);
  if (!validBoundedNumber(addition.amount, 0.01, ADDITION_MAX) || (quarter && addition.eligibleFromQuarter && addition.eligibleFromQuarter > quarter) || frequencyForQuarter(addition, quarter) !== frequency) return [];
  return [{ label: `Owner-funded addition${frequency === 'quarterly' ? ` (${quarterLabel(quarter)})` : ''}`, value: addition.amount, sourceKey: COMBINED_ADDITION_KEY, frequency,
    ...(quarter ? { coverageQuarter: quarter } : {}), ...(frequency === 'quarterly' ? { quarter } : {}) }];
}
