import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import router from './routes/api.js';
import { cashAdvanceSummary } from './cash-advances.js';

const handler = (method, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('employee request and accepted terms create no debt before cash is given', async t => {
  const originalDb = mongoose.connection.db;
  let request;
  const db = { collection(name) {
    if (name === 'employees') return { findOne: async () => ({ id: 'E1', name: 'Employee One', status: 'active' }) };
    if (name === 'settings') return { findOne: async () => null };
    if (name === 'cash_advances') return { findOne: async () => null, find: () => ({ toArray: async () => [] }) };
    if (name === 'cash_advance_requests') return {
      insertOne: async value => { request = value; },
      findOneAndUpdate: async (filter, update) => {
        if (request?.id !== filter.id || request.status !== filter.status && typeof filter.status === 'string') return null;
        request = { ...request, ...update.$set };
        return request;
      },
    };
    return { find: () => ({ toArray: async () => [] }) };
  } };
  mongoose.connection.db = db;
  t.after(() => { mongoose.connection.db = originalDb; });
  const req = body => ({ body, auth: { actor: { employeeId: 'E1' } } });
  let res = response();
  await handler('post', '/employee/me/cash-advance-requests')(req({ amount: 1000, repaymentAgreed: false }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(request, undefined);
  res = response();
  await handler('post', '/employee/me/cash-advance-requests')(req({ amount: 1000, reason: 'Transport', repaymentAgreed: true }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(request.status, 'pending');
  assert.equal((await cashAdvanceSummary(db, 'E1')).balance, 0);
  request.status = 'approved'; request.startPeriod = '2026-10-16';
  res = response();
  await handler('patch', '/employee/me/cash-advance-requests/:id/accept')({ ...req({}), params: { id: request.id } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(request.status, 'accepted');
  assert.equal((await cashAdvanceSummary(db, 'E1')).balance, 0);
});
