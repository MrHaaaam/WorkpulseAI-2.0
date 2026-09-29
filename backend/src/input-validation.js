import { validEmail } from '../../shared/input-format.js';
import { HOURLY_RATE_MAX, validBoundedNumber } from '../../shared/field-limits.js';
export { validEmail };
export const normalizeName = (value) => String(value ?? '').normalize('NFC').trim().replace(/ +/g, ' ');
export const validName = (value) => typeof value === 'string' && value.length >= 2 && value.length <= 50 && /^(?=.*\p{L})[\p{L}\p{M} '\u2019.-]+$/u.test(value);
export const validAddress = (value) => typeof value === 'string' && value.length >= 5 && value.length <= 255;
export function employeeValidationError(employee) {
  if (employee.hourlyRateOverride != null && !validBoundedNumber(employee.hourlyRateOverride, 1, HOURLY_RATE_MAX)) return 'Employee hourly rate must be from 1 to 10,000 with at most 2 decimal places.';
  if (!validName(employee.firstName) || !validName(employee.lastName)) return 'First and last names must use 2–50 characters: letters, spaces, apostrophes, periods, or hyphens.';
  if (!validEmail(employee.email)) return 'Enter a valid email address using at most 254 characters.';
  if (!validAddress(employee.address)) return 'Enter an address using 5 to 255 characters.';
  return null;
}
