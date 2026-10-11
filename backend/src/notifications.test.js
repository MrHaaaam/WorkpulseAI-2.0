import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotifications, NOTIFICATION_LIFETIME_MS } from './notifications.js';

const now = new Date('2026-09-18T12:00:00Z');
const leave = (id, createdAt, status = 'pending') => ({ id, createdAt, status, employeeId: 'E1', employeeName: 'Alex', startDate: '2026-09-20', endDate: '2026-09-21' });

test('historical attendance edits produce separate admin notifications with stable IDs and actual edit timestamps', () => {
  const record = { employeeId: 'E1', name: 'Alex', date: '2025-01-01', sessions: [{ checkIn: '09:00 AM', checkOut: '05:00 PM' }], correctionHistory: [
    { sessionNumber: 1, correctedAt: '2026-09-18T10:00:00Z', reason: 'Supervisor verified arrival', before: [{ checkIn: '08:00 AM', checkOut: '05:00 PM' }], after: [{ checkIn: '09:00 AM', checkOut: '05:00 PM' }] },
    { sessionNumber: 1, correctedAt: '2026-09-18T11:00:00Z', reason: 'Verified departure', before: [{ checkIn: '09:00 AM', checkOut: '05:00 PM' }], after: [{ checkIn: '09:00 AM', checkOut: '04:00 PM' }] },
  ] };
  const events = buildNotifications({ now, attendance: [record] });
  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'Alex: attendance edited by admin');
  assert.match(events[1].description, /2025-01-01.*08:00 AM.*09:00 AM.*Supervisor verified arrival/);
  assert.equal(events[0].employeeId, 'E1');
  assert.notEqual(events[0].id, events[1].id);
  assert.deepEqual(buildNotifications({ now: new Date(now.getTime() + 60000), attendance: [record] }), events);
  assert.equal(buildNotifications({ now: new Date(now.getTime() + NOTIFICATION_LIFETIME_MS), attendance: [record] }).length, 0);
});


test('expires at exactly 72 hours and excludes future or invalid events', () => {
  const cutoff = now.getTime() - NOTIFICATION_LIFETIME_MS;
  const result = buildNotifications({ now, leaveRequests: [leave('expired', new Date(cutoff)), leave('live', new Date(cutoff + 1)), leave('future', new Date(now.getTime() + 1)), leave('invalid', 'invalid')] });
  assert.deepEqual(result.map((item) => item.id), ['leave:live']);
  assert.equal(result[0].expiresAt.getTime(), now.getTime() + 1);
});

test('sorts all categories newest first and preserves resolved leave events', () => {
  const result = buildNotifications({ now, leaveRequests: [leave('approved', '2026-09-18T10:00:00Z', 'approved')], attendance: [{ employeeId: 'E1', name: 'Alex', date: '2026-09-18', status: 'Late', sessions: [{ checkIn: '09:00', checkInAt: '2026-09-18T01:00:00Z', checkOut: '19:00', checkOutAt: '2026-09-18T11:00:00Z' }] }] });
  assert.deepEqual(result.map((item) => item.category), ['attendance', 'leave', 'attendance']);
  assert.equal(result[2].title, 'Alex clocked in');
});

test('each attendance session has independent IDs, and later scans do not renew earlier events', () => {
  const record = { employeeId: 'E1', name: 'Alex', date: '2026-09-18', sessions: [{ checkIn: '08:00 AM', checkOut: '12:00 PM' }, { checkIn: '01:00 PM', checkOut: '05:00 PM' }] };
  const first = buildNotifications({ now, attendance: [record] });
  const refreshed = buildNotifications({ now: new Date(now.getTime() + 60_000), attendance: [{ ...record, updatedAt: new Date() }] });
  assert.equal(new Set(first.map((item) => item.id)).size, 4);
  assert.deepEqual(first, refreshed);
  assert.equal(first.at(-1).createdAt.toISOString(), '2026-09-18T00:00:00.000Z');
});

test('AI alerts use source event dates and never revive expired conditions', () => {
  const insights = { risk: { employees: [{ employeeId: 'E1', name: 'Alex', tier: 'red', absenceDays: 6, absenceDates: ['2026-09-10'] }] }, anomaly: { status: 'ready', anomalies: [{ employeeId: 'E2', name: 'Sam', date: '2026-09-18', time: '03:00' }] } };
  const result = buildNotifications({ now, insights });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'ai:arrival:E2:2026-09-18');
  assert.equal(result[0].category, 'insights');
  assert.equal(result[0].expiresAt.toISOString(), '2026-09-20T19:00:00.000Z');
});

test('limited AI analysis and green risk do not produce alerts', () => {
  const result = buildNotifications({ now, insights: { risk: { employees: [{ tier: 'green' }] }, anomaly: { status: 'limited', anomalies: [{ employeeId: 'E1', date: '2026-09-18', time: '03:00' }] } } });
  assert.deepEqual(result, []);
});

test('recorded absences and current risk are separate categories with stable expiration', () => {
  const record = { employeeId: 'E1', name: 'Alex', date: '2026-09-17', status: 'Absent', createdAt: '2026-09-17T15:00:00Z' };
  const insights = { risk: { employees: [{ employeeId: 'E1', name: 'Alex', tier: 'orange', absenceDays: 3, absenceDates: ['2026-09-15', '2026-09-16', '2026-09-17'] }] } };
  const result = buildNotifications({ now, attendance: [record], insights });
  assert.deepEqual(new Set(result.map((item) => item.category)), new Set(['attendance', 'insights']));
  assert.ok(result.every((item) => item.expiresAt.toISOString() === '2026-09-20T15:00:00.000Z'));
});
