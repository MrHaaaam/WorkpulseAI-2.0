import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import apiRouter from './routes/api.js';
import authRouter, { hashSecret } from './routes/auth.js';
import { securityHeaders } from './security.js';
import { healthHandler } from './health.js';
import { memoryDb } from './test-support/memory-db.js';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const routes = (router, prefix) => router.stack.filter(layer => layer.route).flatMap(layer => Object.keys(layer.route.methods).map(method => ({ method: method.toUpperCase(), path: prefix + layer.route.path })));
const inventory = [...routes(authRouter, '/api/auth'), ...routes(apiRouter, '/api'), { method: 'GET', path: '/api/health' }];
const substitute = route => route.path.replace(':kind', 'leave').replace(':employeeId', 'E1').replace(':name', 'employees').replace(':id', 'missing-record');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const payrollPeriodKey = () => `${today().slice(0, 8)}${Number(today().slice(8)) <= 15 ? "01" : "16"}`;
const offsetDate = days => { const date = new Date(`${today()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

test('every registered API: HTTP access controls, validation, and feature scenarios', async t => {
  const originalDb = mongoose.connection.db, originalStartSession = mongoose.startSession, originalFetch = globalThis.fetch, originalSpawn = childProcess.spawn;
  const envKeys = ['NODE_ENV', 'EMAIL_PROVIDER', 'BREVO_API_KEY', 'EMAIL_FROM_ADDRESS', 'SMTP_USER', 'BIOMETRIC_ENCRYPTION_KEY'];
  const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: 'production', EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'mock-only', EMAIL_FROM_ADDRESS: 'sender@example.test', SMTP_USER: 'sender@example.test' });
  process.env.BIOMETRIC_ENCRYPTION_KEY = 'isolated-test-key';
  // Simulate the native matcher protocol, not the biometric hardware or SDK.
  childProcess.spawn = command => {
    assert.equal(command, 'powershell.exe');
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    child.stdin = { end(payload) { const input = JSON.parse(payload); setImmediate(() => {
      let result;
      if (input.operation === 'extract') result = { templates: input.samples, format: 'DPFJ_FMD_ANSI_378_2004' };
      else {
        const results = input.candidates.map(candidate => ({ employeeId: candidate.employeeId, format: 'DPFJ_FMD_ANSI_378_2004', score: Buffer.from(candidate.samples[0], 'base64')[0] === Buffer.from(input.probe, 'base64')[0] ? 100 : 1_000_000 }));
        result = { results, best: results.toSorted((a, b) => a.score - b.score)[0] || null };
      }
      child.stdout.write(JSON.stringify(result)); child.emit('close', 0);
    }); } }; return child;
  };
  syncBuiltinESMExports();
  const db = memoryDb(); mongoose.connection.db = db;
  const session = () => ({ async withTransaction(work) { const snapshot = structuredClone(db.data); try { return await work(); } catch (error) { db.data.clear(); for (const [key, value] of snapshot) db.data.set(key, value); throw error; } }, async endSession() {} });
  db.client = { startSession: session }; mongoose.startSession = async () => session();
  const mail = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.brevo.com/')) { mail.push(JSON.parse(options.body)); return Response.json({ messageId: 'mock-delivery' }); }
    throw new Error(`Unexpected outbound request from test: ${url}`);
  };
  const password = 'CorrectPass123!', passwordHash = await hashSecret(password), csrf = 'test-csrf';
  const settings = { key: 'company', shift: { enabled: true, startTime: '00:00', workStopTime: '23:58', autoClockOutTime: '23:59', workDays: 7, workWeekdays: [0, 1, 2, 3, 4, 5, 6], scheduleOverrides: [] }, payroll: { cashAdvanceMax: 1000, hourlyRates: { regular: 50, extra: 40, manager: 60 } } };
  const employee = (id, name, extra = {}) => ({ _id: `employee-${id}`, id, firstName: name, lastName: 'Tester', name: `${name} Tester`, role: 'regular', email: `${id.toLowerCase()}@example.test`, phone: '+639123456789', address: 'Test Street Manila', status: 'active', archived: false, banned: false, createdAt: new Date(`${today()}T00:00:00+08:00`), identifiers: [], salaryAddition: { amount: 0, frequency: 'quarterly' }, ...extra });
  function seed() {
    db.reset(); mail.length = 0;
    db.data.set('settings', [{ _id: 'company', ...structuredClone(settings) }]);
    db.data.set('admin_accounts', [{ _id: 'admin', email: 'owner@example.test', name: 'Test Administrator', role: 'admin', active: true, passwordHash }]);
    db.data.set('employees', [employee('E1', 'Alex'), employee('E2', 'Sam'), employee('EA', 'Archived', { archived: true, status: 'inactive' })]);
    for (const role of ['regular', 'extra', 'manager', 'supervisor']) {
      const account = { _id: role, email: `${role}@example.test`, employeeId: 'E1', role, active: true, passwordHash, mustChangePassword: false };
      const accounts = db.data.get('employee_accounts') || []; accounts.push(account); db.data.set('employee_accounts', accounts);
    }
    db.data.set('admin_sessions', ['admin', 'regular', 'extra', 'manager', 'supervisor'].map(role => ({ _id: `session-${role}`, tokenDigest: digest(`token-${role}`), csrfDigest: digest(csrf), accountId: role, accountType: role === 'admin' ? 'admin' : 'employee', createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) })));
    db.data.set('payroll_requests', [{ _id: 'P1', id: 'P1', employeeId: 'E1', employeeName: 'Alex Tester', periodStart: payrollPeriodKey(), amount: 100, grossAmount: 100, currentAmount: 100, advanceDeduction: 0, status: 'paid', paidAt: new Date(), createdAt: new Date() }]);
  }
  seed();
  const app = express(); app.set('trust proxy', true); app.use(securityHeaders); app.use(express.json({ limit: '6mb' }));
  app.get('/api/health', healthHandler({ readyState: 1 }));
  app.use('/api/auth', authRouter); app.use('/api', apiRouter);
  app.use((error, _req, res, _next) => res.status(error?.type === 'entity.too.large' ? 413 : 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const observations = new Map(inventory.map(route => [`${route.method} ${route.path}`, []]));
  const browserFixtures = {};
  let requestNumber = 0, label = '';
  async function request(method, path, body, role = 'admin', includeCsrf = true) {
    const route = inventory.find(route => route.method === method && new RegExp(`^${route.path.replace(/:[^/]+/g, '[^/]+')}$`).test(path.split('?')[0]));
    assert.ok(route, `Request is missing from inventory: ${method} ${path}`);
    const response = await originalFetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `127.1.${Math.floor(++requestNumber / 250)}.${requestNumber % 250 + 1}`, ...(role ? { Cookie: `workpulse_session=token-${role}` } : {}), ...(includeCsrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }), signal: AbortSignal.timeout(10000) });
    const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    observations.get(`${route.method} ${route.path}`).push({ scenario: label, role: role || 'anonymous', status: response.status });
    if (response.status < 300 && !browserFixtures[`${method} ${route.path}`]) browserFixtures[`${method} ${route.path}`] = { status: response.status, data };
    return { status: response.status, data, headers: response.headers };
  }
  const expect = async (method, path, body, status = 200, role = 'admin') => {
    const result = await request(method, path, body, role);
    assert.equal(result.status, status, `${method} ${path}: ${JSON.stringify(result.data)}`);
    return result.data;
  };
  async function scenario(name, work) {
    await t.test(name, async () => { await new Promise(resolve => setImmediate(resolve)); seed(); label = name; await work(); });
  }
  try {
    await scenario('every protected API rejects anonymous requests', async () => {
      for (const route of inventory.filter(route => route.path.startsWith('/api/') && !route.path.startsWith('/api/auth/') && route.path !== '/api/health')) {
        const result = await request(route.method, substitute(route), {}, null);
        assert.equal(result.status, 401, `${route.method} ${route.path}`);
      }
    });
    await scenario('every protected write requires cookie CSRF protection', async () => {
      for (const route of inventory.filter(route => route.method !== 'GET' && (!route.path.startsWith('/api/auth/') || ['/verify-password', '/change-initial-password', '/logout'].some(path => route.path.endsWith(path))))) {
        const result = await request(route.method, substitute(route), {}, 'admin', false);
        assert.equal(result.status, 403, `${route.method} ${route.path}`);
      }
    });
    for (const role of ['regular', 'extra', 'manager', 'supervisor']) await scenario(`${role}: every admin API is forbidden`, async () => {
      for (const route of inventory.filter(route => !route.path.startsWith('/api/auth/') && !route.path.startsWith('/api/employee/me') && !route.path.startsWith('/api/record-archives/') && route.path !== '/api/health')) {
        const result = await request(route.method, substitute(route), {}, role);
        assert.equal(result.status, 403, `${role} ${route.method} ${route.path}: ${JSON.stringify(result.data)}`);
      }
    });
    for (const role of ['regular', 'extra', 'manager', 'supervisor']) await scenario(`${role}: archives remain private and additions remain admin-only`, async () => {
      db.data.set('leave_requests', [
        { id: 'OLD-E1', employeeId: 'E1', status: 'approved', startDate: '2020-01-01', endDate: '2020-01-01' },
        { id: 'OLD-E2', employeeId: 'E2', status: 'approved', startDate: '2020-01-01', endDate: '2020-01-01' },
      ]);
      const result = await expect('GET', '/api/record-archives/leave?employeeId=E2', undefined, 200, role);
      assert.equal(result.totalItems, 1);
      assert.equal(result.items[0].employeeId, 'E1');
      await expect('GET', '/api/record-archives/payroll', undefined, 200, role);
      await expect('GET', '/api/record-archives/cash', undefined, 200, role);
      await expect('GET', '/api/record-archives/additions', undefined, 403, role);
    });
    await scenario('administrator cannot impersonate the employee portal', async () => {
      for (const route of inventory.filter(route => route.path.startsWith('/api/employee/me'))) assert.equal((await request(route.method, substitute(route), {})).status, 403, route.path);
    });
    await scenario('all read endpoints return valid responses', async () => {
      const query = { '/api/employee/me/calendar': `?month=${today().slice(0, 7)}`, '/api/admin/calendar': `?month=${today().slice(0, 7)}&employeeId=E1`, '/api/attendance': `?from=${today()}&to=${today()}`, '/api/attendance/idle-day': `?date=${today()}`, '/api/attendance/idle-days': `?from=${today()}&to=${offsetDate(5)}`, '/api/attendance/correction': `?employeeId=E1&date=${today()}`, '/api/ai-insights': '?refresh=1' };
      for (const route of inventory.filter(route => route.method === 'GET' && !route.path.startsWith('/api/auth/') && !route.path.includes('/approval-preview'))) {
        const path = substitute(route) + (query[route.path] || '');
        await expect('GET', path, undefined, 200, route.path.startsWith('/api/employee/me') ? 'regular' : 'admin');
      }
    });
    for (const role of ['regular', 'extra', 'manager', 'supervisor']) await scenario(`${role}: employee workspace, calendar and inbox remain accessible`, async () => {
      for (const path of ['/api/employee/me', `/api/employee/me/calendar?month=${today().slice(0, 7)}`, '/api/employee/me/notifications']) await expect('GET', path, undefined, 200, role);
    });
    await scenario('read APIs reject invalid calendar dates and reversed attendance ranges', async () => {
      for (const path of ['/api/attendance?from=invalid', '/api/attendance?from=2026-02-30', `/api/attendance?from=${offsetDate(1)}&to=${today()}`, '/api/overview?performanceDate=2026-99-99', '/api/overview?auditDate=invalid', '/api/audit-events?date=2026-02-30', '/api/admin/calendar?month=2026-13']) await expect('GET', path, undefined, 400);
    });
    await scenario('all public authentication endpoints and protected session actions', async () => {
      const captcha = await expect('GET', '/api/auth/captcha', undefined, 200, null); assert.ok(captcha.captchaId && captcha.challenge);
      for (const endpoint of ['login', 'verify-otp', 'forgot-password/request', 'forgot-password/verify', 'forgot-password/reset']) await expect('POST', `/api/auth/${endpoint}`, {}, endpoint === 'forgot-password/reset' ? 401 : 400, null);
      const sessionData = await expect('GET', '/api/auth/session'); assert.equal(sessionData.authenticated, true); assert.ok(sessionData.csrfToken);
      // Session inspection rotates CSRF; restore the controlled token before writes.
      db.data.get('admin_sessions').find(item => item.accountId === 'admin').csrfDigest = digest(csrf);
      await expect('POST', '/api/auth/verify-password', { password });
      await expect('POST', '/api/auth/change-initial-password', {}, 403);
      await expect('POST', '/api/auth/logout', {}, 204); assert.equal((await request('GET', '/api/auth/session', undefined)).status, 401);
    });
    await scenario('employee contact is scoped to the authenticated employee', async () => {
      await expect('PATCH', '/api/employee/me/contact', { employeeId: 'E2', phone: '+639111111111', address: 'Updated Street Manila' }, 200, 'regular');
      assert.equal(db.data.get('employees').find(item => item.id === 'E1').address, 'Updated Street Manila');
      assert.equal(db.data.get('employees').find(item => item.id === 'E2').address, 'Test Street Manila');
    });
    await scenario('leave submission, conflict, cancellation, preview, approval and undo', async () => {
      db.data.set('payroll_requests', []);
      const body = { leaveType: 'Annual Leave', requestedDates: [offsetDate(3)], reason: 'Family appointment' };
      const leave = await expect('POST', '/api/employee/me/leave-requests', body, 201, 'regular');
      await expect('POST', '/api/employee/me/leave-requests', body, 409, 'regular');
      await expect('GET', `/api/leave-requests/${leave.id}/approval-preview`);
      await expect('PATCH', `/api/leave-requests/${leave.id}/status`, { status: 'approved', approvedDates: body.requestedDates, password });
      assert.equal(db.data.get('leave_requests')[0].status, 'approved');
      await expect('PATCH', `/api/leave-requests/${leave.id}/undo-approval`, { password });
      const other = await expect('POST', '/api/employee/me/leave-requests', { ...body, requestedDates: [offsetDate(4)] }, 201, 'regular');
      await expect('PATCH', `/api/employee/me/leave-requests/${other.id}/cancel`, {}, 200, 'regular');
      const bulk = await expect('POST', '/api/employee/me/leave-requests', { ...body, requestedDates: [offsetDate(5)] }, 201, 'regular');
      await expect('PATCH', '/api/leave-requests/bulk-status', { ids: [bulk.id], status: 'rejected', password });
    });
    await scenario('cash advance request, approval, acceptance, disbursement and duplicate protection', async () => {
      const advance = await expect('POST', '/api/employee/me/cash-advance-requests', { amount: 500, reason: 'Family needs', repaymentAgreed: true }, 201, 'regular');
      const startPeriod = `${offsetDate(32).slice(0, 7)}-01`;
      await expect('PATCH', `/api/cash-advance-requests/${advance.id}/decision`, { decision: 'approve', startPeriod, password });
      await expect('PATCH', `/api/employee/me/cash-advance-requests/${advance.id}/accept`, {}, 200, 'regular');
      await expect('POST', `/api/cash-advance-requests/${advance.id}/disburse`, { date: today(), password }, 201);
      await expect('POST', `/api/cash-advance-requests/${advance.id}/disburse`, { date: today(), password }, 409);
      assert.equal(db.data.get('cash_advances').length, 1);
    });
    await scenario('employee cash cancellation and administrator cash entry', async () => {
      const advance = await expect('POST', '/api/employee/me/cash-advance-requests', { amount: 500, repaymentAgreed: true }, 201, 'regular');
      await expect('PATCH', `/api/employee/me/cash-advance-requests/${advance.id}/cancel`, {}, 200, 'regular');
      await expect('POST', '/api/cash-advances', { employeeId: 'E2', amount: 100, date: today(), startPeriod: `${offsetDate(32).slice(0, 7)}-01`, note: 'Test cash advance', password, employeeRepaymentAgreementConfirmed: true }, 201);
    });
    await scenario('system controls, employee access, and settings update', async () => {
      await expect('PATCH', '/api/admin/system-controls', { registrationOpen: false });
      assert.equal((await expect('GET', '/api/admin/system-controls')).registrationOpen, false);
      await expect('PATCH', '/api/admin/system-controls', { maintenanceMode: true });
      await expect('GET', '/api/employee/me', undefined, 503, 'regular');
      await expect('PATCH', '/api/admin/system-controls', { maintenanceMode: false });
      await expect('PATCH', '/api/admin/employees/E2/access', { banned: true });
      assert.equal(db.data.get('employees').find(item => item.id === 'E2').banned, true);
      await expect('PUT', '/api/settings', { ...settings, adminPassword: password });
    });
    await scenario('employee edit, archive, restore, and permanent deletion', async () => {
      const record = employee('E2', 'Sam');
      await expect('PUT', '/api/employees/E2', { ...record, address: 'New Street Manila', adminPassword: password });
      await expect('POST', '/api/employees/E2/archive', { password });
      assert.equal(db.data.get('employees').find(item => item.id === 'E2').archived, true);
      await expect('POST', '/api/employees/E2/unarchive', {});
      await expect('DELETE', '/api/employees/EA/permanent', { password });
      assert.equal(db.data.get('employees').some(item => item.id === 'EA'), false);
      assert.equal(db.data.get('employees').some(item => item.id === 'E1'), true);
    });
    await scenario('fingerprint tester no-match, assessment, and malformed enrollment', async () => {
      const sample = Buffer.alloc(64, 1).toString('base64');
      const trial = await expect('POST', '/api/biometric-evaluation-trials', { expectedType: 'automatic', fingerprintSamples: [sample] }, 201);
      assert.equal(trial.classification, null); assert.equal(trial.confirmationPending, true);
      await expect('POST', `/api/biometric-evaluation-trials/${trial.id}/confirm`, { assessment: 'wrong' });
      await expect('POST', `/api/biometric-evaluation-trials/${trial.id}/confirm`, { assessment: 'correct' }, 409);
      for (const path of ['/api/fingerprints/check-enrollment', '/api/fingerprints/check-scan', '/api/fingerprints/identify']) await expect('POST', path, { fingerprintSamples: [] }, 400);
      await expect('PUT', '/api/employees/E1/fingerprint', { password, adminPassword: password, fingerprintSamples: [] }, 400);
      await expect('POST', '/api/attendance/kiosk', { fingerprintSamples: [sample] }, 404);
      const result = await expect('POST', '/api/fingerprints/identify', { fingerprintSamples: [sample] }); assert.equal(result.recognized, false);
    });
    await scenario('export reports, audit actions, and notification ownership', async () => {
      for (const name of ['employees', 'attendance', 'leave_requests', 'payroll_requests']) { const report = await expect('GET', `/api/admin/report/${name}`); assert.ok(Array.isArray(report.fields) && Array.isArray(report.rows)); }
      await expect('GET', '/api/admin/report/unknown', undefined, 404);
      await expect('POST', '/api/attendance/audit-export', { format: 'xlsx', from: today(), to: today(), recordCount: 0 }, 204);
      await expect('POST', '/api/payroll/audit-export', { format: 'xlsx', periodStart: payrollPeriodKey(), recordCount: 0 }, 204);
      await expect('POST', '/api/payroll/audit-print', { printScope: 'paid-list', recordCount: 0 }, 204);
      db.data.set('employee_notifications', [{ id: 'N1', employeeId: 'E1', read: false }, { id: 'N2', employeeId: 'E2', read: false }]);
      const result = await expect('POST', '/api/employee/me/notifications/read', { ids: ['N1', 'N2'] }, 200, 'regular'); assert.deepEqual(result.readIds, ['N1']);
      await expect('POST', '/api/admin/notifications/read', { ids: [] });
    });
    await scenario('password login, OTP, password recovery and initial password replacement', async () => {
      const captcha = await expect('GET', '/api/auth/captcha', undefined, 200, null);
      const [left, operator, right] = captcha.challenge.split(/\s+/); const answer = operator === '+' ? Number(left) + Number(right) : Number(left) - Number(right);
      const login = await expect('POST', '/api/auth/login', { email: 'owner@example.test', password, captchaId: captcha.captchaId, captchaAnswer: String(answer) }, 200, null);
      assert.ok(login.verificationId);
      const otp = mail.at(-1).textContent.match(/\b\d{6}\b/)[0];
      await expect('POST', '/api/auth/verify-otp', { verificationId: login.verificationId, otp }, 200, null);
      const reset = await expect('POST', '/api/auth/forgot-password/request', { email: 'regular@example.test' }, 200, null);
      const code = mail.at(-1).textContent.match(/\b\d{6}\b/)[0];
      const verified = await expect('POST', '/api/auth/forgot-password/verify', { verificationId: reset.verificationId, code }, 200, null);
      await expect('POST', '/api/auth/forgot-password/reset', { verificationId: reset.verificationId, resetToken: verified.resetToken, newPassword: 'ChangedPass456!' }, 200, null);
      // Reset revokes the employee's sessions. Recreate a controlled session.
      db.data.get('admin_sessions').push({ _id: 'replacement-session', tokenDigest: digest('token-regular'), csrfDigest: digest(csrf), accountId: 'regular', accountType: 'employee', createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) });
      db.data.get('employee_accounts').find(row => row._id === 'regular').mustChangePassword = true;
      await expect('POST', '/api/auth/change-initial-password', { newPassword: 'InitialPass789!' }, 200, 'regular');
      await expect('PATCH', '/api/admin/account-security', { email: 'updated-owner@example.test', currentPassword: password, newPassword: 'UpdatedAdmin456!' });
    });
    await scenario('employee email verification, creation without scanner, and login email resend', async () => {
      const email = 'newemployee@example.test';
      const verification = await expect('POST', '/api/employees/email-verification', { email });
      const code = mail.at(-1).textContent.match(/\b\d{6}\b/)[0];
      const body = { ...employee('NEW', 'Newemployee'), email, emailVerificationId: verification.verificationId, emailVerificationCode: code };
      delete body._id; delete body.id;
      const created = await expect('POST', '/api/employees', body, 201); assert.equal(created.loginEmailSent, true);
      assert.ok(db.data.get('employee_accounts').find(row => row.employeeId === created.id)?.mustChangePassword);
      await expect('POST', `/api/employees/${created.id}/send-login-email`, { password, adminPassword: password });
    });
    await scenario('payroll preparation, bonus, holds, bulk payment, undo, and individual payment', async () => {
      await expect('POST', '/api/payroll-requests/prepare-bulk', { periodStart: payrollPeriodKey() });
      await expect('POST', '/api/payroll-requests', { employeeId: 'E1' });
      const row = db.data.get('payroll_requests').find(item => item.id === 'P1');
      Object.assign(row, { status: 'processing', amount: 100, currentAmount: 100, grossAmount: 100, hoursWorked: 2, additions: [], advanceDeduction: 0 });
      await expect('PATCH', '/api/payroll-requests/P1/reject-payment', { password });
      await expect('PATCH', '/api/payroll-requests/P1/remove-hold', { password });
      await expect('PATCH', '/api/payroll-requests/bonus', { scope: 'individual', requestId: 'P1', periodStart: payrollPeriodKey(), amount: 25 });
      assert.equal(row.bonusAmount, 25);
      const paid = await expect('PATCH', '/api/payroll-requests/pay-bulk', { ids: ['P1'], periodStart: payrollPeriodKey(), password }); assert.equal(paid.paid, 1);
      await expect('PATCH', '/api/payroll-requests/pay-bulk', { ids: ['P1'], periodStart: payrollPeriodKey(), password }, 409);
      await expect('PATCH', '/api/payroll-requests/undo-last-payment', { scope: 'individual', requestId: 'P1', periodStart: payrollPeriodKey(), password, reason: 'Controlled test reversal', paymentReversedConfirmed: true });
      const restored = db.data.get('payroll_requests').find(item => item.id === 'P1'); Object.assign(restored, { amount: 100, currentAmount: 100, status: 'processing' });
      await expect('PATCH', '/api/payroll-requests/P1/confirm-payment', { password });
      await expect('POST', '/api/payroll-requests/P1/email', {});
      await expect('POST', '/api/payroll/E1/email-summary', {});
    });
    await scenario('quarterly allowance preview, inclusion, and removal', async () => {
      const quarterDate = new Date(`${today().slice(0, 4)}-01-01T00:00:00Z`);
      const quarter = `${quarterDate.getUTCFullYear()}-Q1`;
      const person = db.data.get('employees').find(item => item.id === 'E1'); person.createdAt = new Date('2025-01-01'); person.salaryAddition = { amount: 300, frequency: 'quarterly', effectiveQuarter: '2025-Q1' };
      const row = db.data.get('payroll_requests')[0]; Object.assign(row, { status: 'processing', additions: [] });
      const preview = await expect('POST', '/api/payroll-requests/quarterly-additions/preview', { periodStart: payrollPeriodKey(), quarter });
      const entry = preview.entries.find(entry => entry.employeeId === 'E1'); assert.equal(entry.eligible, true, JSON.stringify(entry));
      const added = await expect('POST', '/api/payroll-requests/quarterly-additions/include', { periodStart: payrollPeriodKey(), quarter, selections: [{ requestId: 'P1', token: entry.token }] }); assert.equal(added.included, 1);
      await expect('POST', '/api/payroll-requests/quarterly-additions/remove', { requestId: 'P1', quarter });
    });
    await scenario('manual attendance, bulk attendance, forced clock-out and idle-day changes', async () => {
      db.data.set('payroll_requests', []);
      await expect('POST', '/api/attendance/manual', { employeeId: 'E1', action: 'time-in', date: today(), password });
      // Use an earlier known open time so closing does not depend on test speed.
      const row = db.data.get('attendance').find(item => item.employeeId === 'E1'); row.sessions[0].checkIn = '00:00'; row.checkIn = '00:00';
      await expect('POST', '/api/admin/force-clock-out', { scope: 'individual', employeeIds: ['E1'], date: today() });
      const bulk = await expect('POST', '/api/attendance/manual/bulk', { employeeIds: ['E2'], action: 'time-in', selectionMode: 'selected', date: today(), password }); assert.equal(bulk.recorded, 1);
      await expect('POST', '/api/attendance/idle-day', { date: offsetDate(2), idleDay: true, password });
      await expect('POST', '/api/attendance/idle-day', { date: offsetDate(2), idleDay: false, password });
      const historical = offsetDate(-1); const person = db.data.get('employees').find(item => item.id === 'E1'); person.createdAt = new Date(`${historical}T00:00:00Z`);
      const preview = await expect('GET', `/api/attendance/correction?employeeId=E1&date=${historical}`);
      await expect('PATCH', '/api/attendance/correction', { employeeId: 'E1', date: historical, sessionNumber: 1, checkIn: '08:00', checkOut: '09:00', version: preview.version, reason: 'Controlled correction test', password });
      const operation = { id: crypto.randomUUID(), kind: 'attendance', payload: { employeeId: 'E2', date: today(), sessionNumber: 1, checkOut: '01:00', captureOnly: true, reason: 'Controlled offline capture' } };
      const current = db.data.get('attendance').find(item => item.employeeId === 'E2'); current.sessions[0].checkIn = '00:00'; current.checkIn = '00:00';
      operation.payload.version = (await expect('GET', `/api/attendance/correction?employeeId=E2&date=${today()}`)).version;
      await expect('POST', '/api/offline/sync', { operation, password });
    });
    await scenario('simulated native scanner: enrollment, identification, and kiosk attendance', async () => {
      db.data.set('payroll_requests', []);
      const samples = [1, 2, 3].map(index => { const bytes = Buffer.alloc(64, 42); bytes[63] = index; return bytes.toString('base64'); });
      await expect('POST', '/api/fingerprints/check-enrollment', { fingerprintSamples: samples });
      await expect('POST', '/api/fingerprints/check-scan', { fingerprintSamples: [samples[0]] });
      await expect('PUT', '/api/employees/E1/fingerprint', { fingerprintSamples: samples, adminPassword: password });
      assert.ok(db.data.get('biometric_templates')[0].protectedSamples);
      const found = await expect('POST', '/api/fingerprints/identify', { fingerprintSamples: [samples[0]] }); assert.equal(found.employeeId, 'E1');
      await expect('POST', '/api/attendance/kiosk', { fingerprintSamples: [samples[0]] }, 201);
      assert.ok(db.data.get('attendance').find(row => row.employeeId === 'E1')?.sessions?.[0].checkIn);
      // A second employee must not enroll the same simulated identity.
      await expect('PUT', '/api/employees/E2/fingerprint', { fingerprintSamples: samples, adminPassword: password }, 409);
    });
    // Every write receives an authenticated request with empty input. This checks
    // error handling after authorization, separately from the feature scenarios.
    for (const route of inventory.filter(route => route.method !== 'GET' && !route.path.startsWith('/api/auth/'))) await scenario(`validation ${route.method} ${route.path}`, async () => {
      const result = await request(route.method, substitute(route), {}, route.path.startsWith('/api/employee/me') ? 'regular' : 'admin');
      assert.ok(result.status < 500 && result.status !== 404 || result.status === 404 && typeof result.data?.error === 'string', `${route.path} returned ${result.status}: ${JSON.stringify(result.data)}`);
    });
    await t.test('coverage gate: every API has a successful authenticated or public feature scenario', () => {
      for (const route of inventory) assert.ok(observations.get(`${route.method} ${route.path}`).some(item => item.status < 300 && !item.scenario.startsWith('validation')), `Missing success scenario: ${route.method} ${route.path}`);
    });
  } finally {
    await new Promise(resolve => setTimeout(resolve, 10));
    const report = inventory.map(route => ({ ...route, observations: observations.get(`${route.method} ${route.path}`) }));
    await writeFile(new URL('../../docs/api-route-test-results.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), routeCount: inventory.length, scope: 'Actual Express HTTP handlers; controlled in-memory records and mocked email. Physical scanner matching is external.', routes: report }, null, 2) + '\n');
    await writeFile(new URL('../../.api-browser-fixtures.local', import.meta.url), JSON.stringify(browserFixtures));
    await new Promise(resolve => server.close(resolve));
    mongoose.connection.db = originalDb; mongoose.startSession = originalStartSession; globalThis.fetch = originalFetch; childProcess.spawn = originalSpawn; syncBuiltinESMExports();
    for (const key of envKeys) if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
  }
});
