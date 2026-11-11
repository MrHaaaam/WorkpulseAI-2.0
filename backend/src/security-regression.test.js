import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import ExcelJS from '../../node_modules/exceljs/excel.js';
import authRouter, { hashSecret, verifySecret } from './routes/auth.js';
import apiRouter from './routes/api.js';
import { rateLimit, securityHeaders } from './security.js';
import { encryptFingerprintSamples, decryptFingerprintSamples } from './biometrics.js';

const matches = (row, query) => Object.entries(query).every(([key, value]) => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).every(([op, operand]) => op === '$gt' ? row[key] > operand : op === '$lt' ? row[key] < operand : op === '$ne' ? row[key] !== operand : op === '$in' ? operand.includes(row[key]) : op === '$exists' ? (row[key] !== undefined) === operand : false);
  }
  return row[key] === value;
});
function memoryDb() {
  const data = new Map(); let reads = 0;
  const rows = name => { if (!data.has(name)) data.set(name, []); return data.get(name); };
  return { data, get reads() { return reads; }, collection(name) { return {
    async findOne(query) { reads++; return structuredClone(rows(name).find(row => matches(row, query)) || null); },
    async findOneAndDelete(query) { const i = rows(name).findIndex(row => matches(row, query)); return i < 0 ? null : rows(name).splice(i, 1)[0]; },
    async insertOne(row) { rows(name).push({ ...row, _id: row._id || crypto.randomUUID() }); return { acknowledged: true }; },
    async updateOne(query, update) {
      const row = rows(name).find(row => matches(row, query));
      if (!row) return { modifiedCount: 0 };
      Object.assign(row, update.$set || {});
      for (const key of Object.keys(update.$unset || {})) delete row[key];
      for (const [key, amount] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + amount;
      return { modifiedCount: 1 };
    },
    async deleteOne(query) { const i = rows(name).findIndex(row => matches(row, query)); if (i < 0) return { deletedCount: 0 }; rows(name).splice(i, 1); return { deletedCount: 1 }; },
    async deleteMany(query) { const before = rows(name).length; data.set(name, rows(name).filter(row => !matches(row, query))); return { deletedCount: before - rows(name).length }; },
    async updateMany(query, update) { const selected = rows(name).filter(row => matches(row, query)); for (const row of selected) Object.assign(row, update.$set || {}); return { modifiedCount: selected.length }; },
    find(query = {}) { const result = rows(name).filter(row => matches(row, query)); return { sort() { return this; }, limit() { return this; }, async toArray() { return structuredClone(result); } }; },
  }; } };
}

test('security regression through actual HTTP routes with controlled records and mocked mail', async t => {
  const previousDb = mongoose.connection.db;
  const previousFetch = globalThis.fetch;
  const savedEnv = Object.fromEntries(['EMAIL_PROVIDER', 'BREVO_API_KEY', 'EMAIL_FROM_ADDRESS', 'NODE_ENV'].map(key => [key, process.env[key]]));
  const db = memoryDb(); mongoose.connection.db = db;
  process.env.EMAIL_PROVIDER = 'brevo'; process.env.BREVO_API_KEY = 'test-only'; process.env.EMAIL_FROM_ADDRESS = 'sender@example.test'; process.env.NODE_ENV = 'production';
  const mail = [];
  globalThis.fetch = async (url, init) => {
    if (url === 'https://api.brevo.com/v3/smtp/email') { mail.push(JSON.parse(init.body)); return Response.json({ messageId: 'mock-mail-id' }); }
    return previousFetch(url, init);
  };
  const admin = { _id: 'admin-1', email: 'owner@example.test', role: 'admin', active: true, passwordHash: await hashSecret('CorrectPass123!') };
  const employee = { _id: 'employee-1', email: 'staff@example.test', role: 'regular', active: true, employeeId: 'E1', mustChangePassword: false, passwordHash: await hashSecret('StaffPass123!') };
  db.data.set('admin_accounts', [admin]); db.data.set('employee_accounts', [employee]); db.data.set('employees', [{ id: 'E1', status: 'active' }]);
  const app = express(); app.use(securityHeaders); app.use(express.json({ limit: '6mb' })); app.use('/api/auth', authRouter); app.use('/api', apiRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, cookie, csrf, method = 'POST') => {
    const res = await previousFetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie')?.split(';')[0], headers: res.headers };
  };
  const captcha = async () => { const id = crypto.randomUUID(); await db.collection('login_captchas').insertOne({ captchaId: id, answerHash: await hashSecret('4'), expiresAt: new Date(Date.now() + 60_000) }); return id; };
  let verificationId; let loginCode; let session;
  try {
    await t.test('MongoDB operator objects and oversized identifiers rejected before authentication queries', async () => {
      for (const value of [{ $ne: null }, ['id'], 'x'.repeat(101)]) {
        const before = db.reads;
        assert.equal((await request('/api/auth/login', { email: admin.email, password: 'CorrectPass123!', captchaId: value, captchaAnswer: '4' })).status, 400);
        assert.equal((await request('/api/auth/verify-otp', { verificationId: value, otp: '123456' })).status, 400);
        assert.equal(db.reads, before);
      }
    });
    await t.test('normal password and CAPTCHA login sends a mocked OTP without opening a session', async () => {
      const res = await request('/api/auth/login', { email: admin.email, password: 'CorrectPass123!', captchaId: await captcha(), captchaAnswer: '4' });
      assert.equal(res.status, 200); assert.ok(res.data.verificationId); assert.equal(res.cookie, undefined);
      verificationId = res.data.verificationId; loginCode = mail.at(-1).textContent.match(/\b\d{6}\b/)[0];
      assert.equal(mail.at(-1).to[0].email, admin.email);
      assert.notEqual(db.data.get('login_otps')[0].otpHash, loginCode);
    });
    await t.test('incorrect password and CAPTCHA cannot open a session or send an OTP', async () => {
      const before = mail.length;
      assert.equal((await request('/api/auth/login', { email: admin.email, password: 'Incorrect123!', captchaId: await captcha(), captchaAnswer: '4' })).status, 401);
      assert.equal((await request('/api/auth/login', { email: admin.email, password: 'CorrectPass123!', captchaId: await captcha(), captchaAnswer: '5' })).status, 400);
      assert.equal(mail.length, before);
    });
    await t.test('wrong and expired OTPs rejected without a session', async () => {
      const wrong = loginCode === '000000' ? '000001' : '000000';
      assert.equal((await request('/api/auth/verify-otp', { verificationId, otp: wrong })).status, 401);
      await db.collection('login_otps').insertOne({ verificationId: 'expired-id', otpHash: await hashSecret('123456'), expiresAt: new Date(0), attempts: 0 });
      assert.equal((await request('/api/auth/verify-otp', { verificationId: 'expired-id', otp: '123456' })).status, 401);
      assert.equal(db.data.has('admin_sessions'), false);
    });
    await t.test('concurrent valid OTP exchange creates one session and blocks replay', async () => {
      const results = await Promise.all([request('/api/auth/verify-otp', { verificationId, otp: loginCode }), request('/api/auth/verify-otp', { verificationId, otp: loginCode })]);
      assert.deepEqual(results.map(row => row.status).sort(), [200, 401]); session = results.find(row => row.status === 200);
      assert.equal(db.data.get('admin_sessions').length, 1);
      assert.match(session.headers.get('set-cookie'), /HttpOnly/); assert.match(session.headers.get('set-cookie'), /Secure/);
      assert.equal((await request('/api/auth/verify-otp', { verificationId, otp: loginCode })).status, 401);
    });
    await t.test('protected APIs reject anonymous users; cookie writes require CSRF; logout revokes session', async () => {
      assert.equal((await request('/api/employees', null, null, null, 'GET')).status, 401);
      assert.equal((await request('/api/auth/session', null, session.cookie, null, 'GET')).status, 200);
      // Session refresh rotates the CSRF token, so read its current value.
      const refreshed = await request('/api/auth/session', null, session.cookie, null, 'GET');
      assert.equal((await request('/api/auth/logout', {}, session.cookie)).status, 403);
      assert.equal((await request('/api/auth/logout', {}, session.cookie, refreshed.data.csrfToken)).status, 204);
      assert.equal((await request('/api/auth/session', null, session.cookie, null, 'GET')).status, 401);
    });
    await t.test('employee cannot access administrator API and inbox uses authenticated employee ID', async () => {
      const token = 'e'.repeat(64); const csrf = 'employee-csrf'; const digest = value => crypto.createHash('sha256').update(value).digest('hex');
      await db.collection('admin_sessions').insertOne({ tokenDigest: digest(token), csrfDigest: digest(csrf), accountId: employee._id, accountType: 'employee', createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
      db.data.set('employee_notifications', [{ id: 'mine', employeeId: 'E1' }, { id: 'other', employeeId: 'E2' }]);
      const cookie = `workpulse_session=${token}`;
      assert.equal((await request('/api/employees', null, cookie, null, 'GET')).status, 403);
      assert.deepEqual((await request('/api/employee/me/notifications', null, cookie, null, 'GET')).data.map(row => row.id), ['mine']);
      // Verify actual private workforce data, not only the notification endpoint.
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const periodStart = today.slice(0, 8) + (Number(today.slice(8)) <= 15 ? '01' : '16');
      db.data.set('attendance', [{ employeeId: 'E1', date: periodStart, status: 'Present', sessions: [] }, { employeeId: 'E2', date: periodStart, status: 'Absent', sessions: [] }]);
      db.data.set('payroll_requests', [{ id: 'my-pay', employeeId: 'E1', periodStart, status: 'paid', amount: 1000 }, { id: 'other-pay', employeeId: 'E2', periodStart, status: 'paid', amount: 9000 }]);
      db.data.set('cash_advance_requests', [{ id: 'my-request', employeeId: 'E1' }, { id: 'other-request', employeeId: 'E2' }]);
      const privateData = await request('/api/employee/me?employeeId=E2', null, cookie, null, 'GET');
      assert.equal(privateData.status, 200, JSON.stringify(privateData.data));
      assert.equal(privateData.data.profile.id, 'E1');
      assert.deepEqual(privateData.data.attendance.map(row => row.employeeId), ['E1']);
      assert.deepEqual(privateData.data.payroll.map(row => row.id), ['my-pay']);
      assert.deepEqual(privateData.data.cashAdvanceRequests.map(row => row.id), ['my-request']);
    });
    await t.test('password recovery verifies once, changes password, revokes sessions, and blocks reset-token replay', async () => {
      const sent = await request('/api/auth/forgot-password/request', { email: employee.email }); assert.equal(sent.status, 200);
      const code = mail.at(-1).textContent.match(/\b\d{6}\b/)[0];
      const verified = await request('/api/auth/forgot-password/verify', { verificationId: sent.data.verificationId, code }); assert.equal(verified.status, 200);
      assert.equal((await request('/api/auth/forgot-password/verify', { verificationId: sent.data.verificationId, code })).status, 401);
      const body = { verificationId: sent.data.verificationId, resetToken: verified.data.resetToken, newPassword: 'ChangedPass456!' };
      const resets = await Promise.all([request('/api/auth/forgot-password/reset', body), request('/api/auth/forgot-password/reset', body)]);
      assert.deepEqual(resets.map(row => row.status).sort(), [200, 401]);
      assert.equal(await verifySecret('ChangedPass456!', employee.passwordHash), true);
      assert.equal(db.data.get('admin_sessions').filter(row => row.accountId === employee._id).length, 0);
    });
    await t.test('first-login password change remains usable and allows employee APIs afterward', async () => {
      employee.mustChangePassword = true;
      const token = 'f'.repeat(64); const csrf = 'initial-csrf'; const digest = value => crypto.createHash('sha256').update(value).digest('hex');
      await db.collection('admin_sessions').insertOne({ tokenDigest: digest(token), csrfDigest: digest(csrf), accountId: employee._id, accountType: 'employee', createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
      const cookie = `workpulse_session=${token}`;
      assert.equal((await request('/api/employee/me/notifications', null, cookie, null, 'GET')).status, 403);
      assert.equal((await request('/api/auth/change-initial-password', { newPassword: 'InitialChanged789!' }, cookie, csrf)).status, 200);
      assert.equal((await request('/api/employee/me/notifications', null, cookie, null, 'GET')).status, 200);
    });
    await t.test('successful offline synchronization returns its receipt without a post-save server error', async () => {
      const token = 'b'.repeat(64); const csrf = 'offline-csrf'; const digest = value => crypto.createHash('sha256').update(value).digest('hex');
      await db.collection('admin_sessions').insertOne({ tokenDigest: digest(token), csrfDigest: digest(csrf), accountId: admin._id, accountType: 'admin', createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
      const operation = { id: crypto.randomUUID(), kind: 'attendance', payload: { employeeId: 'E1', date: '2026-01-01', sessionNumber: 1, checkIn: '08:00', reason: 'Controlled retry', captureOnly: true } };
      const result = { id: 'request-1', employeeId: 'E1', status: 'pending' };
      await db.collection('offline_operations').insertOne({
        _id: `admin:${admin._id}:${operation.id}`, kind: operation.kind,
        operationHash: crypto.createHash('sha256').update(JSON.stringify({ kind: operation.kind, body: operation.payload })).digest('hex'), result,
      });
      const res = await request('/api/offline/sync', { operation, password: 'CorrectPass123!' }, `workpulse_session=${token}`, csrf);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(res.data, result);
    });
    await t.test('payroll rejects query-operator employee IDs and biometric routes throttle repeated work', async () => {
      const token = 'a'.repeat(64); const csrf = 'admin-csrf'; const digest = value => crypto.createHash('sha256').update(value).digest('hex');
      await db.collection('admin_sessions').insertOne({ tokenDigest: digest(token), csrfDigest: digest(csrf), accountId: admin._id, accountType: 'admin', createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
      const cookie = `workpulse_session=${token}`;
      assert.equal((await request('/api/payroll-requests', { employeeId: { $ne: null } }, cookie, csrf)).status, 400);
      for (let i = 0; i < 30; i++) assert.equal((await request('/api/fingerprints/check-scan', { email: `rotating-${i}@example.test`, fingerprintSamples: [] }, cookie, csrf)).status, 400);
      assert.equal((await request('/api/fingerprints/check-scan', { email: 'another@example.test', fingerprintSamples: [] }, cookie, csrf)).status, 429);
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); mongoose.connection.db = previousDb; globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('rate limits cannot be reset by rotating email; window expiry permits retries', () => {
  const originalNow = Date.now; let now = 10_000; Date.now = () => now;
  const limiter = rateLimit({ windowMs: 1000, max: 2, keyPrefix: 'regression' });
  const invoke = email => { let passed = false; const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json() {} }; limiter({ ip: 'same-ip', body: { email }, headers: {} }, res, () => { passed = true; }); return { passed, code: res.code }; };
  try { assert.equal(invoke('one@test').passed, true); assert.equal(invoke('two@test').passed, true); assert.equal(invoke('three@test').code, 429); now += 1001; assert.equal(invoke('four@test').passed, true); } finally { Date.now = originalNow; }
});

test('encrypted biometric templates round-trip and tampered ciphertext is rejected', () => {
  const old = process.env.BIOMETRIC_ENCRYPTION_KEY; process.env.BIOMETRIC_ENCRYPTION_KEY = 'test-only-key';
  try {
    const samples = [Buffer.alloc(80, 1).toString('base64url'), Buffer.alloc(80, 2).toString('base64url')];
    const encrypted = encryptFingerprintSamples(samples); assert.deepEqual(decryptFingerprintSamples(encrypted), samples);
    const bytes = Buffer.from(encrypted.ciphertext, 'base64'); bytes[0] ^= 1;
    assert.throws(() => decryptFingerprintSamples({ ...encrypted, ciphertext: bytes.toString('base64') }));
  } finally { if (old === undefined) delete process.env.BIOMETRIC_ENCRYPTION_KEY; else process.env.BIOMETRIC_ENCRYPTION_KEY = old; }
});

test('Excel export still creates a readable workbook after uuid dependency update', async () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Payroll'); sheet.addRow(['Employee', 'Amount']); sheet.addRow(['Test employee', 1000]);
  const bytes = await book.xlsx.writeBuffer(); const read = new ExcelJS.Workbook(); await read.xlsx.load(bytes);
  assert.equal(read.getWorksheet('Payroll').getCell('B2').value, 1000);
});
