import crypto from 'node:crypto';
import { BSON } from 'mongodb';
import { parseBackup } from './backup-format.js';

// Configuration, administrator credentials, temporary tokens and global settings
// are deliberately outside this missing-business-record recovery operation.
export const RECOVERY_COLLECTIONS = Object.freeze([
  'employees', 'employee_accounts', 'attendance', 'employee_notifications',
  'leave_requests', 'payroll_requests', 'cash_advances', 'cash_advance_requests',
  'biometric_templates', 'biometric_verification_attempts', 'biometric_evaluation_trials',
]);
const encode = value => BSON.EJSON.stringify(value, { relaxed: false });
const hash = value => crypto.createHash('sha256').update(encode(value)).digest('hex');
const stringId = value => value == null ? '' : String(value);

function identities(name, record) {
  const filters = [{ _id: record._id }];
  if (record.id) filters.push({ id: record.id });
  if (name === 'employees') filters.push({ id: record.id });
  if (name === 'employee_accounts') {
    filters.push({ employeeId: record.employeeId });
    if (record.email) filters.push({ email: record.email });
  }
  if (name === 'attendance') filters.push({ employeeId: record.employeeId, date: record.date });
  if (name === 'biometric_templates') filters.push({ employeeId: record.employeeId });
  // Never insert another historical statement into a period already changed live.
  if (name === 'payroll_requests' && record.periodStart) filters.push({ employeeId: record.employeeId, periodStart: record.periodStart });
  if (name === 'cash_advance_requests' && record.open) filters.push({ employeeId: record.employeeId, open: true });
  if (name === 'cash_advance_requests' && record.periodClaim) filters.push({ employeeId: record.employeeId, requestPeriod: record.requestPeriod, periodClaim: true });
  if (name === 'cash_advances' && record.requestId) filters.push({ requestId: record.requestId });
  if (name === 'cash_advances' && record.issuePeriod && !record.reversedAt) filters.push({ employeeId: record.employeeId, issuePeriod: record.issuePeriod, reversedAt: null });
  return { $or: filters };
}

export async function previewRecovery(db, contents, { employeeIds = [], collections = RECOVERY_COLLECTIONS } = {}, session) {
  const backup = parseBackup(contents);
  if (!collections.length || collections.some(name => !RECOVERY_COLLECTIONS.includes(name))) throw new Error('Choose supported business collections.');
  const selected = new Set(employeeIds);
  if (selected.size && [...selected].some(id => !backup.collections.employees.some(employee => employee.id === id))) throw new Error('An employee ID was not found in this backup.');
  const rows = [];
  const inserts = [];
  for (const name of collections) {
    const sources = backup.collections[name].filter(record => !selected.size || (name === 'employees' ? selected.has(record.id) : selected.has(record.employeeId) || selected.has(record.expectedEmployeeId) || selected.has(record.actualEmployeeId)));
    const lookup = new Map();
    for (let offset = 0; offset < sources.length; offset += 200) {
      const batch = sources.slice(offset, offset + 200);
      if (batch.some(record => !record._id)) throw new Error(`A ${name} record has no MongoDB ID; recovery cannot safely identify it.`);
      const filters = batch.flatMap(record => identities(name, record).$or);
      const live = await db.collection(name).find({ $or: filters }, { session }).toArray();
      for (const record of live) for (const identity of identities(name, record).$or) lookup.set(encode(identity), record);
    }
    for (const record of sources) {
      if (!record._id) throw new Error(`A ${name} record has no MongoDB ID; recovery cannot safely identify it.`);
      const existing = identities(name, record).$or.map(identity => lookup.get(encode(identity))).find(Boolean);
      const action = !existing ? 'restore' : hash(existing) === hash(record) ? 'already-present' : 'preserve-live';
      rows.push({ collection: name, mongoId: stringId(record._id), id: record.id || null,
        employeeId: name === 'employees' ? record.id : record.employeeId || record.expectedEmployeeId || null,
        name: name === 'employees' ? record.name : undefined, date: record.date || record.periodStart || null,
        action, sourceHash: hash(record), liveHash: existing ? hash(existing) : null });
      if (!existing) inserts.push({ name, record });
    }
  }
  const employeeRestores = new Set(inserts.filter(item => item.name === 'employees').map(item => item.record.id));
  const problems = [];
  const dependencies = new Set();
  for (const { name, record } of inserts) {
    if (name !== 'employees' && record.employeeId) dependencies.add(record.employeeId);
    if (name === 'biometric_evaluation_trials') {
      if (record.expectedEmployeeId) dependencies.add(record.expectedEmployeeId);
      if (record.actualEmployeeId) dependencies.add(record.actualEmployeeId);
    }
  }
  for (const employeeId of dependencies) {
    if (!employeeRestores.has(employeeId) && !await db.collection('employees').findOne({ id: employeeId }, { session })) problems.push(`Missing employee ${employeeId}: include its employee profile in recovery.`);
  }
  const payrollRestores = new Set(inserts.filter(item => item.name === 'payroll_requests').map(item => item.record.id));
  for (const { name, record } of inserts) {
    if (name !== 'payroll_requests') continue;
    for (const id of [record.rolledInto, record.settledBy].filter(Boolean)) {
      if (!payrollRestores.has(id) && !await db.collection('payroll_requests').findOne({ id }, { session })) problems.push(`Payroll ${record.id} refers to missing payroll ${id}. Include its related payroll records.`);
    }
  }
  const plan = { version: 1, database: db.databaseName, backupCreatedAt: backup.createdAt,
    scope: { employeeIds, collections }, rows, problems,
    counts: { restore: rows.filter(row => row.action === 'restore').length,
      alreadyPresent: rows.filter(row => row.action === 'already-present').length,
      preservedLive: rows.filter(row => row.action === 'preserve-live').length } };
  plan.fingerprint = hash(plan);
  return { plan, inserts };
}

export async function applyRecovery(db, contents, reviewedPlan) {
  if (!db.client?.startSession) throw new Error('Recovery requires MongoDB transaction support.');
  if (reviewedPlan.database !== db.databaseName) throw new Error('The reviewed plan targets a different database.');
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const { plan, inserts } = await previewRecovery(db, contents, reviewedPlan.scope, session);
      if (plan.fingerprint !== reviewedPlan.fingerprint) throw new Error('Backup, scope or live records changed since preview. Generate and review a new plan.');
      if (plan.problems.length) throw new Error(plan.problems.join('\n'));
      for (const { name, record } of inserts) await db.collection(name).insertOne(record, { session });
      return { applied: true, database: db.databaseName, restored: inserts.length, preservedLive: plan.counts.preservedLive };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
}
