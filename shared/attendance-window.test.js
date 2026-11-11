import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceWindowError } from './attendance-window.js';
test('schedule bounds reject early arrivals and late departures, including open sessions', () => {
  const schedule = { workStartTime: '06:00', overtimeStopTime: '19:00' };
  assert.match(attendanceWindowError('04:00', '', schedule), /before the scheduled start 06:00/);
  assert.match(attendanceWindowError('06:00', '21:00', schedule), /after the final cutoff 19:00/);
  assert.match(attendanceWindowError('20:00', '', schedule), /after the final cutoff/);
  assert.equal(attendanceWindowError('06:00', '19:00', schedule), null);
});
test('overnight schedules allow next-day departures up to the cutoff', () => {
  const schedule = { workStartTime: '22:00', overtimeStopTime: '06:00' };
  assert.equal(attendanceWindowError('22:00', '06:00', schedule), null);
  assert.match(attendanceWindowError('22:00', '07:00', schedule), /after the final cutoff/);
});
