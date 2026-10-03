export const nameInput = (value) => value.normalize('NFC').replace(/[^\p{L}\p{M} '\u2019.-]/gu, '').replace(/ +/g, ' ').replace(/^ +/, '').slice(0, 50);
export function emailInput(value) {
  const separator = value.indexOf('@');
  const local = (separator === -1 ? value : value.slice(0, separator))
    .replace(/[^a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]/g, '');
  if (separator === -1) return local.slice(0, 254);
  const domain = value.slice(separator + 1).replace(/[^a-zA-Z0-9.-]/g, '');
  return `${local}@${domain}`.slice(0, 254);
}
export const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(value);

const unsupportedText = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
export function textInput(value, maximum = 500, multiline = false) {
  const clean = value.replace(unsupportedText, '');
  return (multiline ? clean.replace(/[^\S\n]+/g, ' ').replace(/(^|\n) +/g, '$1') : clean.replace(/\s+/g, ' ').replace(/^ +/, '')).slice(0, maximum);
}
export const phoneInput = value => (value.startsWith('+') ? '+' : '') + value.replace(/\D/g, '').slice(0, 15);
export const validPhone = value => typeof value === 'string' && /^\+?\d{7,15}$/.test(value);
export const validText = (value, maximum = 500) => typeof value === 'string' && value.length <= maximum && value === textInput(value, maximum, true);
