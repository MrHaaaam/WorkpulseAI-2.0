import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePayrollRecord, snapshotAttendanceRates, attendancePayForRecord } from './routes/api.js';

const employee = { id: 'EMP-018', name: 'Test Employee', role: 'regular' };
const periodStart = '2026-09-16';
const conflict = () => Object.assign(new Error('duplicate payroll'), { code: 11000, keyPattern: { employeeId: 1, periodStart: 1 } });

function database({ error, winner, attendance = [] } = {}) {
  const writes = [];
  let inserted = false;
  const payroll = {
    find: (query) => ({ toArray: async () => typeof query.periodStart === 'string' ? [] : [{ _id: 'old', amount: 100 }] }),
    findOne: async () => inserted ? winner : null,
    insertOne: async (record) => { inserted = true; writes.push(record); if (error) throw error; },
    updateMany: async (filter, update) => { writes.push({ filter, update }); },
  };
  return { writes, collection: (name) => name === 'payroll_requests' ? payroll : { find: () => ({ toArray: async () => name === 'attendance' ? attendance : [] }) } };
}

test('a concurrent insert returns the winning payroll without relinking carry-over', async () => {
  const winner = { id: 'PR-winner', employeeId: employee.id, periodStart, status: 'processing', amount: 100 };
  const db = database({ error: conflict(), winner });
  const result = await preparePayrollRecord(db, employee, periodStart, {});
  assert.equal(result.created, false);
  assert.deepEqual(result.record, winner);
  assert.equal(db.writes.length, 1);
});

test('the creator links outstanding balances to its new payroll once', async () => {
  const db = database();
  const result = await preparePayrollRecord(db, employee, periodStart, {});
  assert.equal(result.created, true);
  assert.equal(result.record.carryOverAmount, 100);
  assert.equal(db.writes.length, 2);
  assert.equal(db.writes[1].update.$set.rolledInto, result.record.id);
});

test('employee hourly rate stays above changing company defaults', async () => {
  const customEmployee = { ...employee, hourlyRateOverride: 75.5 };
  for (const defaultRate of [50, 100]) {
    const result = await preparePayrollRecord(database(), customEmployee, periodStart, { payroll: { hourlyRates: { regular: defaultRate } } });
    assert.equal(result.record.hourlyRate, 75.5);
  }
  const result = await preparePayrollRecord(database(), employee, periodStart, { payroll: { hourlyRates: { regular: 100 } } });
  assert.equal(result.record.hourlyRate, 100);
});

test('manager and supervisor payroll use their own company rates', async () => {
  const settings = { payroll: { hourlyRates: { regular: 50, extra: 40, manager: 90, supervisor: 70 } } };
  for (const [role, rate] of [['manager', 90], ['supervisor', 70]]) {
    const result = await preparePayrollRecord(database(), { ...employee, role }, periodStart, settings);
    assert.equal(result.record.hourlyRate, rate);
  }
});

test('completed sessions keep their recorded hourly rates after the default changes', async () => {
  const attendance = [{ employeeId: employee.id, date: '2026-09-16', sessions: [
    { checkIn: '09:00 AM', checkOut: '11:00 AM', hourlyRate: 60 },
    { checkIn: '01:00 PM', checkOut: '03:00 PM', hourlyRate: 70 },
  ] }];
  for (const defaultRate of [60, 90]) {
    const result = await preparePayrollRecord(database({ attendance }), employee, periodStart, { payroll: { hourlyRates: { regular: defaultRate } } });
    assert.equal(result.record.hoursWorked, 4);
    assert.equal(result.record.grossAmount, 260);
    assert.deepEqual(result.record.rateBreakdown.map(line => line.rate), [60, 70]);
  }
});

test('payroll separates overtime at the same rate and stops paying at the overtime limit', async () => {
  const attendance = [{ employeeId: employee.id, date: '2026-09-16', sessions: [{
    checkIn: '05:00 PM', checkOut: '10:00 PM', hourlyRate: 60,
    workStartTime: '06:00', workStopTime: '18:00', overtimeStopTime: '21:00',
  }] }];
  const result = await preparePayrollRecord(database({ attendance }), employee, periodStart, { payroll: { hourlyRates: { regular: 90 } } });
  assert.equal(result.record.regularHours, 1);
  assert.equal(result.record.overtimeHours, 3);
  assert.equal(result.record.hoursWorked, 4);
  assert.equal(result.record.grossAmount, 240);
});

test('an overnight shift splits hours after midnight correctly', () => {
  const record = { date: '2026-09-17', sessions: [{
    checkIn: '01:00 AM', checkOut: '05:00 AM', hourlyRate: 60,
    workStartTime: '22:00', workStopTime: '02:00', overtimeStopTime: '06:00',
  }] };
  const pay = attendancePayForRecord(record, 90);
  assert.equal(pay.regularHours, 1);
  assert.equal(pay.overtimeHours, 3);
  assert.equal(pay.amount, 240);
});

test('a rate change snapshots older attendance before it can be recalculated', async () => {
  const record = { _id: 'A1', employeeId: employee.id, date: '2026-09-16', checkIn: '09:00 AM', checkOut: '11:00 AM', sessions: [{ checkIn: '09:00 AM', checkOut: '11:00 AM' }] };
  const db = { collection: () => ({ find: () => ({ toArray: async () => [record] }), updateOne: async (_filter, update) => { record.sessions = update.$set.sessions; return { modifiedCount: 1 }; } }) };
  await snapshotAttendanceRates(db, [employee], { payroll: { hourlyRates: { regular: 60 } } });
  assert.equal(record.sessions[0].hourlyRate, 60);
  assert.equal(attendancePayForRecord(record, 90).amount, 120);
});

test('unrelated duplicate keys and database failures are not hidden', async () => {
  for (const error of [Object.assign(new Error('duplicate id'), { code: 11000, keyPattern: { id: 1 } }), new Error('database unavailable')]) {
    await assert.rejects(preparePayrollRecord(database({ error }), employee, periodStart, {}), (caught) => caught === error);
  }
});

test('a conflict without a surviving payroll still reports the failure', async () => {
  const error = conflict();
  await assert.rejects(preparePayrollRecord(database({ error }), employee, periodStart, {}), (caught) => caught === error);
});
