import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordValidationError, countSpecialCharacters } from '../../shared/password-policy.js';
import { nameInput, emailInput } from '../../shared/input-format.js';
import authRouter from './routes/auth.js';

test('password boundaries and special-character maximum do not require uppercase or digits', () => {
  for (const value of ['abcdefgh', 'a'.repeat(64), 'abc!@#$%', '12345678', 'ñ'.repeat(8)]) assert.equal(passwordValidationError(value), null);
  for (const value of [undefined, {}, '', 'a'.repeat(7), 'a'.repeat(65), 'abc!@#$%^', '*&&*SDSD*()__*(']) assert.ok(passwordValidationError(value));
  assert.equal(countSpecialCharacters('abc!@#$%'), 5);
  assert.equal(countSpecialCharacters('abc  def'), 2);
  assert.equal(countSpecialCharacters('ñá字123'), 0);
});

test('typing and pasting remove email whitespace and limit input length', () => {
  assert.equal(emailInput(' name @example.com \n'), 'name@example.com');
  assert.equal(emailInput('s'.repeat(300)).length, 254);
  assert.equal(emailInput('<user>(name)@example.com'), 'username@example.com');
  assert.equal(emailInput('first.last+tag@example.com'), 'first.last+tag@example.com');
});

test('email input blocks domain symbols and extra at signs when typing or pasting', () => {
  const email = 'n055@gmail.com';
  for (const symbol of "$#@!*&()_+/:;<>[]{}\\\"'`~=?^%|") {
    assert.equal(emailInput(email + symbol), email);
  }
  assert.equal(emailInput('n055@gmail.com$#@!*&@$!*@$_*!@*$&!@*&$*@!&*^#asdasd'), 'n055@gmail.comasdasd');
  assert.equal(emailInput('first.last+tag@sub-domain.example.com'), 'first.last+tag@sub-domain.example.com');
  assert.equal(emailInput('user@@example.com'), 'user@example.com');
});

test('name input preserves Unicode and valid punctuation, blocks symbols and double spaces', () => {
  assert.equal(nameInput('  Peña   Muñoz'), 'Peña Muñoz');
  assert.equal(nameInput('Anne-Marie O’Neil'), 'Anne-Marie O’Neil');
  assert.equal(nameInput('*&^*^^^123'), '');
  assert.equal(nameInput('Jose\u0301'), 'José');
  assert.equal(nameInput('s'.repeat(60)).length, 50);
  assert.equal(nameInput('Juan  '), 'Juan ');
});

test('first-login and recovery endpoints reject invalid passwords before accessing storage', async () => {
  for (const path of ['/change-initial-password', '/forgot-password/reset']) {
    const handler = authRouter.stack.find(layer => layer.route?.path === path).route.stack.at(-1).handle;
    for (const newPassword of ['abcdefg', 'a'.repeat(65), 'abc!@#$%^', 'abcd efgh', 'abcd\tefgh']) {
      const req = { body: { newPassword, verificationId: 'test', resetToken: 'a'.repeat(64) }, auth: { actor: { role: 'regular' }, accountType: 'employee' } };
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await handler(req, res);
      assert.equal(res.statusCode, 400, `${path}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error, passwordValidationError(newPassword));
    }
  }
});
