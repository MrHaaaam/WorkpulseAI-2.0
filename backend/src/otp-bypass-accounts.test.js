import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router, { hashSecret } from './routes/auth.js';
import { canBypassOtp, ensureOtpBypassAccounts } from './otp-bypass-accounts.js';

test('OTP bypass requires an explicit marker and the exact approved account role and email', () => {
  const account = { email: 'admin@gmail.com', role: 'admin', active: true, otpBypass: true };
  assert.equal(canBypassOtp(account, 'admin'), true);
  assert.equal(canBypassOtp({ ...account, otpBypass: false }, 'admin'), false);
  assert.equal(canBypassOtp({ ...account, active: false }, 'admin'), false);
  assert.equal(canBypassOtp({ ...account, email: 'other@gmail.com' }, 'admin'), false);
  assert.equal(canBypassOtp(account, 'employee'), false);
  assert.equal(canBypassOtp({ ...account, email: 'employee@gmail.com', role: 'regular' }, 'employee'), true);
});

test('provisioning never overwrites existing unrelated accounts or resets passwords', async () => {
  await assert.rejects(ensureOtpBypassAccounts({ collection() { return { findOne: async () => ({ role: 'admin' }) }; } }, hashSecret), /role conflict/);
  const unchanged = { role: 'admin', otpBypass: true, passwordHash: 'existing' };
  let writes = 0;
  const db = { collection(name) { return {
    findOne: async query => query.email === 'admin@gmail.com' && name === 'admin_accounts' ? unchanged : query.email === 'employee@gmail.com' && name === 'employee_accounts' ? { role: 'regular', otpBypass: true } : null,
    updateOne: async () => { writes++; },
  }; } };
  await ensureOtpBypassAccounts(db, hashSecret);
  assert.equal(writes, 0);
  assert.equal(unchanged.passwordHash, 'existing');
});

test('real account bypass issues a normal cookie only after password and CAPTCHA validation', async () => {
  const previous = mongoose.connection.db;
  const oldProvider = process.env.EMAIL_PROVIDER;
  process.env.EMAIL_PROVIDER = 'unconfigured-test';
  try {
    const account = { _id: 'admin-id', email: 'admin@gmail.com', role: 'admin', active: true, otpBypass: true, passwordHash: await hashSecret('admin123') };
    const captcha = { expiresAt: new Date(Date.now() + 60_000), answerHash: await hashSecret('4') };
    let sessions = 0;
    mongoose.connection.db = { collection(name) { return {
      findOneAndDelete: async () => captcha,
      findOne: async () => name === 'admin_accounts' ? account : null,
      insertOne: async () => { if (name === 'admin_sessions') sessions++; if (name === 'login_otps') assert.fail('Bypass should not create an OTP'); },
    }; } };
    const handler = router.stack.find(layer => layer.route?.path === '/login').route.stack[0].handle;
    const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.data = value; return this; }, setHeader() {}, append(name, value) { this.cookie = value; } });
    const login = async (password, answer, ip) => {
      const res = response();
      await handler({ body: { email: account.email, password, captchaId: 'id', captchaAnswer: answer }, headers: {}, ip }, res);
      return res;
    };
    const valid = await login('admin123', '4', 'valid');
    assert.equal(valid.statusCode, 200);
    assert.equal(valid.data.authenticated, true);
    assert.ok(valid.data.csrfToken);
    assert.match(valid.cookie, /HttpOnly/);
    assert.equal((await login('wrong', '4', 'wrong-pass')).statusCode, 401);
    assert.equal((await login('admin123', '5', 'wrong-captcha')).statusCode, 400);
    account.otpBypass = false;
    const normal = await login('admin123', '4', 'normal');
    assert.equal(normal.statusCode, 503);
    assert.match(normal.data.error, /OTP/);
    assert.equal(sessions, 1);
  } finally {
    mongoose.connection.db = previous;
    if (oldProvider === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = oldProvider;
  }
});
