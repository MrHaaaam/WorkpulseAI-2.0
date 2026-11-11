export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 60;
// Existing credentials may predate the new-password policy.
export const LOGIN_PASSWORD_MAX = 60;
export const PASSWORD_SPECIAL_MAX = 5;
export const PASSWORD_RULES = 'Use 8-60 characters, letters, numbers and punctuation only, with at most 5 special characters. No spaces or emoji.';
export const countSpecialCharacters = (value) => (value.match(/[^\p{L}\p{M}\p{N}]/gu) ?? []).length;
export function passwordValidationError(value) {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) return 'Your password must be between 8 and 60 characters.';
  if (!validPasswordCharacters(value)) return 'Use letters, numbers and punctuation only; spaces and emoji are not allowed.';
  if (/\s/.test(value)) return 'Passwords cannot contain spaces.';
  if (countSpecialCharacters(value) > PASSWORD_SPECIAL_MAX) return 'Use at most 5 special characters in your password (no spaces).';
  return null;
}

export const passwordInput = value => value.replace(/[^\p{L}\p{M}\p{N}\x21-\x7e]/gu, '').slice(0, PASSWORD_MAX);
export const validPasswordCharacters = value => typeof value === 'string' && /^[\p{L}\p{M}\p{N}\x21-\x7e]+$/u.test(value);
