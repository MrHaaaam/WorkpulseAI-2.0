import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileIdleDaysWithSchedule } from './routes/api.js';

test('holiday takes precedence over future idle days while preserving worked attendance', async () => {
  const removed = [];
  const updated = [];
  const deleted = [];
  const db = { collection(name) {
    if (name === 'idle_days') return {
      find: () => ({ toArray: async () => [{ date: '2026-10-04' }, { date: '2026-10-05' }] }),
      deleteMany: async (filter) => { removed.push(...filter.date.$in); },
    };
    if (name === 'attendance') return {
      find: () => ({ toArray: async () => [
        { _id: 1, date: '2026-10-04', idleDay: true, status: 'Idle', sessions: [] },
        { _id: 2, date: '2026-10-04', idleDay: true, status: 'Idle', sessions: [{ checkIn: '08:00 AM' }] },
      ] }),
      updateOne: async (filter, change) => { updated.push({ id: filter._id, change }); },
      deleteOne: async (filter) => { deleted.push(filter._id); },
    };
    throw new Error(`Unexpected collection ${name}`);
  } };
  const settings = { shift: { workWeekdays: [0, 1], scheduleOverrides: [{ date: '2026-10-04', working: false, kind: 'holiday' }] } };
  assert.deepEqual(await reconcileIdleDaysWithSchedule(db, settings, '2026-10-01'), ['2026-10-04']);
  assert.deepEqual(removed, ['2026-10-04']);
  assert.deepEqual(deleted, [1]);
  assert.equal(updated[0].id, 2);
  assert.equal(updated[0].change.$set.status, 'Present');
  assert.ok(updated[0].change.$unset.idleDay !== undefined);
});
