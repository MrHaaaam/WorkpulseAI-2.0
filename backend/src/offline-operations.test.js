import test from 'node:test';
import assert from 'node:assert/strict';
import { syncOfflineOperation } from './offline-operations.js';
import { attendanceVersion } from './attendance-corrections.js';

const now = new Date('2026-10-11T10:00:00Z');
const employeeActor = { _id: 'account-e1', employeeId: 'E1', role: 'regular', email: 'employee@test.invalid' };
const adminActor = { _id: 'account-admin', role: 'admin', email: 'admin@test.invalid' };
const leave = { id: 'offline-leave-000001', kind: 'leave', payload: { leaveType: 'Personal Leave', requestedDates: ['2026-10-12'], reason: 'Family appointment' } };
const cash = { id: 'offline-cash-0000001', kind: 'cash-advance', payload: { amount: 19.99, repaymentAgreed: true, reason: 'Transport', requestPeriod: '2026-10-01' } };
const attendance = { id: 'offline-time-0000001', kind: 'attendance', payload: { employeeId: 'E1', date: '2026-10-10', sessionNumber: 1, checkIn: '09:00', checkOut: '17:00', reason: 'Internet outage, supervisor verified attendance.', version: attendanceVersion(null), captureOnly: true } };
const options = { now, getSettings: async () => ({ payroll: { cashAdvanceMax: 1000 } }), scheduledWorkStatus: () => true,
  payrollPeriodKey: () => '2026-10-01', getSessionDefaults: async () => ({ hourlyRate: 100 }), refreshPayroll: async () => {} };
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(filter => matches(row, filter));
    if (value && typeof value === 'object') {
      if ('$ne' in value) return row[key] !== value.$ne;
      if ('$exists' in value) return (row[key] !== undefined) === value.$exists;
      if ('$in' in value) return value.$in.includes(row[key]);
    }
    return JSON.stringify(row[key]) === JSON.stringify(value);
  });
}
function database({ failReceipt = false, failNotification = false } = {}) {
  let data = { employees: [{ _id: 'employee-e1', id: 'E1', name: 'Alex', role: 'regular', status: 'active' }], attendance: [], payroll_requests: [], leave_requests: [], cash_advance_requests: [], cash_advances: [], employee_notifications: [], offline_operations: [], idle_days: [] };
  return { get data() { return data; }, client: { startSession: () => ({ endSession: async () => {}, withTransaction: async callback => {
    const before = structuredClone(data); try { return await callback(); } catch (error) { data = before; throw error; }
  } }) }, collection(name) { return {
    findOne: async filter => data[name].find(row => matches(row, filter)) || null,
    find: filter => ({ toArray: async () => data[name].filter(row => matches(row, filter)) }),
    insertOne: async row => { if (name === 'offline_operations' && failReceipt || name === 'employee_notifications' && failNotification) throw new Error('Database write unavailable'); if (row._id && data[name].some(existing => existing._id === row._id)) throw Object.assign(new Error('duplicate key'), { code: 11000 }); data[name].push({ _id: `${name}-${data[name].length}`, ...row }); },
    updateOne: async (filter, update) => { const row = data[name].find(row => matches(row, filter)); if (!row) return { matchedCount: 0 };
      Object.assign(row, update.$set || {}); for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
      for (const key of Object.keys(update.$unset || {})) delete row[key]; for (const [key, value] of Object.entries(update.$push || {})) (row[key] ??= []).push(value); return { matchedCount: 1 }; },
  }; } };
}
const sync = (db, operation, actor = employeeActor, changes = {}) => syncOfflineOperation(db, { ...options, actor, operation, ...changes });

test('leave and cash requests sync exactly once after a lost response, without creating debt', async () => {
  for (const operation of [leave, cash]) {
    const db = database(); const first = await sync(db, operation); const before = structuredClone(db.data);
    assert.deepEqual(await sync(db, operation), first); assert.deepEqual(db.data, before);
    assert.equal(db.data.offline_operations.length, 1); assert.equal(db.data.cash_advances.length, 0);
    assert.equal(first.employeeId, 'E1'); assert.equal(first.status, 'pending');
  }
});
test('attendance and notification sync atomically and a retry does not recalculate or notify twice', async () => {
  const db = database(); let recalculated = 0;
  const extra = { refreshPayroll: async () => { recalculated++; } };
  const first = await sync(db, attendance, adminActor, extra);
  assert.deepEqual(await sync(db, attendance, adminActor, extra), first);
  assert.equal(recalculated, 1); assert.equal(db.data.attendance.length, 1); assert.equal(db.data.employee_notifications.length, 1);
  assert.equal(db.data.attendance[0].sessions[0].captureMethod, 'admin-manual');
});
test('offline attendance cannot overwrite scans, paid payroll, approved leave or future times', async () => {
  for (const condition of ['scan', 'paid', 'leave', 'future']) {
    const db = database(); let operation = attendance;
    if (condition === 'scan') db.data.attendance.push({ _id: 'a1', employeeId: 'E1', date: attendance.payload.date, sessions: [{ checkIn: '10:00 AM', checkOut: '05:00 PM' }] });
    if (condition === 'paid') db.data.payroll_requests.push({ _id: 'p1', employeeId: 'E1', periodStart: '2026-10-01', status: 'paid' });
    if (condition === 'leave') db.data.leave_requests.push({ employeeId: 'E1', status: 'approved', approvedDates: [attendance.payload.date] });
    if (condition === 'future') operation = { ...attendance, payload: { ...attendance.payload, date: '2026-10-11', checkOut: '23:00' } };
    const before = structuredClone(db.data); await assert.rejects(sync(db, operation, adminActor)); assert.deepEqual(db.data, before);
  }
});
test('offline capture can fill an automatically absent day but cannot silently replace recorded times', async () => {
  const db = database(); db.data.attendance.push({ _id: 'absent', employeeId: 'E1', date: attendance.payload.date, status: 'Absent', sessions: [], automaticAbsence: true });
  await sync(db, attendance, adminActor); assert.equal(db.data.attendance[0].status, 'Present'); assert.equal(db.data.attendance[0].automaticAbsence, undefined);
});
test('expired or conflicting employee requests fail without partial changes', async () => {
  for (const payload of [{ ...leave.payload, requestedDates: ['2026-10-10'] }, { ...leave.payload, requestedDates: ['2026-02-30'] }, { ...leave.payload, reason: 'x' }]) {
    const db = database(); const before = structuredClone(db.data); await assert.rejects(sync(db, { ...leave, payload })); assert.deepEqual(db.data, before);
  }
  const db = database(); db.data.leave_requests.push({ employeeId: 'E1', status: 'approved', startDate: '2026-10-12', endDate: '2026-10-13' });
  await assert.rejects(sync(db, leave), /overlap/);
  await assert.rejects(sync(database(), leave, employeeActor, { scheduledWorkStatus: () => false }), /non-working/);
});

test('deliberately backdated online leave remains supported, while dates passed in the queue require review', async () => {
  const db = database();
  const backdated = { ...leave, payload: { ...leave.payload, requestedDates: ['2026-10-09'], capturedOn: '2026-10-11' } };
  assert.equal((await sync(db, backdated)).status, 'pending');
  await assert.rejects(sync(database(), { ...leave, payload: { ...leave.payload, requestedDates: ['2026-10-10'], capturedOn: '2026-10-10' } }), /has passed/);
});
test('cash limit, agreement, expired period, open request and existing disbursement are revalidated', async () => {
  for (const payload of [{ ...cash.payload, amount: 1001 }, { ...cash.payload, amount: 0 }, { ...cash.payload, amount: 1.001 }, { ...cash.payload, repaymentAgreed: false }, { ...cash.payload, requestPeriod: '2026-09-16' }]) await assert.rejects(sync(database(), { ...cash, payload }));
  const open = database(); open.data.cash_advance_requests.push({ employeeId: 'E1', open: true }); await assert.rejects(sync(open, cash), /open/);
  const paid = database(); paid.data.cash_advances.push({ employeeId: 'E1', issuePeriod: '2026-10-01' }); await assert.rejects(sync(paid, cash), /already given/);
});
test('receipt, payroll and notification failures roll back every business mutation', async () => {
  for (const [db, operation, actor, extra] of [[database({ failReceipt: true }), leave, employeeActor], [database({ failReceipt: true }), cash, employeeActor], [database({ failReceipt: true }), attendance, adminActor], [database({ failNotification: true }), attendance, adminActor], [database(), attendance, adminActor, { refreshPayroll: async () => { throw new Error('Payroll unavailable'); } }]]) {
    const before = structuredClone(db.data); await assert.rejects(sync(db, operation, actor, extra)); assert.deepEqual(db.data, before);
  }
});
test('roles, identity ownership and operation payload reuse cannot bypass validation', async () => {
  await assert.rejects(sync(database(), attendance), /Administrator/);
  await assert.rejects(sync(database(), leave, adminActor), /unavailable/);
  await assert.rejects(sync(database(), { ...leave, id: 'bad' }), /operation ID/);
  const db = database(); await sync(db, leave);
  await assert.rejects(sync(db, { ...leave, payload: { ...leave.payload, reason: 'Different request' } }), /different action or payload/);
  const banned = database(); banned.data.employees[0].banned = true; await assert.rejects(sync(banned, cash), /Active employee/);
  const missing = database(); await assert.rejects(sync(missing, cash, { ...employeeActor, employeeId: 'E2' }), /Active employee/);
});
