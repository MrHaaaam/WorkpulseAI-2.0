import test from 'node:test';
import assert from 'node:assert/strict';
import router from './routes/api.js';
const handle = router.stack.find(layer => layer.route?.path === '/offline/sync').route.stack.at(-1).handle;
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('employee roles cannot use offline sync', async () => {
  for (const role of ['regular', 'extra', 'manager', 'supervisor']) {
    const res = response();
    await handle({ auth: { actor: { role } }, body: { operation: { kind: 'attendance' } } }, res);
    assert.equal(res.code, 403);
    assert.match(res.body.error, /administrators only/);
  }
});
test('admin offline sync accepts only attendance operations', async () => {
  for (const kind of ['leave', 'cash-advance']) {
    const res = response();
    await handle({ auth: { actor: { role: 'admin' } }, body: { operation: { kind } } }, res);
    assert.equal(res.code, 403);
    assert.match(res.body.error, /Only administrator attendance/);
  }
});
test('offline sync rejects edits to existing attendance', async () => {
  const res = response();
  await handle({ auth: { actor: { role: 'admin' } }, body: { operation: { kind: 'attendance', payload: { captureOnly: false } } } }, res);
  assert.equal(res.code, 403);
  assert.match(res.body.error, /Editing existing attendance requires/);
});
