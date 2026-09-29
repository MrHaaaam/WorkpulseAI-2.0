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
