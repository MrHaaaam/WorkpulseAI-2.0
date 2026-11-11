import test from 'node:test';
import assert from 'node:assert/strict';
import { BSON } from 'mongodb';
import { BACKUP_COLLECTIONS, serializeBackup } from './backup-format.js';
import { previewRecovery, applyRecovery } from './backup-recovery.js';

const key = value => BSON.EJSON.stringify(value, { relaxed: false });
function matches(row, filter) {
  if (filter.$or) return filter.$or.some(part => matches(row, part));
  return Object.entries(filter).every(([field, value]) => value === null ? row[field] == null : key(row[field]) === key(value));
}
function database(initial = {}, failAt = '') {
  let data = structuredClone(initial); let writes = 0;
  const sessions = [];
  const db = { databaseName: 'live_test', get data() { return data; }, get writes() { return writes; },
    client: { startSession: () => ({ endSession: async () => {}, withTransaction: async callback => {
      const previous = structuredClone(data);
      try { return await callback(); } catch (error) { data = previous; throw error; }
    } }) },
    collection: name => ({ find: (filter, options) => { sessions.push(options?.session); return { toArray: async () => (data[name] || []).filter(row => matches(row, filter)) }; },
      findOne: async (filter, options) => { sessions.push(options?.session); return (data[name] || []).find(row => matches(row, filter)) || null; },
      insertOne: async (row, options) => { assert.ok(options.session); writes++; if (name === failAt) throw new Error('Write failed'); (data[name] ||= []).push(row); } }),
  };
  return db;
}
function backup(data) {
  return serializeBackup({ format: 'workpulse-json-backup', version: 2, createdAt: new Date('2026-10-12T05:25:37Z'),
    collections: Object.fromEntries(BACKUP_COLLECTIONS.map(name => [name, data[name] || []])) });
}
const employee = { _id: 'employee-1', id: 'E1', name: 'Ava Lim', status: 'active' };
const attendance = { _id: 'attendance-1', employeeId: 'E1', date: '2026-10-12', checkIn: '09:00 AM' };

test('preview selects linked records without writes or other employees/settings', async () => {
  const db = database();
  const source = backup({ employees: [employee, { _id: 'employee-2', id: 'E2' }], attendance: [attendance], settings: [{ _id: 'settings', value: 'old' }] });
  const { plan } = await previewRecovery(db, source, { employeeIds: ['E1'] });
  assert.equal(db.writes, 0); assert.equal(plan.counts.restore, 2);
  assert.deepEqual(plan.problems, []);
  assert.ok(plan.rows.every(row => row.employeeId === 'E1'));
  assert.equal(plan.rows.some(row => row.collection === 'settings'), false);
});

test('apply restores deleted records, preserves newer live data and is safe to preview again', async () => {
  const newer = { ...employee, status: 'inactive', name: 'Updated name' };
  const db = database({ employees: [newer], attendance: [{ _id: 'new-scan', employeeId: 'E1', date: '2026-10-13' }] });
  const source = backup({ employees: [employee], attendance: [attendance] });
  const { plan } = await previewRecovery(db, source);
  assert.equal(plan.counts.preservedLive, 1);
  const result = await applyRecovery(db, source, plan);
  assert.equal(result.restored, 1); assert.deepEqual(db.data.employees, [newer]);
  assert.equal(db.data.attendance.length, 2);
  const repeat = await previewRecovery(db, source);
  assert.equal(repeat.plan.counts.restore, 0);
});

test('same logical attendance, account or payroll with another MongoDB ID is preserved', async () => {
  const source = backup({ employees: [employee], attendance: [attendance],
    employee_accounts: [{ _id: 'old-account', employeeId: 'E1', email: 'ava@example.test' }],
    payroll_requests: [{ _id: 'old-pay', id: 'P1', employeeId: 'E1', periodStart: '2026-10-01', amount: 100 }] });
  const db = database({ employees: [employee], attendance: [{ ...attendance, _id: 'new-attendance', checkIn: '10:00 AM' }],
    employee_accounts: [{ _id: 'new-account', employeeId: 'E2', email: 'ava@example.test' }],
    payroll_requests: [{ _id: 'new-pay', id: 'P2', employeeId: 'E1', periodStart: '2026-10-01', amount: 200 }] });
  const { plan } = await previewRecovery(db, source);
  assert.equal(plan.counts.restore, 0); assert.equal(plan.counts.preservedLive, 3);
});

test('stale preview or wrong database cannot apply', async () => {
  const db = database(); const source = backup({ employees: [employee] });
  const { plan } = await previewRecovery(db, source);
  await assert.rejects(applyRecovery(db, source, { ...plan, database: 'other' }), /different database/);
  db.data.employees = [employee];
  await assert.rejects(applyRecovery(db, source, plan), /changed since preview/);
  assert.equal(db.writes, 0);
});

test('partial recovery cannot orphan employee or carried payroll records', async () => {
  const db = database(); const source = backup({ employees: [employee], attendance: [attendance] });
  const { plan } = await previewRecovery(db, source, { collections: ['attendance'] });
  assert.match(plan.problems.join(), /Missing employee/);
  await assert.rejects(applyRecovery(db, source, plan), /Missing employee/);
  const payroll = backup({ employees: [employee], payroll_requests: [{ _id: 'P1', id: 'P1', employeeId: 'E1', rolledInto: 'missing' }] });
  const related = await previewRecovery(db, payroll);
  assert.match(related.plan.problems.join(), /missing payroll/);
});

test('failed insertion rolls back the entire dataset instead of leaving half a recovery', async () => {
  const db = database({}, 'attendance'); const source = backup({ employees: [employee], attendance: [attendance] });
  const { plan } = await previewRecovery(db, source);
  await assert.rejects(applyRecovery(db, source, plan), /Write failed/);
  assert.deepEqual(db.data, {});
});

test('invalid scopes, employee IDs and missing source identities are rejected', async () => {
  const db = database(); const source = backup({ employees: [employee] });
  await assert.rejects(previewRecovery(db, source, { collections: ['settings'] }), /supported/);
  await assert.rejects(previewRecovery(db, source, { employeeIds: ['missing'] }), /not found/);
  await assert.rejects(previewRecovery(db, backup({ employees: [{ id: 'E1' }] })), /no MongoDB ID/);
  await assert.rejects(applyRecovery({ ...db, client: null }, source, {}), /transaction support/);
});

test('large previews batch reads and recover a dataset across batch boundaries', async () => {
  const attendance = Array.from({ length: 601 }, (_, index) => ({ _id: `A${index}`, employeeId: 'E1', date: `day-${index}` }));
  const db = database({ employees: [employee], attendance: attendance.slice(0, 300) });
  const source = backup({ employees: [employee], attendance });
  const { plan } = await previewRecovery(db, source);
  assert.equal(plan.counts.restore, 301);
  await applyRecovery(db, source, plan);
  assert.equal(db.data.attendance.length, 601);
});
