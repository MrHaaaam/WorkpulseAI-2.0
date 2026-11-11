import test from 'node:test';
import assert from 'node:assert/strict';
import router from './routes/api.js';

const handle = router.stack.find(layer => layer.route?.path === '/attendance/manual/bulk').route.stack.at(-1).handle;
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('mixed attendance requires exactly one valid intended action per employee', async () => {
  for (const employeeActions of [undefined, [], [{ employeeId: 'a', action: 'time-in' }], [{ employeeId: 'a', action: 'time-in' }, { employeeId: 'a', action: 'time-out' }], [{ employeeId: 'a', action: 'time-in' }, { employeeId: 'other', action: 'time-out' }], [{ employeeId: 'a', action: 'time-in' }, { employeeId: 'b', action: 'toggle' }]]) {
    const res = response();
    await handle({ body: { employeeIds: ['a', 'b'], action: 'mixed', date, employeeActions } }, res);
    assert.equal(res.code, 400);
  }
});

test('valid mixed intentions still require administrator authentication', async () => {
  const res = response();
  await handle({ body: { employeeIds: ['a', 'b'], action: 'mixed', date, employeeActions: [{ employeeId: 'a', action: 'time-out' }, { employeeId: 'b', action: 'time-in' }] } }, res);
  assert.equal(res.code, 403);
  assert.equal(res.body.error, 'Administrator access required');
});
