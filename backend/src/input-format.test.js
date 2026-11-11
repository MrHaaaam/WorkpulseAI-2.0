import test from 'node:test';
import assert from 'node:assert/strict';
import { nameInput, emailInput, textInput, phoneInput, validPhone, validText } from '../../shared/input-format.js';
import { validNumberInput } from '../../shared/field-limits.js';

test('names retain word separators and punctuation, removing emoji and digits', () => {
  assert.equal(nameInput("  Anne-Marie   O'Neil\u{1F602}123"), "Anne-Marie O'Neil");
  assert.equal(nameInput('Juan Dela Cruz'), 'Juan Dela Cruz');
});
test('email removes all whitespace and emoji without losing valid plus tags', () => {
  assert.equal(emailInput(' first.last+tag\t @ example.com\n\u{1F602}'), 'first.last+tag@example.com');
});
test('free text preserves useful punctuation and paragraphs, with single spaces', () => {
  assert.equal(textInput('  Unit #2,   Main St.\u{1F602}'), 'Unit #2, Main St.');
  assert.equal(textInput('First  line\n  Second line', 500, true), 'First line\nSecond line');
  assert.equal(validText('Reason\u{1F602}'), false);
  assert.equal(validText('Repeated  spaces'), false);
  assert.equal(validText('Normal reason.'), true);
  assert.equal(textInput('a'.repeat(600)).length, 500);
});
test('phone allows digits and an optional leading plus only', () => {
  assert.equal(phoneInput('+63 (912) 345-6789\u{1F602}'), '+639123456789');
  assert.equal(validPhone('+639123456789'), true);
  for (const value of ['+63 9123456789', '912-3456789', 'abc1234567', '++639123456789']) assert.equal(validPhone(value), false);
});
test('numeric fields block whitespace, signs, exponent notation and emoji', () => {
  for (const value of ['12 3', '-1', '+1', '1e3', '1\u{1F602}', '1.234', '1..2']) assert.equal(validNumberInput(value, 1000000), false);
  assert.equal(validNumberInput('123.45', 1000000), true);
  assert.equal(validNumberInput('12.5', 2026, 0), false);
});
