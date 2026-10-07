import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import authRouter, { hashSecret } from './routes/auth.js';
import { authenticate, requireRole, csrfProtection } from './security.js';
import { demoDatabaseName, seedDemo } from './demo.js';

test('demo mode requires a dedicated deployment and database', () => {
  assert.equal(demoDatabaseName({}), undefined);
  assert.throws(() => demoDatabaseName({ DEMO_LOGIN_ENABLED: 'true' }), /separate/);
  assert.throws(() => demoDatabaseName({ DEMO_DEPLOYMENT: 'true', DEMO_DATABASE_NAME: 'workpulse' }), /dedicated/);
  assert.equal(demoDatabaseName({ DEMO_DEPLOYMENT: 'true', DEMO_DATABASE_NAME: 'workpulse_demo_testing' }), 'workpulse_demo_testing');
});

test('demo login uses normal sessions, rejects incorrect passwords and disables existing sessions', async () => {
  const previousDb = mongoose.connection.db;
  const oldDeployment = process.env.DEMO_DEPLOYMENT;
  const oldEnabled = process.env.DEMO_LOGIN_ENABLED;
  process.env.DEMO_DEPLOYMENT = 'true';
  process.env.DEMO_LOGIN_ENABLED = 'true';
  try {
    const accounts = {
      admin: { _id: 'admin-id', email: 'admin@demo.invalid', demo: true, active: true, role: 'admin', passwordHash: await hashSecret('admin123') },
      employee: { _id: 'employee-id', email: 'employee@demo.invalid', demo: true, active: true, role: 'regular', employeeId: 'DEMO-EMP-001', passwordHash: await hashSecret('employee123') },
    };
    const captchaHash = await hashSecret('4');
    const sessions = [];
    let otpCreated = false;
    mongoose.connection.db = { collection(name) { return {
      async findOneAndDelete() { return { expiresAt: new Date(Date.now() + 60_000), answerHash: captchaHash }; },
      async findOne(query) {
        if (name === 'admin_accounts') return query.email === accounts.admin.email || query._id === 'admin-id' ? accounts.admin : null;
        if (name === 'employee_accounts') return query.email === accounts.employee.email || query._id === 'employee-id' ? accounts.employee : null;
        if (name === 'employees') return { id: 'DEMO-EMP-001', role: 'regular', status: 'active' };
        if (name === 'admin_sessions') return sessions.find(session => session.tokenDigest === query.tokenDigest);
        return null;
      },
      async insertOne(record) { if (name === 'admin_sessions') sessions.push(record); if (name === 'login_otps') otpCreated = true; },
    }; } };
    const login = authRouter.stack.find(layer => layer.route?.path === '/login').route.stack[0].handle;
    function response() {
      return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; }, setHeader(name, value) { this.headers[name] = value; }, append(name, value) { this.headers[name] = value; }, cookie(name, value) { this.token = value; } };
    }
    for (const [email, password] of [['admin', 'admin123'], ['employee', 'employee123']]) {
      const res = response();
      await login({ body: { email, password, captchaId: 'captcha', captchaAnswer: '4' }, ip: email, headers: {} }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.authenticated, true);
      assert.equal(res.data.accountType, email === 'admin' ? 'admin' : 'employee');
      assert.equal(res.data.role, email === 'admin' ? 'admin' : 'regular');
      assert.ok(res.data.csrfToken);
      assert.equal(otpCreated, false);
      const token = res.token || /workpulse_session=([^;]+)/.exec(String(res.headers['Set-Cookie']))?.[1];
      assert.ok(token, 'Session cookie issued');
      const req = { method: 'POST', headers: { cookie: `workpulse_session=${token}` }, ip: email };
      let continued = false;
      await authenticate(req, response(), () => { continued = true; });
      assert.equal(continued, true);
      const missingCsrf = response();
      csrfProtection(req, missingCsrf, () => assert.fail('Demo mutations require CSRF protection'));
      assert.equal(missingCsrf.statusCode, 403);
      req.headers['x-csrf-token'] = res.data.csrfToken;
      let csrfAccepted = false;
      csrfProtection(req, response(), () => { csrfAccepted = true; });
      assert.equal(csrfAccepted, true);
      if (email === 'employee') {
        const denied = response();
        requireRole('admin')(req, denied, () => assert.fail('Employee must not have admin access'));
        assert.equal(denied.statusCode, 403);
      }
      process.env.DEMO_LOGIN_ENABLED = 'false';
      const disabled = response();
      await authenticate(req, disabled, () => assert.fail('Disabled demo session must fail'));
      assert.equal(disabled.statusCode, 401);
      process.env.DEMO_LOGIN_ENABLED = 'true';
    }
    const invalid = response();
    await login({ body: { email: 'admin', password: 'incorrect', captchaId: 'captcha', captchaAnswer: '4' }, ip: 'wrong-password', headers: {} }, invalid);
    assert.equal(invalid.statusCode, 401);
    assert.equal(sessions.length, 2);
    const disabledLogin = response();
    process.env.DEMO_LOGIN_ENABLED = 'false';
    await login({ body: { email: 'admin@demo.invalid', password: 'admin123', captchaId: 'captcha', captchaAnswer: '4' }, ip: 'disabled', headers: {} }, disabledLogin);
    assert.equal(disabledLogin.statusCode, 401);
    assert.equal(sessions.length, 2);
    process.env.DEMO_LOGIN_ENABLED = 'true';
    accounts.admin.demo = false;
    const oldProvider = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = 'unconfigured-test-provider';
    try {
      const normalLogin = response();
      await login({ body: { email: 'admin@demo.invalid', password: 'admin123', captchaId: 'captcha', captchaAnswer: '4' }, ip: 'normal-login', headers: {} }, normalLogin);
      assert.equal(normalLogin.statusCode, 503);
      assert.match(normalLogin.data.error, /OTP/);
      assert.equal(sessions.length, 2, 'Normal accounts never receive an OTP-free session');
    } finally {
      if (oldProvider === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = oldProvider;
      accounts.admin.demo = true;
    }
    await assert.rejects(seedDemo({ collection() { return { findOne: async () => null, countDocuments: async () => 1 }; }, listCollections() { return { toArray: async () => [{ name: 'employees' }] }; } }, hashSecret), /empty/);
  } finally {
    mongoose.connection.db = previousDb;
    if (oldDeployment === undefined) delete process.env.DEMO_DEPLOYMENT; else process.env.DEMO_DEPLOYMENT = oldDeployment;
    if (oldEnabled === undefined) delete process.env.DEMO_LOGIN_ENABLED; else process.env.DEMO_LOGIN_ENABLED = oldEnabled;
  }
});
