import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceRiskForEmployee, buildAIInsights } from './ai-insights.js';

test('Insights risk rows preserve per-employee absence and approved-leave rules', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const employees = [
    { id: 'one', name: 'One', status: 'active' },
    { id: 'two', name: 'Two', status: 'active' },
  ];
  const attendance = [
    { employeeId: 'one', date: '2026-10-01', status: 'Absent' },
    { employeeId: 'one', date: '2026-09-30', status: 'Absent' },
    { employeeId: 'one', date: '2026-08-01', status: 'Absent' },
    { employeeId: 'two', date: '2026-10-01', status: 'Absent' },
  ];
  const leaveRequests = [{ employeeId: 'one', status: 'approved', approvedDates: ['2026-09-30'] }];
  const rows = buildAIInsights({ attendance, employees, leaveRequests, now }).risk.employees;

  for (const employee of employees) {
    const expected = attendanceRiskForEmployee(attendance, employee.id, leaveRequests, '2026-10-02');
    const actual = rows.find((row) => row.employeeId === employee.id);
    assert.deepEqual(actual.absenceDates, expected.absenceDates);
    assert.equal(actual.absenceDays, expected.absenceDays);
    assert.equal(actual.tier, expected.tier);
  }
});

test('forecast shows matching past dates and leaves closed days out of its average', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const attendance = [
    { employeeId: 'one', date: '2026-09-18', status: 'Present', checkIn: '08:00' },
    { employeeId: 'one', date: '2026-09-25', status: 'Present', checkIn: '08:00' },
    { employeeId: 'one', date: '2026-10-02', status: 'Present', checkIn: '08:00' },
  ];
  const forecast = buildAIInsights({
    now, attendance, employees: [{ id: 'one', name: 'One', status: 'active' }],
    schedule: { workWeekdays: [1, 2, 3, 4, 5], idleDates: ['2026-09-25'] },
  }).forecast.forecast;
  const nextFriday = forecast.find((day) => day.date === '2026-10-09');
  assert.equal(forecast[0].working, false);
  assert.equal(forecast[0].expectedPresent, 0);
  assert.equal(nextFriday.weekdaySamples, 2);
  assert.deepEqual(nextFriday.pastDates.map((day) => [day.date, day.used]), [
    ['2026-10-02', true], ['2026-09-25', false], ['2026-09-18', true],
  ]);
});
