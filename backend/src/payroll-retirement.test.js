import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from './routes/api.js';

test('payroll reset is unavailable while real payment and hold routes remain', () => {
  const routes = router.stack.filter(layer => layer.route).map(layer => layer.route);
  assert.equal(routes.some(route => route.path === '/payroll-requests/:id/reset'), false);
  for (const action of ['confirm-payment', 'reject-payment', 'remove-hold']) {
    assert.ok(routes.some(route => route.path === `/payroll-requests/:id/${action}` && route.methods.patch));
  }
});

test('payroll list reads bounded projected records and preserves legacy period and pay fields', async () => {
  const original = mongoose.connection.db;
  const stored = { id: 'P1', employeeId: 'E1', employeeName: 'Alex', amount: 1200,
    createdAt: new Date('2026-10-12T01:00:00Z'), status: 'processing',
    advanceDeduction: 100, advanceDeductionPeriods: [{ periodStart: '2026-10-01', amount: 100 }],
    quarterlyAdditions: [{ label: 'Allowance', value: 200 }],
    internalHistory: 'must not be read into payroll list' };
  let selected;
  mongoose.connection.db = { collection(name) {
    if (name === 'employees') return { find: () => ({ toArray: async () => [{ id: 'E1' }] }) };
    assert.equal(name, 'payroll_requests');
    return { find(filter, options) {
      assert.deepEqual(filter, { employeeId: { $in: ['E1'] } });
      assert.equal(options.projection.internalHistory, undefined);
      selected = Object.fromEntries(Object.entries(stored).filter(([key]) => options.projection[key]));
      return { sort(order) {
        assert.deepEqual(order, { createdAt: -1, _id: -1 });
        return { limit(value) { assert.equal(value, 2000); return { toArray: async () => [selected] }; } };
      } };
    } };
  } };
  try {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    const handler = router.stack.find(layer => layer.route?.path === '/payroll-requests' && layer.route.methods.get).route.stack.at(-1).handle;
    await handler({}, res);
    assert.equal(res.code, undefined);
    assert.equal(res.body[0].periodStart, '2026-10-01');
    assert.equal(res.body[0].amount, stored.amount);
    assert.deepEqual(res.body[0].advanceDeductionPeriods, stored.advanceDeductionPeriods);
    assert.deepEqual(res.body[0].quarterlyAdditions, stored.quarterlyAdditions);
    assert.equal(res.body[0].internalHistory, undefined);
  } finally { mongoose.connection.db = original; }
});
