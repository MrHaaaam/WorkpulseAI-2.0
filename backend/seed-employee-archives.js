import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { archiveCutoff, isArchivedRecord, keepActiveRecord } from '../shared/record-archives.js';
import { payrollTransaction } from './src/payroll-transaction.js';
import { cashAdvanceSummary } from './src/cash-advances.js';
import { registerRecordArchives } from './src/routes/record-archives.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true });
const email = process.argv.find(value => value.startsWith('--email='))?.slice(8) || 'employee@gmail.com';
const apply = process.argv.includes('--apply');
const seedTag = 'employee-archive-test-v1';
const sampleId = (prefix, employeeId, index) => `${prefix}-${createHash('sha256').update(`${seedTag}:${employeeId}:${index}`).digest('hex').slice(0, 16).toUpperCase()}`;

try {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required in backend/.env.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const account = await db.collection('employee_accounts').findOne({ email, active: { $ne: false } });
  if (!account?.employeeId) throw new Error('Active employee account not found. No data was changed.');
  const employee = await db.collection('employees').findOne({ id: account.employeeId, archived: { $ne: true } });
  if (!employee) throw new Error('Active employee profile not found. No data was changed.');
  const cutoff = archiveCutoff();
  const oldRecords = await db.collection('payroll_requests').find({ employeeId: employee.id }).toArray();
  const existingSeeds = oldRecords.filter(record => record.seedTag === seedTag);
  const months = [];
  for (let offset = 1; months.length < 2 && offset < 120; offset++) {
    const date = new Date(`${cutoff.slice(0, 7)}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - offset);
    const period = date.toISOString().slice(0, 10);
    if (!oldRecords.some(record => record.periodStart === period && record.seedTag !== seedTag)) months.push(period);
  }
  if (months.length !== 2) throw new Error('Could not find two unused old payroll periods. No data was changed.');
  const plans = [];
  for (let index = 0; index < 2; index++) {
    const period = existingSeeds.find(record => record.id === sampleId('PR', employee.id, index))?.periodStart || months[index];
    const date = `${period.slice(0, 7)}-0${index + 3}`;
    const createdAt = new Date(`${date}T09:00:00+08:00`);
    const common = { employeeId: employee.id, employeeName: employee.name, seedTag, createdAt };
    plans.push({ collection: 'leave_requests', kind: 'leave', record: {
      ...common, id: sampleId('LR', employee.id, index), role: employee.role,
      leaveType: index ? 'Personal Leave' : 'Sick Leave', startDate: date, endDate: date,
      requestedDates: [date], approvedDates: [], totalDays: 1,
      reason: index ? 'Family appointment.' : 'Medical consultation.',
      status: index ? 'cancelled' : 'rejected', reviewedAt: createdAt,
    } });
    const amount = index ? 1200 : 800;
    plans.push({ collection: 'payroll_requests', kind: 'payroll', record: {
      ...common, id: sampleId('PR', employee.id, index), periodStart: period, periodDays: 15,
      amount, grossAmount: amount, currentAmount: amount, carryOverAmount: 0,
      advanceDeduction: 0, advanceDeductionPeriods: [], additions: [], quarterlyAdditions: [],
      hoursWorked: amount / 100, regularHours: amount / 100, overtimeHours: 0, hourlyRate: 100,
      status: 'paid', paidAt: new Date(`${period.slice(0, 7)}-17T12:00:00+08:00`),
      reason: `Payroll for ${period.slice(0, 7)}, first half.`,
      warnings: [],
    } });
    plans.push({ collection: 'cash_advance_requests', kind: 'cash', record: {
      ...common, id: sampleId('CAR', employee.id, index), amount: index ? 700 : 500,
      reason: index ? 'Transportation expenses.' : 'Household expenses.',
      status: index ? 'cancelled' : 'rejected', requestedAt: createdAt, requestPeriod: period,
      open: false, periodClaim: false, repaymentAgreed: true,
      ...(index ? { cancelledAt: createdAt } : { rejectedAt: createdAt }),
    } });
  }
  for (const plan of plans) {
    assert.ok(isArchivedRecord(plan.kind, plan.record, cutoff), 'Each sample must qualify for Archives.');
    assert.equal(keepActiveRecord(plan.kind, plan.record, cutoff), false, 'Samples must stay out of active histories.');
    const collision = await db.collection(plan.collection).findOne({ id: plan.record.id });
    if (collision && (collision.seedTag !== seedTag || collision.employeeId !== employee.id)) throw new Error('Sample ID collision. No data was changed.');
  }
  const beforeBalance = (await cashAdvanceSummary(db, employee.id)).balance;
  if (apply) {
    await payrollTransaction(db, async tx => {
      for (const { collection, record } of plans) {
        await tx.collection(collection).updateOne({ id: record.id, employeeId: employee.id, seedTag }, { $setOnInsert: record }, { upsert: true });
      }
    });
    let archiveHandler;
    registerRecordArchives({ post() {}, get: (_path, handler) => { archiveHandler = handler; } }, () => db);
    for (const kind of ['leave', 'payroll', 'cash']) {
      let result;
      let status = 200;
      await archiveHandler({ params: { kind }, query: { page: '1' }, auth: { accountType: 'employee', actor: { employeeId: employee.id, role: employee.role } } }, {
        status(code) { status = code; return this; }, json(body) { result = body; return this; },
      });
      assert.equal(status, 200, 'Archive API must return successfully.');
      for (const { record } of plans.filter(plan => plan.kind === kind)) {
        await archiveHandler({ params: { kind }, query: { from: kind === 'payroll' ? `${record.periodStart.slice(0, 7)}-15` : record.startDate || record.requestedAt.toISOString().slice(0, 10), to: kind === 'payroll' ? `${record.periodStart.slice(0, 7)}-15` : record.startDate || record.requestedAt.toISOString().slice(0, 10) }, auth: { accountType: 'employee', actor: { employeeId: employee.id, role: employee.role } } }, { status(code) { status = code; return this; }, json(body) { result = body; return this; } });
        assert.equal(status, 200);
        assert.ok(result.items.some(item => item.id.endsWith(`:${record.id}`)), `${record.id} must appear in the employee archive.`);
      }
    }
    assert.equal((await cashAdvanceSummary(db, employee.id)).balance, beforeBalance, 'Samples must not change cash owed.');
  }
  console.log(JSON.stringify({ mode: apply ? 'inserted-and-verified' : 'preview-no-changes', email, employeeId: employee.id, cutoff, sampleRecords: plans.map(({ collection, record }) => ({ collection, id: record.id, date: record.periodStart || record.startDate || record.requestedAt, status: record.status })), cashBalanceUnchanged: apply ? true : undefined }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[connection redacted]') : 'Archive seed failed.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
