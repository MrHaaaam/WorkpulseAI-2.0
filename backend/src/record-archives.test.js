import { memoryDb } from './test-support/memory-db.js';
import { cashAdvanceSummary } from './cash-advances.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRecordArchives } from './routes/record-archives.js';

function fixture(collections = {}) {
  let handler;
  const calls = [];
  registerRecordArchives({ post() {}, get: (_path, callback) => { handler = callback; } }, () => ({
    collection: name => ({ find: scope => {
      calls.push({ name, scope });
      return { toArray: async () => (collections[name] || []).filter(row => !scope.employeeId || row.employeeId === scope.employeeId) };
    } }),
  }));
  return { calls, run: async (kind, auth, query = {}) => {
    const result = { statusCode: 200, body: undefined };
    const res = { status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } };
    await handler({ params: { kind }, auth, query }, res);
    return result;
  } };
}
const admin = { accountType: 'admin', actor: { role: 'admin' } };
const employee = { accountType: 'employee', actor: { role: 'regular', employeeId: 'E1' } };

test('employee archives are scoped to the signed-in employee and reject admin-only additions', async () => {
  const app = fixture({ leave_requests: [
    { id: 'L1', employeeId: 'E1', status: 'approved', endDate: '2020-01-01' },
    { id: 'L2', employeeId: 'E2', status: 'approved', endDate: '2020-01-01' },
  ] });
  const result = await app.run('leave', employee);
  assert.equal(result.body.totalItems, 1);
  assert.equal(result.body.items[0].employeeId, 'E1');
  assert.deepEqual(app.calls[0].scope, { employeeId: 'E1' });
  assert.equal((await app.run('additions', employee)).statusCode, 403);
  assert.equal((await app.run('cash', { accountType: 'employee', actor: {} })).statusCode, 403);
  assert.equal((await app.run('leave', { accountType: 'admin', actor: { role: 'regular' } })).statusCode, 403);
});

test('archives include old records beyond workspace limits and paginate after filtering', async () => {
  const records = Array.from({ length: 37 }, (_, index) => ({ id: `P${index}`, employeeId: 'E1', periodStart: '2020-01-01', status: 'paid', amount: 100 }));
  records.push({ id: 'future', employeeId: 'E1', periodStart: '2999-01-01', status: 'processing' });
  const app = fixture({ payroll_requests: records });
  const result = await app.run('payroll', employee, { page: '4', search: 'paid' });
  assert.equal(result.body.totalItems, 37);
  assert.equal(result.body.items.length, 7);
  assert.equal(result.body.page, 4);
  assert.equal((await app.run('payroll', employee, { status: 'processing' })).body.totalItems, 0);
  assert.equal((await app.run('payroll', employee, { from: '2021-01-01' })).body.totalItems, 0);
  assert.equal((await app.run('payroll', employee, { from: '2021-01-01', to: '2020-01-01' })).statusCode, 400);
});

test('cash archives distinguish requests, direct cash, and repayments without hiding balances', async () => {
  const app = fixture({
    cash_advance_requests: [{ id: 'R1', employeeId: 'E1', requestedAt: '2020-01-01', status: 'accepted', amount: 500 }],
    cash_advances: [{ id: 'C1', employeeId: 'E1', date: '2020-01-02', amount: 500 }],
    payroll_requests: [{ id: 'P1', employeeId: 'E1', paidAt: '2020-01-15', periodStart: '2020-01-01', status: 'paid', advanceDeduction: 200 }],
  });
  const result = await app.run('cash', admin);
  assert.equal(result.body.totalItems, 3);
  const repayments = await app.run('cash', employee, { type: 'Repayment' });
  assert.equal(repayments.body.totalItems, 1);
  assert.equal(repayments.body.items[0].amount, 200);
});

test('paid additions are reconstructed with carried payroll sources before archiving', async () => {
  const app = fixture({ payroll_requests: [
    { id: 'source', employeeId: 'E1', status: 'paid', settledBy: 'paid', additions: [{ label: 'SSS', value: 300 }] },
    { id: 'paid', employeeId: 'E1', status: 'paid', paidAt: '2020-03-01', periodStart: '2020-02-16', additions: [{ label: 'PhilHealth', value: 200 }] },
  ] });
  const result = await app.run('additions', admin);
  assert.equal(result.body.totalItems, 1);
  assert.equal(result.body.items[0].amount, 500);
});


function deletionFixture(collections) {
  const db = memoryDb();
  for (const [name, records] of Object.entries(collections)) db.data.set(name, structuredClone(records));
  const handlers = {};
  registerRecordArchives({ get: (_path, handler) => { handlers.get = handler; }, post: (_path, handler) => { handlers.post = handler; } }, () => db);
  return { db, async run(method, kind, auth, body = {}, query = {}) {
    const result = { status: 200 };
    const res = { locals: {}, status(code) { result.status = code; return this; }, json(value) { result.body = value; return this; } };
    await handlers[method]({ params: { kind }, auth, body, query }, res);
    return result;
  } };
}

test('employee bulk deletion is persistent, private, and preserves original financial records', async () => {
  const app = deletionFixture({ payroll_requests: [
    { id: 'P1', employeeId: 'E1', periodStart: '2020-01-01', status: 'paid', paidAt: '2020-01-16', amount: 800, advanceDeduction: 200 },
    { id: 'P2', employeeId: 'E1', periodStart: '2020-02-01', status: 'paid', amount: 1000, advanceDeduction: 0 },
  ], cash_advances: [{ id: 'C1', employeeId: 'E1', date: '2020-01-01', amount: 500 }] });
  const balance = await cashAdvanceSummary(app.db, 'E1');
  assert.equal((await app.run('post', 'payroll', employee, { ids: ['Payroll:P1', 'Payroll:P2'] })).body.deleted, 2);
  assert.equal((await app.run('get', 'payroll', employee)).body.totalItems, 0);
  assert.equal((await app.run('get', 'payroll', admin)).body.totalItems, 2);
  assert.equal(await app.db.collection('payroll_requests').countDocuments({ employeeId: 'E1' }), 2);
  assert.deepEqual(await cashAdvanceSummary(app.db, 'E1'), balance);
});

test('deletion refuses another employee, current records, and invalid requests without partial writes', async () => {
  const app = deletionFixture({ leave_requests: [
    { id: 'L1', employeeId: 'E1', endDate: '2020-01-01', status: 'rejected' },
    { id: 'L2', employeeId: 'E2', endDate: '2020-01-01', status: 'rejected' },
    { id: 'L3', employeeId: 'E1', endDate: '2999-01-01', status: 'pending' },
  ] });
  for (const ids of [['Leave request:L1', 'Leave request:L2'], ['Leave request:L3']]) {
    assert.equal((await app.run('post', 'leave', employee, { ids })).status, 409);
  }
  assert.equal((await app.run('post', 'leave', employee, {})).status, 400);
  assert.equal((await app.run('post', 'leave', employee, { allMatching: true, filters: { from: '2026-02-30' } })).status, 400);
  assert.equal((await app.run('post', 'additions', employee, { allMatching: true })).status, 403);
  assert.equal(await app.db.collection('archive_deleted_records').countDocuments({}), 0);
});

test('select all matching deletes across pages and honors exclusions and the original filter', async () => {
  const app = deletionFixture({ leave_requests: Array.from({ length: 35 }, (_, index) => ({ id: `L${index}`, employeeId: 'E1', endDate: '2020-01-01', status: index < 25 ? 'rejected' : 'cancelled' })) });
  const result = await app.run('post', 'leave', employee, { allMatching: true, filters: { status: 'rejected' }, excludedIds: ['Leave request:L1'] });
  assert.equal(result.body.deleted, 24);
  assert.equal((await app.run('get', 'leave', employee)).body.totalItems, 11);
  assert.equal((await app.run('get', 'leave', employee, {}, { status: 'rejected' })).body.totalItems, 1);
  assert.equal((await app.run('get', 'leave', admin)).body.totalItems, 35);
});

test('every archive category supports deletion independently without removing ledger data', async () => {
  const app = deletionFixture({
    payroll_requests: [{ id: 'P1', employeeId: 'E1', periodStart: '2020-01-01', status: 'paid', paidAt: '2020-01-16', advanceDeduction: 100, additions: [{ label: 'SSS', value: 200 }] }],
    cash_advance_requests: [{ id: 'R1', employeeId: 'E1', requestedAt: '2020-01-01', status: 'cancelled' }],
    cash_advances: [{ id: 'C1', employeeId: 'E1', date: '2020-01-01', amount: 300 }],
    leave_requests: [{ id: 'L1', employeeId: 'E1', endDate: '2020-01-01', status: 'approved' }],
  });
  for (const kind of ['leave', 'payroll', 'cash', 'additions']) {
    const before = await app.run('get', kind, admin);
    assert.ok(before.body.totalItems > 0);
    const result = await app.run('post', kind, admin, { allMatching: true });
    assert.equal(result.body.deleted, before.body.totalItems);
    assert.equal((await app.run('get', kind, admin)).body.totalItems, 0);
  }
  assert.equal(await app.db.collection('payroll_requests').countDocuments({}), 1);
  assert.equal(await app.db.collection('cash_advances').countDocuments({}), 1);
});
