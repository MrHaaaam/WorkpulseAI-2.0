import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import router from './routes/api.js';

const handler = router.stack.find(layer => layer.route?.path === '/biometric-evaluation-trials/:id/confirm').route.stack.at(-1).handle;
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('trial assessment validates input, enforces ownership, and accepts only one review', async () => {
  const original = mongoose.connection.db;
  const trial = { id: 'trial-1', createdBy: 'admin@example.test', confirmationPending: true, classification: 'TA', accepted: true };
  let writes = 0;
  mongoose.connection.db = { collection(name) {
    assert.equal(name, 'biometric_evaluation_trials');
    return { async updateOne(filter, update) {
      if (!Object.entries(filter).every(([key, value]) => trial[key] === value)) return { matchedCount: 0 };
      writes++;
      Object.assign(trial, update.$set);
      return { matchedCount: 1 };
    } };
  } };
  const assess = async (assessment, email = trial.createdBy) => {
    const res = response();
    await handler({ params: { id: trial.id }, auth: { actor: { email } }, body: { assessment } }, res);
    return res;
  };
  try {
    for (const invalid of [undefined, null, true, 'other', { $ne: null }]) assert.equal((await assess(invalid)).code, 400);
    assert.equal((await assess('wrong', 'other@example.test')).code, 409);
    assert.equal(writes, 0);
    assert.equal((await assess('wrong')).code, 200);
    assert.equal(trial.assessment, 'wrong');
    assert.equal(trial.confirmationPending, false);
    assert.equal(trial.classification, 'TA');
    assert.equal(trial.accepted, true);
    assert.ok(trial.assessedAt instanceof Date);
    assert.equal(trial.assessedBy, trial.createdBy);
    assert.equal((await assess('correct')).code, 409);
    assert.equal(writes, 1);
    assert.equal(trial.assessment, 'wrong');
    trial.confirmationPending = true;
    assert.equal((await assess('correct')).code, 200);
    assert.equal(trial.assessment, 'correct');
  } finally { mongoose.connection.db = original; }
});

test('automatic tester scans need no employee selection and stay pending until reviewed', async () => {
  const original = mongoose.connection.db;
  const saved = [];
  const create = router.stack.find(layer => layer.route?.path === '/biometric-evaluation-trials' && layer.route.methods.post).route.stack.at(-1).handle;
  mongoose.connection.db = { collection(name) {
    assert.ok(['employees', 'biometric_evaluation_trials'].includes(name), 'Tester must not touch attendance');
    return {
      find: () => ({ toArray: async () => [] }),
      insertOne: async trial => { saved.push(trial); },
    };
  } };
  try {
    const res = response();
    await create({ auth: { actor: { email: 'admin@example.test' } }, body: {
      expectedType: 'automatic', fingerprintSamples: [Buffer.alloc(64, 1).toString('base64')],
    } }, res);
    assert.equal(res.code, 201);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].expectedEmployeeId, null);
    assert.equal(saved[0].expectedType, 'automatic');
    assert.equal(saved[0].classification, null);
    assert.equal(saved[0].accepted, false);
    assert.equal(saved[0].confirmationPending, true);
    assert.equal(saved[0].mode, 'automatic-identification');
  } finally { mongoose.connection.db = original; }
});
