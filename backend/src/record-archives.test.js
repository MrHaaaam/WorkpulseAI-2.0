import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRecordArchives } from './routes/record-archives.js';

function fixture(collections = {}) {
  let handler;
  const calls = [];
  registerRecordArchives({ get: (_path, callback) => { handler = callback; } }, () => ({
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
