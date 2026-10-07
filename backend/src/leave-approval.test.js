import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLeaveRequest, hasRecordedWork, leaveApprovalPreview, payrollCoversDate } from './leave-approval.js';

const today = '2026-10-07';
const request = { _id: 'leave-1', id: 'LR-1', employeeId: 'EMP-1', employeeName: 'Test Employee', role: 'Regular', status: 'pending', requestedDates: ['2026-10-05', today, '2026-10-09'], totalDays: 3 };
const options = { id: request.id, employeeIds: [request.employeeId], status: 'approved', actor: 'admin@example.com', today, isWorkday: () => true };

function matches(record, filter) {
  return Object.entries(filter).every(([key, value]) => value && typeof value === 'object' && '$in' in value ? value.$in.includes(record[key]) : record[key] === value);
}

function database({ attendance = [], payroll = [], leaves = [request], failAttendanceWrite = 0, failRequestSave = false } = {}) {
  let data = structuredClone({ attendance, payroll_requests: payroll, leave_requests: leaves });
  let attendanceWrites = 0;
  const write = (name) => {
    if (name === 'attendance' && ++attendanceWrites === failAttendanceWrite) throw new Error('Simulated storage failure');
  };
  const update = (record, mutation) => {
    Object.assign(record, mutation.$set ?? {});
    Object.keys(mutation.$unset ?? {}).forEach(key => delete record[key]);
    Object.entries(mutation.$inc ?? {}).forEach(([key, value]) => { record[key] = (record[key] ?? 0) + value; });
    Object.entries(mutation.$push ?? {}).forEach(([key, value]) => { (record[key] ??= []).push(value); });
  };
  const db = {
    client: { startSession: () => ({
      withTransaction: async work => {
        const before = structuredClone(data);
        try { return await work(); } catch (error) { data = before; throw error; }
      },
      endSession: async () => {},
    }) },
    collection(name) {
      return {
        find: filter => ({ toArray: async () => data[name].filter(record => matches(record, filter)) }),
        findOne: async filter => data[name].find(record => matches(record, filter)) ?? null,
        insertOne: async record => { write(name); data[name].push({ _id: `${name}-${data[name].length}`, ...record }); },
        updateOne: async (filter, mutation) => {
          write(name);
          const record = data[name].find(record => matches(record, filter));
          if (!record) return { matchedCount: 0 };
          update(record, mutation);
          return { matchedCount: 1 };
        },
        findOneAndUpdate: async (filter, mutation) => {
          if (failRequestSave) return null;
          const record = data[name].find(record => matches(record, filter));
          if (!record) return null;
          update(record, mutation);
          return record;
        },
      };
    },
    get data() { return data; },
  };
  return db;
}

test('normal approval excludes past dates and records original attendance statuses', async () => {
  const db = database({ attendance: [{ _id: 'a1', employeeId: 'EMP-1', date: today, status: 'Absent', automaticAbsence: true }] });
  const result = await decideLeaveRequest(db, options);
  assert.deepEqual(result.request.approvedDates, [today, '2026-10-09']);
  assert.equal(db.data.attendance.length, 2);
  assert.equal(db.data.attendance[0].status, 'On Leave');
  assert.equal(db.data.attendance[0].automaticAbsence, undefined);
  assert.deepEqual(result.decision.attendanceChanges.map(item => item.before), ['Absent', 'No record']);
  assert.equal(result.request.approvalHistory[0].reviewedBy, 'admin@example.com');
});

test('past dates require both explicit confirmation and a meaningful reason', async () => {
  for (const correction of [{}, { correctionReason: 'Reviewed late' }, { confirmPastCorrection: true, correctionReason: 'no' }]) {
    const db = database();
    await assert.rejects(decideLeaveRequest(db, { ...options, approvedDates: ['2026-10-05'], ...correction }), /reason.*confirmation/);
    assert.equal(db.data.leave_requests[0].status, 'pending');
    assert.equal(db.data.attendance.length, 0);
  }
});

test('a passed request can be corrected with reason and confirmation', async () => {
  const db = database({ leaves: [{ ...request, status: 'passed', requestedDates: ['2026-10-05'] }], attendance: [{ _id: 'a1', employeeId: 'EMP-1', date: '2026-10-05', status: 'Absent' }] });
  const result = await decideLeaveRequest(db, { ...options, approvedDates: ['2026-10-05'], correctionReason: 'Employee submitted sick leave on time; reviewed late.', confirmPastCorrection: true });
  assert.equal(result.request.status, 'approved');
  assert.equal(db.data.attendance[0].status, 'On Leave');
  assert.equal(result.decision.pastDates[0], '2026-10-05');
  assert.match(result.decision.correctionReason, /reviewed late/);
});

test('time-in, session-only time-in, and time-out block approval without changes', async () => {
  for (const work of [{ checkIn: '9:00 AM' }, { sessions: [{ checkIn: '9:00 AM', checkOut: '5:00 PM' }] }, { checkOut: '5:00 PM' }]) {
    assert.equal(hasRecordedWork(work), true);
    const db = database({ attendance: [{ _id: 'a1', employeeId: 'EMP-1', date: today, status: 'Present', ...work }] });
    const before = structuredClone(db.data);
    await assert.rejects(decideLeaveRequest(db, { ...options, approvedDates: [today] }), /recorded/);
    assert.deepEqual(db.data, before);
  }
});

test('paid, legacy-approved, and settled payroll block leave adjustments', async () => {
  for (const payment of [{ status: 'paid' }, { status: 'approved' }, { status: 'carried_over', settledBy: 'PAID-2' }]) {
    const db = database({ payroll: [{ _id: 'p1', employeeId: 'EMP-1', periodStart: '2026-10-01', ...payment }] });
    await assert.rejects(decideLeaveRequest(db, { ...options, approvedDates: [today] }), /Payroll already paid/);
    assert.equal(db.data.attendance.length, 0);
    assert.equal(db.data.leave_requests[0].status, 'pending');
  }
  assert.equal(payrollCoversDate({ periodStart: '2026-10-16' }, '2026-10-31'), true);
  assert.equal(payrollCoversDate({ periodStart: '2026-10-01' }, '2026-10-16'), false);
});

test('covering unpaid payroll is guarded against a concurrent payment', async () => {
  const db = database({ payroll: [{ _id: 'p1', employeeId: 'EMP-1', periodStart: '2026-10-01', status: 'processing' }] });
  await decideLeaveRequest(db, { ...options, approvedDates: [today] });
  assert.equal(db.data.payroll_requests[0].leaveReviewVersion, 1);
  assert.equal(db.data.payroll_requests[0].status, 'processing');
});

test('bulk approval refuses mixed past dates and applies the same work conflict check', async () => {
  const db = database();
  await assert.rejects(decideLeaveRequest(db, { ...options, bulk: true }), /Review this request individually/);
  const withWork = database({ leaves: [{ ...request, requestedDates: [today] }], attendance: [{ _id: 'a1', employeeId: 'EMP-1', date: today, checkIn: '9:00 AM' }] });
  await assert.rejects(decideLeaveRequest(withWork, { ...options, bulk: true }), /recorded/);
  const future = database({ leaves: [{ ...request, requestedDates: [today] }] });
  assert.equal((await decideLeaveRequest(future, { ...options, bulk: true })).request.status, 'approved');
});

test('attendance failures and stale request writes roll back every approval change', async () => {
  for (const failure of [{ failAttendanceWrite: 2 }, { failRequestSave: true }]) {
    const db = database({ ...failure, payroll: [{ _id: 'p1', employeeId: 'EMP-1', periodStart: '2026-10-01', status: 'processing' }] });
    const before = structuredClone(db.data);
    await assert.rejects(decideLeaveRequest(db, options));
    assert.deepEqual(db.data, before);
  }
});

test('preview labels every date and blocks rest days, work, paid periods, and overlapping leave', async () => {
  const db = database({
    attendance: [{ _id: 'a1', employeeId: 'EMP-1', date: today, status: 'Present', sessions: [{ checkIn: '9:00 AM' }] }],
    leaves: [request, { id: 'LR-2', employeeId: 'EMP-1', status: 'approved', approvedDates: ['2026-10-09'] }],
  });
  const preview = await leaveApprovalPreview(db, request, { today, isWorkday: date => date !== '2026-10-05' });
  assert.equal(preview.dates[0].past, true);
  assert.match(preview.dates[0].blockedReason, /rest day/);
  assert.match(preview.dates[1].blockedReason, /recorded/);
  assert.match(preview.dates[2].blockedReason, /approved leave/);
});

test('declining a pending request never rewrites attendance or payroll', async () => {
  const db = database({ attendance: [{ _id: 'a1', employeeId: 'EMP-1', date: today, status: 'Present', checkIn: '9:00 AM' }] });
  const beforeAttendance = structuredClone(db.data.attendance);
  const result = await decideLeaveRequest(db, { ...options, status: 'rejected' });
  assert.equal(result.request.status, 'rejected');
  assert.deepEqual(db.data.attendance, beforeAttendance);
  assert.deepEqual(result.decision.attendanceChanges, []);
});
