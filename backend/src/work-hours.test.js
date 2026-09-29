import test from 'node:test';
import assert from 'node:assert/strict';
import { workHourOrderError } from '../../shared/work-hours.js';

test('accepts normal and overnight work hours', () => {
  assert.equal(workHourOrderError('06:00', '18:00', '21:00'), null);
  assert.equal(workHourOrderError('22:00', '06:00', '08:00'), null);
  assert.equal(workHourOrderError('06:00', '18:00', '18:00'), null);
});

test('rejects missing or reversed work-hour boundaries', () => {
  assert.ok(workHourOrderError('06:00', '18:00', '17:00'));
  assert.ok(workHourOrderError('06:00', '06:00', '21:00'));
  assert.ok(workHourOrderError('06:00', '', '21:00'));
});
