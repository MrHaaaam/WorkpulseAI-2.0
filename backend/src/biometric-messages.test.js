import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintAccountProblem, registeredFingerprintDecision, DUPLICATE_FINGERPRINT_MESSAGE } from './biometrics.js';

test('identification checks retained registrations only after active matching fails', async () => {
  const active = [{ employeeId: 'active' }];
  const archived = [{ employeeId: 'archived' }];
  let queries = 0;
  const db = { collection: () => ({ find: filter => {
    queries++;
    assert.deepEqual(filter, { employeeId: { $nin: ['active'] } });
    return { toArray: async () => archived };
  } }) };
  const accepted = { accepted: true, best: { employeeId: 'active' } };
  assert.equal(await registeredFingerprintDecision(db, 'probe', active, async () => accepted), accepted);
  assert.equal(queries, 0);
  const rejected = { accepted: false, best: null };
  const retainedMatch = { accepted: true, best: { employeeId: 'archived' } };
  assert.equal(await registeredFingerprintDecision(db, 'probe', active, async (_, templates) => templates === active ? rejected : retainedMatch), retainedMatch);
  assert.equal(await registeredFingerprintDecision(db, 'probe', active, async () => rejected), rejected);
});

test('retained registrations explain inactive accounts without permitting attendance', () => {
  for (const employee of [{ archived: true }, { banned: true }, { status: 'inactive' }]) {
    assert.equal(fingerprintAccountProblem(employee), 'Your employee account is inactive. Please contact an administrator.');
  }
  assert.match(fingerprintAccountProblem(null), /saved registration.*employee record is unavailable/);
  assert.equal(fingerprintAccountProblem({ status: 'active' }), null);
  assert.equal(fingerprintAccountProblem({ status: 'on-leave' }), null);
});

test('duplicate enrollment message explains retained registrations and the next action', () => {
  assert.match(DUPLICATE_FINGERPRINT_MESSAGE, /existing or archived employee account/);
  assert.match(DUPLICATE_FINGERPRINT_MESSAGE, /administrator/);
});
