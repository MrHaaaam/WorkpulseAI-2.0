import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentAttendanceEvents } from './recent-attendance.js';

const today = '2026-10-07';
test('recent attendance lists distinct successful events from all sessions, newest first', () => {
  const records = [
    { employeeId: 'EMP-1', name: 'First Employee', date: today, sessions: [
      { checkIn: '06:00 AM', checkInAt: '2026-10-06T22:00:00Z', checkOut: '09:00 AM', checkOutAt: '2026-10-07T01:00:00Z' },
      { checkIn: '10:00 AM', checkInAt: '2026-10-07T02:00:00Z' },
    ], fingerprintSamples: ['private'], email: 'private@example.com' },
    { employeeId: 'EMP-2', name: 'Second Employee', date: today, checkIn: '08:00 AM', checkOut: '06:00 PM' },
    { employeeId: 'EMP-3', date: today, status: 'Absent' },
    { employeeId: 'EMP-4', date: '2026-10-06', checkIn: '08:00 AM' },
  ];
  const events = recentAttendanceEvents(records, { today });
  assert.equal(events.length, 5);
  assert.deepEqual(events.map(event => event.action), ['time-out', 'time-in', 'time-out', 'time-in', 'time-in']);
  assert.match(events[0].time, /6:00\s*PM/i);
  assert.equal(new Set(events.map(event => event.id)).size, 5);
  assert.equal(JSON.stringify(events).includes('private'), false);
  assert.equal(recentAttendanceEvents(records, { today, limit: 2 }).length, 2);
});

test('empty, invalid, and previous-day events are excluded and auto clock-outs are labeled', () => {
  assert.deepEqual(recentAttendanceEvents([], { today }), []);
  const events = recentAttendanceEvents([
    { employeeId: 'EMP-1', date: today, sessions: [
      { checkIn: 'invalid', checkOut: '18:00', autoClockedOut: true },
      { checkIn: '07:00 AM', checkInAt: '2026-10-06T01:00:00Z' },
    ] },
    { employeeId: 'EMP-2', date: today, checkIn: '28:00' },
  ], { today });
  assert.equal(events.length, 1);
  assert.equal(events[0].automatic, true);
  assert.equal(events[0].action, 'time-out');
});
