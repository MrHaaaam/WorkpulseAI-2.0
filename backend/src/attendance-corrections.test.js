import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceCorrectionBlockReason, attendanceVersion, correctAttendance, correctedSessions } from './attendance-corrections.js';
import { enforceAutomaticClockOut } from './routes/api.js';

const now = new Date('2026-10-10T10:00:00Z');
const defaults = { hourlyRate: 100, workStartTime: '09:00', workStopTime: '17:00', overtimeStopTime: '22:00' };
const options = { employeeId: 'E1', date: '2026-10-09', sessionNumber: 1, checkIn: '09:00', checkOut: '17:00', reason: 'Arrival verified by supervisor.', version: attendanceVersion(null), actor: 'admin@example.test', now, getSessionDefaults: async () => defaults, refreshPayroll: async () => {} };
test('preview blocks approved leave, leave records, unavailable employees and settled payroll', () => {
  const base = { employee: { status: 'active' }, date: options.date, now };
  assert.equal(attendanceCorrectionBlockReason(base), null);
  assert.match(attendanceCorrectionBlockReason({ ...base, leaves: [{ status: 'approved', approvedDates: [options.date] }] }), /approved leave/);
  assert.match(attendanceCorrectionBlockReason({ ...base, attendance: { status: 'On Leave' } }), /approved leave/);
  assert.match(attendanceCorrectionBlockReason({ ...base, employee: { banned: true } }), /unavailable/);
  assert.match(attendanceCorrectionBlockReason({ ...base, payroll: [{ periodStart: '2026-10-01', status: 'paid' }] }), /Payroll/);
  assert.equal(attendanceCorrectionBlockReason({ ...base, leaves: [{ status: 'pending', startDate: options.date, endDate: options.date }, { status: 'approved', approvedDates: ['2026-10-08'] }] }), null);
});
test('admin name is retained in history, session and employee notification', async () => {
  const db = database();
  await correctAttendance(db, { ...options, actorName: 'Maria Santos' });
  assert.equal(db.data.attendance[0].correctionHistory[0].correctedByName, 'Maria Santos');
  assert.equal(db.data.attendance[0].correctionHistory[0].correctedBy, options.actor);
  assert.equal(db.data.attendance[0].sessions[0].manualRecordedByName, 'Maria Santos');
  assert.match(db.data.employee_notifications[0].title, /Maria Santos/);
});
function matches(record, filter) {
  return Object.entries(filter).every(([key, value]) => value && typeof value === 'object' && '$exists' in value ? (record[key] !== undefined) === value.$exists : value && typeof value === 'object' && '$in' in value ? value.$in.includes(record[key]) : JSON.stringify(record[key]) === JSON.stringify(value));
}
function database({ attendance = [], payroll = [], leave = [], failNotification = false, conflict = false, payrollConflict = false } = {}) {
  let data = structuredClone({ attendance, payroll_requests: payroll, leave_requests: leave, idle_days: [], offline_operations: [], employees: [{ id: 'E1', name: 'Alex', role: 'regular', status: 'active' }], employee_notifications: [] });
  function update(record, mutation) {
    Object.assign(record, mutation.$set ?? {});
    for (const key of Object.keys(mutation.$unset ?? {})) delete record[key];
    for (const [key, value] of Object.entries(mutation.$inc ?? {})) record[key] = (record[key] || 0) + value;
    for (const [key, value] of Object.entries(mutation.$push ?? {})) (record[key] ??= []).push(value);
  }
  return { get data() { return data; }, client: { startSession: () => ({ endSession: async () => {}, withTransaction: async work => { const before = structuredClone(data); try { return await work(); } catch (error) { data = before; throw error; } } }) }, collection(name) { return {
    find: filter => ({ toArray: async () => data[name].filter(item => matches(item, filter)) }),
    findOne: async filter => data[name].find(item => matches(item, filter)) ?? null,
    insertOne: async record => { if (name === 'employee_notifications' && failNotification) throw new Error('Notification unavailable'); data[name].push({ _id: `${name}-${data[name].length}`, ...record }); },
    updateOne: async (filter, mutation) => { const record = data[name].find(item => matches(item, filter)); if (!record || (name === 'attendance' && conflict) || (name === 'payroll_requests' && payrollConflict)) return { matchedCount: 0 }; update(record, mutation); return { matchedCount: 1 }; },
  }; } };
}
test('admin can add a missed scan directly and employee receives before/after notification', async () => {
  const db = database(); let refreshed = false;
  await correctAttendance(db, { ...options, refreshPayroll: async tx => { assert.ok(tx.inPayrollTransaction); refreshed = true; } });
  assert.ok(refreshed); assert.equal(db.data.attendance[0].sessions[0].checkIn, '09:00 AM');
  assert.equal(db.data.attendance[0].sessions[0].checkInAt.toISOString(), '2026-10-09T01:00:00.000Z');
  assert.equal(db.data.attendance[0].correctionHistory[0].correctedBy, options.actor);
  const event = db.data.employee_notifications[0];
  assert.equal(event.employeeId, 'E1'); assert.equal(event.read, false); assert.equal(event.date, options.date);
  assert.match(event.description, /No time-in.*09:00 AM/); assert.match(event.description, /Arrival verified/);
});
test('correction preserves other sessions, the original rates and history', async () => {
  const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [{ checkIn: '08:00 AM', checkOut: '12:00 PM', hourlyRate: 70 }, { checkIn: '01:00 PM', checkOut: '05:00 PM', hourlyRate: 80 }] };
  const db = database({ attendance: [original] });
  await correctAttendance(db, { ...options, checkOut: '12:00', version: attendanceVersion(original) });
  assert.equal(db.data.attendance[0].sessions[0].hourlyRate, 70);
  assert.deepEqual(db.data.attendance[0].sessions[1], original.sessions[1]);
  assert.deepEqual(db.data.attendance[0].correctionHistory[0].before, original.sessions);
});

test('clearing both times removes an accidental session and recalculates payroll with history', async () => {
  for (const index of [0, 1]) {
    const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [
      { checkIn: '08:00 AM', checkOut: '12:00 PM', hourlyRate: 70 },
      { checkIn: '01:00 PM', checkOut: '05:00 PM', hourlyRate: 80 },
    ] };
    const db = database({ attendance: [original] }); let refreshed = false;
    await correctAttendance(db, { ...options, sessionNumber: index + 1, checkIn: '', checkOut: '', version: attendanceVersion(original), refreshPayroll: async () => { refreshed = true; } });
    assert.ok(refreshed);
    assert.deepEqual(db.data.attendance[0].sessions, [original.sessions[1 - index]]);
    assert.deepEqual(db.data.attendance[0].correctionHistory[0].before, original.sessions);
    assert.equal(db.data.employee_notifications.length, 1);
    assert.match(db.data.employee_notifications[0].description, /No time-in.*No time-out/);
  }
});

test('removing the only session clears legacy summary times instead of leaving phantom attendance', async () => {
  const original = { _id: 'a1', employeeId: 'E1', date: options.date, checkIn: '09:00 AM', checkOut: '05:00 PM' };
  const db = database({ attendance: [original] });
  await correctAttendance(db, { ...options, checkIn: '', checkOut: '', version: attendanceVersion(original) });
  const record = db.data.attendance[0];
  assert.deepEqual(record.sessions, []);
  assert.equal(record.checkIn, null); assert.equal(record.checkOut, null);
  assert.equal(record.sessionCount, 0); assert.equal(record.status, 'Absent');
  assert.equal(record.lastAction, null);
});

test('existing last session can reopen, while orphan time-out, empty new sessions and open earlier sessions fail', async () => {
  const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [{ checkIn: '09:00 AM', checkOut: '05:00 PM' }] };
  const db = database({ attendance: [original] });
  await correctAttendance(db, { ...options, checkOut: '', version: attendanceVersion(original) });
  assert.equal(db.data.attendance[0].sessions[0].checkOut, null);
  assert.equal(db.data.attendance[0].sessions[0].checkOutAt, null);
  assert.equal(db.data.attendance[0].sessions[0].suppressAutomaticClockOut, true);
  for (const changes of [{ checkIn: '', checkOut: '17:00' }, { checkIn: '', checkOut: '', sessionNumber: 2 }]) {
    const rejected = database({ attendance: [original] }); const before = structuredClone(rejected.data);
    await assert.rejects(correctAttendance(rejected, { ...options, ...changes, version: attendanceVersion(original) }));
    assert.deepEqual(rejected.data, before);
  }
  const multiple = { ...original, sessions: [...original.sessions, { checkIn: '06:00 PM', checkOut: '07:00 PM' }] };
  await assert.rejects(correctAttendance(database({ attendance: [multiple] }), { ...options, checkOut: '', version: attendanceVersion(multiple) }), /last session/);
});

test('session removal preserves paid-payroll protection and rolls back failed recalculation', async () => {
  const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [{ checkIn: '09:00 AM', checkOut: '05:00 PM' }] };
  const changes = { ...options, checkIn: '', checkOut: '', version: attendanceVersion(original) };
  const paid = database({ attendance: [original], payroll: [{ _id: 'p1', employeeId: 'E1', periodStart: '2026-10-01', status: 'paid' }] });
  await assert.rejects(correctAttendance(paid, changes), /Payroll/);
  const failed = database({ attendance: [original] }); const before = structuredClone(failed.data);
  await assert.rejects(correctAttendance(failed, { ...changes, refreshPayroll: async () => { throw new Error('Unavailable'); } }));
  assert.deepEqual(failed.data, before);
});

test('automatic clock-out does not restore a deliberately cleared time-out', async () => {
  const records = [
    { _id: 'cleared', date: '2020-01-01', sessions: [{ checkIn: '09:00 AM', checkOut: null, suppressAutomaticClockOut: true }] },
    { _id: 'normal', date: '2020-01-01', sessions: [{ checkIn: '09:00 AM', checkOut: null }] },
  ];
  const updates = [];
  const db = { collection: () => ({ find: () => ({ toArray: async () => records }), updateOne: async (filter, update) => updates.push({ filter, update }) }) };
  await enforceAutomaticClockOut(db, { shift: { enabled: true, autoClockOutTime: '22:00' } });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter._id, 'normal');
});

test('historical recorded times can be corrected before account creation, but new attendance cannot', async () => {
  const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [{ checkIn: '08:00 AM', checkOut: '05:00 PM' }] };
  const db = database({ attendance: [original] });
  db.data.employees[0].createdAt = now;
  await correctAttendance(db, { ...options, version: attendanceVersion(original) });
  assert.equal(db.data.attendance[0].sessions[0].checkIn, '09:00 AM');
  assert.equal(db.data.employee_notifications.length, 1);
  for (const attendance of [[], [{ _id: 'absent', employeeId: 'E1', date: options.date, status: 'Absent', sessions: [] }]]) {
    const fresh = database({ attendance });
    fresh.data.employees[0].createdAt = now;
    await assert.rejects(correctAttendance(fresh, { ...options, version: attendanceVersion(attendance[0] ?? null) }), /New attendance cannot precede/);
    assert.equal(fresh.data.employee_notifications.length, 0);
  }
});
test('invalid input, future dates, skipped and overlapping sessions are rejected', async () => {
  for (const change of [{ date: '2026-02-30' }, { date: '2026-10-11' }, { employeeId: '' }, { reason: 'x' }, { sessionNumber: 4 }, { sessionNumber: 2 }, { checkIn: '25:00' }, { checkOut: '' }, { checkOut: '09:00' }, { date: '2026-10-10', checkIn: '19:00' }]) {
    const db = database(); await assert.rejects(correctAttendance(db, { ...options, ...change })); assert.equal(db.data.employee_notifications.length, 0);
  }
  assert.throws(() => correctedSessions({ sessions: [{ checkIn: '09:00 AM', checkOut: '12:00 PM' }, { checkIn: '01:00 PM', checkOut: '05:00 PM' }] }, options, { ...options, checkOut: '14:00', sessionDefaults: defaults }), /overlap/);
});
test('payroll or notification failure rolls back correction and notification together', async () => {
  for (const failNotification of [true, false]) {
    const db = database({ failNotification });
    await assert.rejects(correctAttendance(db, { ...options, refreshPayroll: async () => { if (!failNotification) throw new Error('Payroll unavailable'); } }));
    assert.equal(db.data.attendance.length, 0); assert.equal(db.data.employee_notifications.length, 0);
  }
});
test('paid, carried, reset payroll and approved leave cannot be overwritten', async () => {
  for (const fields of [{ status: 'paid' }, { status: 'approved' }, { status: 'carried_over' }, { calculationResetAt: now }, { paidAt: now }, { settledBy: 'P2' }, { rolledInto: 'P2' }]) {
    const db = database({ payroll: [{ _id: 'p1', employeeId: 'E1', periodStart: '2026-10-01', ...fields }] });
    await assert.rejects(correctAttendance(db, options), /Payroll.*settled/); assert.equal(db.data.employee_notifications.length, 0);
  }
  await assert.rejects(correctAttendance(database({ leave: [{ employeeId: 'E1', status: 'approved', approvedDates: [options.date] }] }), options), /approved leave/);
});

test('paid payroll blocks editing existing historical attendance without any writes or recalculation', async () => {
  const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [{ checkIn: '08:00 AM', checkOut: '05:00 PM' }] };
  for (const date of ['2026-10-01', '2026-10-09', '2026-10-15']) {
    const record = { ...original, date };
    const db = database({ attendance: [record], payroll: [{ _id: 'p1', employeeId: 'E1', periodStart: '2026-10-01', periodEnd: '2026-10-15', status: 'paid', paidAt: now }] });
    db.data.employees[0].createdAt = new Date('2026-10-16T00:00:00Z');
    const before = structuredClone(db.data); let recalculated = false;
    await assert.rejects(correctAttendance(db, { ...options, date, now: new Date('2026-10-20T10:00:00Z'), version: attendanceVersion(record), refreshPayroll: async () => { recalculated = true; } }), /already paid/);
    assert.deepEqual(db.data, before); assert.equal(recalculated, false);
  }
});

test('unrelated paid periods and other employees do not block unpaid attendance', async () => {
  const db = database({ payroll: [{ _id: 'past', employeeId: 'E1', periodStart: '2026-09-16', status: 'paid' }, { _id: 'other', employeeId: 'E2', periodStart: '2026-10-01', status: 'paid' }, { _id: 'current', employeeId: 'E1', periodStart: '2026-10-01', status: 'processing' }] });
  await correctAttendance(db, options);
  assert.equal(db.data.attendance.length, 1); assert.equal(db.data.employee_notifications.length, 1);
});

test('payroll changing during review rejects and rolls back all changes', async () => {
  const db = database({ payroll: [{ _id: 'p1', employeeId: 'E1', periodStart: '2026-10-01', status: 'processing' }], payrollConflict: true });
  const before = structuredClone(db.data);
  await assert.rejects(correctAttendance(db, options), /Payroll changed during review/);
  assert.deepEqual(db.data, before);
});

test('inactive, archived, banned and missing employees cannot be corrected', async () => {
  for (const changes of [{ archived: true }, { banned: true }, { status: 'inactive' }, { id: 'OTHER' }]) {
    const db = database(); Object.assign(db.data.employees[0], changes);
    const before = structuredClone(db.data);
    await assert.rejects(correctAttendance(db, options), /inactive or unavailable/);
    assert.deepEqual(db.data, before);
  }
});

test('failed correction of an existing record restores payroll, original times and history', async () => {
  for (const failure of ['notification', 'payroll']) {
    const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [{ checkIn: '08:00 AM', checkOut: '05:00 PM' }], correctionHistory: [] };
    const db = database({ attendance: [original], payroll: [{ _id: 'p1', employeeId: 'E1', periodStart: '2026-10-01', status: 'processing' }], failNotification: failure === 'notification' });
    const before = structuredClone(db.data);
    await assert.rejects(correctAttendance(db, { ...options, version: attendanceVersion(original), refreshPayroll: async tx => {
      await tx.collection('payroll_requests').updateOne({ _id: 'p1' }, { $set: { total: 999 } });
      if (failure === 'payroll') throw new Error('Payroll unavailable');
    } }));
    assert.deepEqual(db.data, before);
  }
});
test('stale previews and concurrent scans cannot be overwritten', async () => {
  const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [{ checkIn: '10:00 AM', checkOut: '05:00 PM' }] };
  await assert.rejects(correctAttendance(database({ attendance: [original] }), options), /Attendance changed/);
  const db = database({ attendance: [original], conflict: true });
  await assert.rejects(correctAttendance(db, { ...options, version: attendanceVersion(original) }), /changed during/);
  assert.deepEqual(db.data.attendance, [original]); assert.equal(db.data.employee_notifications.length, 0);
});
test('offline capture conflicts explain current sessions and preserve employee scans', async () => {
  for (const checkOut of [null, '05:00 PM']) {
    const original = { _id: 'a1', employeeId: 'E1', date: options.date, sessions: [{ checkIn: '11:13 AM', checkOut }] };
    const db = database({ attendance: [original] });
    const before = structuredClone(db.data);
    await assert.rejects(correctAttendance(db, { ...options, captureOnly: true, operationKey: 'offline-test', operationHash: 'test' }), error => {
      assert.match(error.message, /Attendance sync blocked for E1/);
      assert.match(error.message, /Session 1: 11:13 AM/);
      assert.ok(error.message.includes(checkOut || 'Open (not yet timed out)'));
      assert.match(error.message, /were not overwritten, and no new session was created/);
      assert.match(error.message, /Open Edit Attendance/);
      return true;
    });
    assert.deepEqual(db.data, before);
  }
});

test('overnight shifts use next-day timestamps and cannot overlap adjacent attendance', async () => {
  const db = database();
  await correctAttendance(db, { ...options, checkIn: '22:00', checkOut: '06:00', getSessionDefaults: async () => ({ ...defaults, workStartTime: '22:00', overtimeStopTime: '06:00' }) });
  assert.equal(db.data.attendance[0].sessions[0].checkOutAt.toISOString(), '2026-10-09T22:00:00.000Z');
  const previous = database({ attendance: [{ _id: 'a-prev', employeeId: 'E1', date: '2026-10-08', sessions: [{ checkIn: '10:00 PM', checkOut: '06:00 AM' }] }] });
  await assert.rejects(correctAttendance(previous, { ...options, checkIn: '05:00', checkOut: '12:00', getSessionDefaults: async () => ({ ...defaults, workStartTime: '04:00' }) }), /adjacent date/);
});
