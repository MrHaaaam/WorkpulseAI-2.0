import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from './routes/api.js';
import { registerEmployeeUpdates } from './routes/employee-updates.js';

const route = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack;
const response = () => ({ code: 200, locals: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
const request = role => ({ auth: { actor: { role, employeeId: 'E1', email: 'test@example.test' } } });
test('correction preview returns the leave restriction even when no attendance session exists', async () => {
  const original = mongoose.connection.db;
  const handlers = new Map();
  const previewRouter = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, (path, ...stack) => handlers.set(`${method}:${path}`, stack.at(-1))]));
  registerEmployeeUpdates(previewRouter, { getSettings: async () => ({}), enforceAutomaticClockOut: async () => {} });
  mongoose.connection.db = { collection(name) { return {
    findOne: async () => name === 'employees' ? { id: 'E1', name: 'Alex', status: 'active' } : null,
    find: filter => ({ toArray: async () => {
      assert.equal(filter.employeeId, 'E1');
      return name === 'leave_requests' ? [{ status: 'approved', approvedDates: ['2026-10-09'] }] : [];
    } }),
  }; } };
  try {
    const res = response();
    await handlers.get('get:/attendance/correction')({ ...request('admin'), query: { employeeId: 'E1', date: '2026-10-09' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.sessions, []);
    assert.match(res.body.blockedReason, /approved leave/);
  } finally { mongoose.connection.db = original; }
});
test('all employee roles can access their inbox but cannot edit attendance', () => {
  for (const role of ['regular', 'extra', 'manager', 'supervisor']) {
    let allowed = false;
    route('/employee/me/notifications', 'get')[0].handle(request(role), response(), () => { allowed = true; }); assert.ok(allowed);
    for (const method of ['get', 'patch']) { const res = response(); route('/attendance/correction', method)[0].handle(request(role), res, () => assert.fail('employee edit access')); assert.equal(res.code, 403); }
  }
  assert.equal(router.stack.some(layer => layer.route?.path?.includes('attendance-reports')), false);
});
test('direct attendance correction requires administrator password even when handler is called directly', async () => {
  const res = response(); await route('/attendance/correction', 'patch').at(-1).handle({ ...request('regular'), body: {} }, res); assert.equal(res.code, 403);
  const wrong = response(); await route('/attendance/correction', 'patch').at(-1).handle({ ...request('admin'), ip: 'test', body: {} }, wrong); assert.equal(wrong.code, 401);
});

test('offline attendance sync also requires administrator role and a fresh password', async () => {
  const operation = { id: 'offline-attendance-00001', kind: 'attendance', payload: {} };
  const denied = response();
  await route('/offline/sync', 'post').at(-1).handle({ ...request('regular'), body: { operation } }, denied);
  assert.equal(denied.code, 403);
  const missingPassword = response();
  await route('/offline/sync', 'post').at(-1).handle({ ...request('admin'), ip: 'offline-test', body: { operation } }, missingPassword);
  assert.equal(missingPassword.code, 401);
});
test('notification listing and mark-read are scoped to the authenticated employee', async () => {
  const original = mongoose.connection.db; const filters = [];
  mongoose.connection.db = { collection() { return {
    find: filter => { filters.push(filter); return { sort: () => ({ limit: () => ({ toArray: async () => [{ id: 'N1', employeeId: 'E1' }] }) }), toArray: async () => [{ id: 'N1' }] }; },
    updateMany: async filter => { filters.push(filter); },
  }; } };
  try {
    await route('/employee/me/notifications', 'get').at(-1).handle({ ...request('extra'), query: { employeeId: 'E2' } }, response());
    assert.deepEqual(filters[0], { employeeId: 'E1' });
    const res = response();
    await route('/employee/me/notifications/read', 'post').at(-1).handle({ ...request('extra'), body: { employeeId: 'E2', ids: ['N1', 'N2-owned-by-another-employee'] } }, res);
    assert.deepEqual(res.body.readIds, ['N1']); assert.equal(filters[1].employeeId, 'E1'); assert.deepEqual(filters[1], filters[2]);
  } finally { mongoose.connection.db = original; }
});
test('bulk bonus records only successfully changed employees for notifications', async () => {
  const original = mongoose.connection.db; let calls = 0;
  mongoose.connection.db = { collection() { return {
    find: () => ({ toArray: async () => [{ _id: 'P1', id: 'P1', employeeId: 'E1', employeeName: 'Alex' }, { _id: 'P2', id: 'P2', employeeId: 'E2', employeeName: 'Sam' }] }),
    updateOne: async filter => { calls++; return { modifiedCount: filter._id === 'P1' ? 1 : 0 }; },
  }; } };
  try {
    const res = response();
    await route('/payroll-requests/bonus', 'patch').at(-1).handle({ ...request('admin'), body: { scope: 'all', periodStart: '2026-10-01', amount: 100 } }, res);
    assert.equal(calls, 2); assert.equal(res.body.updated, 1); assert.deepEqual(res.locals.auditMetadata.employeeNotificationIds, ['E1']);
  } finally { mongoose.connection.db = original; }
});
