import assert from 'node:assert/strict';
import test from 'node:test';
import { hashSecret, verifyAdminPassword } from './routes/auth.js';

test('the third wrong admin password starts at 5 seconds and later waits grow to 60', async t => {
  const actor = { _id: `retry-test-${Date.now()}`, role: 'admin', passwordHash: await hashSecret('correct-password') };
  const request = { auth: { actor }, ip: '127.0.0.1' };
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });
  for (let attempt = 1; attempt <= 16; attempt += 1) {
    const failure = await verifyAdminPassword(request, 'wrong-password');
    assert.equal(failure.valid, false);
    const expectedWait = attempt < 3 ? undefined : Math.min(60, 5 + (attempt - 3) * 5);
    assert.equal(failure.retryAfterSeconds, expectedWait);
    if (expectedWait) now += expectedWait * 1000;
  }
  const next = await verifyAdminPassword(request, 'wrong-password');
  assert.equal(next.retryAfterSeconds, 60);
  const locked = await verifyAdminPassword(request, 'correct-password');
  assert.equal(locked.valid, false);
  assert.ok(locked.retryAfterSeconds > 0);
  now += 60_000;
  const success = await verifyAdminPassword(request, 'correct-password');
  assert.equal(success.valid, true);
  const afterSuccess = await verifyAdminPassword(request, 'wrong-password');
  assert.equal(afterSuccess.retryAfterSeconds, undefined);
});
