export const ADDITION_MAX = 1000000;
export const HOURLY_RATE_MAX = 10000;
const idLengths = { SSS: [10], PhilHealth: [12], 'Pag-IBIG': [12], TIN: [9, 12, 14] };
export const identifierLengths = (type) => Object.hasOwn(idLengths, type) ? idLengths[type] : null;
export function identifierInput(type, value) {
  const lengths = identifierLengths(type);
  if (!lengths) return value.replace(/[^a-zA-Z0-9 -]/g, '').slice(0, 50);
  return value.replace(/\D/g, '').slice(0, Math.max(...lengths));
}
export function validNumberInput(value, maximum, decimals = 2) {
  const pattern = decimals === 0 ? /^\d*$/ : new RegExp(`^\\d*(?:\\.\\d{0,${decimals}})?$`);
  return value.length <= String(maximum).length + (decimals ? decimals + 1 : 0) && pattern.test(value) && (value === '' || value === '.' || Number(value) <= maximum);
}
export function validBoundedNumber(value, minimum, maximum, decimals = 2) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum && Math.abs(value * 10 ** decimals - Math.round(value * 10 ** decimals)) < 0.000001;
}
export function identifiersValidationError(identifiers) {
  if (identifiers === undefined) return null;
  if (!Array.isArray(identifiers) || identifiers.length > 20) return 'Use at most 20 identification records.';
  for (const item of identifiers) {
    if (!item || typeof item.type !== 'string' || !item.type.trim() || item.type.length > 50) return 'Enter an ID type using at most 50 characters.';
    if (typeof item.value !== 'string') return `${item.type} identification number must be text.`;
    const lengths = identifierLengths(item.type);
    if (item.value.trim() && (lengths ? !/^[0-9]+(?:[ -][0-9]+)*$/.test(item.value) || !lengths.includes(item.value.replace(/[ -]/g, '').length) : !/^[a-zA-Z0-9 -]{1,50}$/.test(item.value))) return lengths ? `${item.type} must contain ${lengths.join(' or ')} digits; separators may be spaces or hyphens.` : 'Custom IDs must use at most 50 letters, numbers, spaces, or hyphens.';
    if (item.frequency !== undefined && !['quarterly', 'per-payroll'].includes(item.frequency)) return 'Choose Quarterly or Every payroll for the addition frequency.';
    if (!validBoundedNumber(item.amount, 0, ADDITION_MAX)) return 'Salary additions must be between 0 and 1,000,000 with at most 2 decimal places.';
  }
  return null;
}
export function settingsNumbersValidationError(settings) {
  for (const type of ['regular', 'extra', 'manager', 'supervisor']) {
    if (!validBoundedNumber(settings?.payroll?.hourlyRates?.[type], 1, HOURLY_RATE_MAX)) return 'Hourly rates must be from 1 to 10,000 with at most 2 decimal places.';
  }
  return null;
}
