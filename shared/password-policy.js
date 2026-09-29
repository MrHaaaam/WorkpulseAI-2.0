export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;
// Existing credentials may predate the new-password policy.
export const LOGIN_PASSWORD_MAX = 200;
export const PASSWORD_SPECIAL_MAX = 5;
export const PASSWORD_RULES = 'Use 8–64 characters and at most 5 special characters (no spaces). Uppercase letters and numbers are optional.';
export const countSpecialCharacters = (value) => (value.match(/[^\p{L}\p{M}\p{N}]/gu) ?? []).length;
export function passwordValidationError(value) {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) return 'Your password must be between 8 and 64 characters.';
  if (/\s/.test(value)) return 'Passwords cannot contain spaces.';
  if (countSpecialCharacters(value) > PASSWORD_SPECIAL_MAX) return 'Use at most 5 special characters in your password (no spaces).';
  return null;
}
