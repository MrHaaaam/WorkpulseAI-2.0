import test from 'node:test';
import assert from 'node:assert/strict';
import { recordedDayTime } from '../../shared/recorded-time.js';

test('calendar daily total includes all completed sessions without double-counting legacy summary', () => {
  assert.equal(recordedDayTime({ checkIn: '05:19 PM', checkOut: '06:07 PM' }).label, '0h 48m');
  assert.equal(recordedDayTime({ checkIn: '08:00', checkOut: '17:00', sessions: [{ checkIn: '08:00', checkOut: '12:00' }, { checkIn: '01:00 PM', checkOut: '05:00 PM' }] }).label, '8h 0m');
});
test('calendar daily total handles midnight and excludes unfinished or malformed sessions', () => {
  assert.equal(recordedDayTime({ sessions: [{ checkIn: '11:00 PM', checkOut: '01:30 AM' }] }).label, '2h 30m');
  assert.equal(recordedDayTime({ checkIn: '12:00 AM', checkOut: '12:00 PM' }).label, '12h 0m');
  assert.deepEqual(recordedDayTime({ sessions: [{ checkIn: '09:00', checkOut: '10:00' }, { checkIn: '11:00' }, { checkIn: '25:00', checkOut: '26:00' }] }), { minutes: 60, openSessions: 1, label: '1h 0m' });
  assert.equal(recordedDayTime(undefined).label, '0h 0m');
});
