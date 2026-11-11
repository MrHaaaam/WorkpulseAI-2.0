import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceArrivalStatus, enforceAutomaticAbsences } from './routes/api.js';

const settings = { shift: { startTime: '06:00' } };

test('an idle day is neither absent nor late, even if the employee works', () => {
  assert.equal(attendanceArrivalStatus({ status: 'Idle', idleDay: true, sessions: [] }, settings), 'Idle');
  assert.equal(attendanceArrivalStatus({ status: 'Idle', idleDay: true, sessions: [{ checkIn: '09:00 AM' }] }, settings), 'Idle');
  assert.equal(attendanceArrivalStatus({ status: 'Absent', sessions: [] }, settings), 'Absent');
  assert.equal(attendanceArrivalStatus({ status: 'On Leave', sessions: [] }, settings), 'On Leave');
  assert.equal(attendanceArrivalStatus({ status: 'Late', sessions: [{ checkIn: '09:00 AM' }] }, settings), 'Present');
});

test('automatic absence job records a company idle day instead of an absence', async () => {
  let operations = [];
  const db = { collection(name) {
    if (name === 'attendance') return {
      deleteMany: async () => ({ deletedCount: 0 }),
      find: () => ({ toArray: async () => [] }),
      bulkWrite: async (items) => { operations = items; return { upsertedCount: items.length }; },
    };
    if (name === 'idle_days') return { find: () => ({ toArray: async () => [{ date: '2026-09-29' }] }) };
    if (name === 'employees') return { find: () => ({ toArray: async () => [{ id: 'EMP-001', name: 'Employee', role: 'regular', createdAt: new Date('2026-09-29T00:00:00Z') }] }) };
    if (name === 'leave_requests') return { find: () => ({ toArray: async () => [] }) };
    throw new Error(`Unexpected collection ${name}`);
  } };
  await enforceAutomaticAbsences(db, { shift: { workWeekdays: [2], scheduleOverrides: [] } }, new Date('2026-09-30T04:00:00Z'));
  assert.equal(operations.length, 1);
  assert.equal(operations[0].updateOne.update.$setOnInsert.status, 'Idle');
  assert.equal(operations[0].updateOne.update.$setOnInsert.idleDay, true);
});
