import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveRequestDaysError } from '../../shared/leave-policy.js';

test('new leave requests allow up to ten distinct days, including nonconsecutive dates', () => {
  const dates = Array.from({ length: 10 }, (_, index) => `2026-10-${String(index * 2 + 1).padStart(2, '0')}`);
  assert.equal(leaveRequestDaysError(dates), null);
  assert.equal(leaveRequestDaysError([...dates, dates[0]]), null);
  assert.match(leaveRequestDaysError([...dates, '2026-11-01']), /1 and 10/);
  assert.match(leaveRequestDaysError([]), /1 and 10/);
});
