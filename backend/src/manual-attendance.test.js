import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedLeaveCoversDate, manualAttendanceProblem } from './manual-attendance.js';

const base = { workday: true, approvedLeave: false, sessions: [] };

test('allows the first manual clock-in and blocks a duplicate', () => {
  assert.equal(manualAttendanceProblem({ ...base, action: 'time-in' }), null);
  assert.match(manualAttendanceProblem({ ...base, action: 'time-in', sessions: [{ checkIn: '09:00 AM', checkOut: null }] }), /already clocked in/);
});

test('only clocks out an open session, including on a non-working day', () => {
  assert.match(manualAttendanceProblem({ ...base, action: 'time-out' }), /not clocked in/);
  assert.equal(manualAttendanceProblem({ ...base, action: 'time-out', workday: false, sessions: [{ checkIn: '09:00 AM', checkOut: null }] }), null);
});

test('blocks time-in on leave, non-working days, and after three sessions', () => {
  assert.match(manualAttendanceProblem({ ...base, action: 'time-in', approvedLeave: true }), /approved leave/);
  assert.match(manualAttendanceProblem({ ...base, action: 'time-in', workday: false }), /holiday or rest day/);
  assert.match(manualAttendanceProblem({ ...base, action: 'time-in', sessions: Array.from({ length: 3 }, () => ({ checkIn: '09:00 AM', checkOut: '10:00 AM' })) }), /three attendance sessions/);
});

test('recognizes approved leave with dates or a legacy date range', () => {
  assert.equal(approvedLeaveCoversDate({ status: 'approved', approvedDates: ['2026-09-29'] }, '2026-09-29'), true);
  assert.equal(approvedLeaveCoversDate({ status: 'approved', approvedDates: [], startDate: '2026-09-28', endDate: '2026-09-30' }, '2026-09-29'), true);
  assert.equal(approvedLeaveCoversDate({ status: 'approved', approvedDates: ['2026-09-30'], startDate: '2026-09-28', endDate: '2026-09-30' }, '2026-09-29'), false);
});
