// Materialize one report total per paid payroll record without changing its
// paid amount or removing the original audit line items.
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { isOwnerFunded, paidAdditionEntries } from '../shared/paid-additions.js';

dotenv.config({ quiet: true });
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
const apply = process.argv.includes('--apply');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db();
  const records = await db.collection('payroll_requests').find({ status: { $in: ['paid', 'approved'] } }).toArray();
  const employees = await db.collection('employees').find({ id: { $in: [...new Set(records.map(record => record.employeeId))] } }).toArray();
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  const recordsById = new Map(records.map(record => [record.id, record]));
  const updates = [];
  for (const record of records) {
    const items = record.additions?.length ? record.additions : record.quarterlyAdditions || [];
    const values = items.filter(item => isOwnerFunded(item, byId.get(record.employeeId)) && Number(item.value) > 0);
    if (!values.length) continue;
    const amount = Math.round(values.reduce((sum, item) => sum + Number(item.value), 0) * 100) / 100;
    const summary = { label: 'Salary addition', amount, sourcePeriodStart: record.periodStart };
    if (JSON.stringify(record.salaryAdditionSummary) !== JSON.stringify(summary)) updates.push({ _id: record._id, status: record.status, summary });
  }
  const paymentUpdates = paidAdditionEntries(records, employees).flatMap(entry => {
    const record = recordsById.get(entry.id);
    const summary = { label: 'Salary addition', amount: entry.total, paidPayrollPeriod: entry.periodStart };
    return record && JSON.stringify(record.salaryAdditionPaymentSummary) !== JSON.stringify(summary) ? [{ _id: record._id, status: record.status, summary }] : [];
  });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', paidPayrollRecords: records.length, sourceTotalsToWrite: updates.length, paymentTotalsToWrite: paymentUpdates.length, paidAmountsChanged: 0 }, null, 2));
  if (apply && updates.length) {
    const result = await db.collection('payroll_requests').bulkWrite(updates.map(item => ({ updateOne: { filter: { _id: item._id, status: item.status }, update: { $set: { salaryAdditionSummary: item.summary } } } })), { ordered: false });
    console.log(JSON.stringify({ summariesSaved: result.modifiedCount }));
  }
  if (apply && paymentUpdates.length) {
    const result = await db.collection('payroll_requests').bulkWrite(paymentUpdates.map(item => ({ updateOne: { filter: { _id: item._id, status: item.status }, update: { $set: { salaryAdditionPaymentSummary: item.summary } } } })), { ordered: false });
    console.log(JSON.stringify({ paymentSummariesSaved: result.modifiedCount }));
  }
} finally {
  await client.close();
}
