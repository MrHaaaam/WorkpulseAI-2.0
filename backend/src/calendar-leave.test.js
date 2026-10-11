import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarLeavesForDate, leaveDateProgress } from '../../shared/calendar-leave.js';

test('October 8 passes while October 10 and future dates of the same request remain pending', () => {
  const request = { id: 'L1', status: 'pending', leaveType: 'Personal Leave', startDate: '2026-10-08', endDate: '2026-10-14', requestedDates: ['2026-10-08', '2026-10-10', '2026-10-12', '2026-10-14'] };
  const labels = request.requestedDates.map(date => calendarLeavesForDate([request], date, '2026-10-10')[0].status);
  assert.deepEqual(labels, ['passed', 'pending', 'pending', 'pending']);
  assert.equal(calendarLeavesForDate([request], '2026-10-09', '2026-10-10').length, 0);
  assert.equal(request.status, 'pending'); // The remaining dates still need review.
});
test('approved past dates remain approved and use only the approved selection', () => {
  const request = { status: 'approved', startDate: '2026-10-06', endDate: '2026-10-08', requestedDates: ['2026-10-06', '2026-10-08'], approvedDates: ['2026-10-06'] };
  assert.equal(calendarLeavesForDate([request], '2026-10-06', '2026-10-10')[0].status, 'approved');
  assert.equal(calendarLeavesForDate([request], '2026-10-08', '2026-10-10').length, 0);
});
test('legacy date ranges pass per day; rejected and cancelled requests are not shown as pending', () => {
  const request = { status: 'pending', startDate: '2026-10-08', endDate: '2026-10-12' };
  assert.equal(calendarLeavesForDate([request], '2026-10-08', '2026-10-10')[0].status, 'passed');
  assert.equal(calendarLeavesForDate([request], '2026-10-12', '2026-10-10')[0].status, 'pending');
  assert.equal(calendarLeavesForDate([{ ...request, status: 'rejected' }, { ...request, status: 'cancelled' }], '2026-10-08', '2026-10-10').length, 0);
});

test('list counts and filters distinguish mixed requests from fully expired requests', () => {
  const mixed = { status: 'pending', startDate: '2026-10-08', endDate: '2026-10-14', requestedDates: ['2026-10-08', '2026-10-10', '2026-10-12', '2026-10-14'] };
  assert.deepEqual(leaveDateProgress(mixed, '2026-10-10'), { status: 'pending', pendingDates: ['2026-10-10', '2026-10-12', '2026-10-14'], passedDates: ['2026-10-08'] });
  assert.deepEqual(leaveDateProgress(mixed, '2026-10-15'), { status: 'passed', pendingDates: [], passedDates: mixed.requestedDates });
  const legacy = { status: 'pending', startDate: '2026-10-08', endDate: '2026-10-09' };
  assert.equal(leaveDateProgress(legacy, '2026-10-10').status, 'passed');
  const approved = { ...mixed, status: 'approved' };
  assert.deepEqual(leaveDateProgress(approved, '2026-10-15'), { status: 'approved', pendingDates: [], passedDates: [] });
});
