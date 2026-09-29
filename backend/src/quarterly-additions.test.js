import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { configuredAdditions, scheduleIdentifierFrequencies, frequencyForQuarter, nextQuarter } from '../../shared/quarterly-additions.js';
import { identifiersValidationError } from '../../shared/field-limits.js';
import { previewQuarterlyAdditions, includeQuarterlyAdditions, removeQuarterlyAdditions, quarterlySelectionError, recurringPayrollAdditions, undoPaymentValidationError } from './quarterly-additions.js';
import { preparePayrollRecord } from './routes/api.js';
import { payrollTransaction } from './payroll-transaction.js';

const period = '2026-09-16';
const quarter = '2026-Q3';
const employee = { id: 'E1', name: 'Employee One', createdAt: '2025-01-01T00:00:00Z', role: 'regular', identifiers: [
  { type: 'SSS', value: '0123456789', amount: 1500, frequency: 'quarterly' },
  { type: 'Pag-IBIG', value: '012345678901', amount: 200, frequency: 'quarterly' },
  { type: 'Travel', value: 'T-1', amount: 50, frequency: 'per-payroll' },
] };
const payroll = (id = 'P1', periodStart = period) => ({ _id: id, id, employeeId: 'E1', periodStart, status: 'processing', grossAmount: 100, additions: [], currentAmount: 100, amount: 100 });

function matches(record, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some(part => matches(record, part));
    const actual = key.split('.').reduce((value, part) => value?.[part], record);
    if (expected && !Array.isArray(expected) && typeof expected === 'object' && !(expected instanceof Date)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$exists') return (actual !== undefined) === value;
        if (operator === '$in') return value.includes(actual);
        if (operator === '$ne') return Array.isArray(actual) ? !actual.includes(value) : actual !== value;
        if (operator === '$lt') return actual < value;
        if (operator === '$lte') return actual <= value;
        if (operator === '$gte') return actual >= value;
        if (operator === '$gt') return actual > value;
        return isDeepStrictEqual(actual, expected);
      });
    }
    return Array.isArray(actual) && !Array.isArray(expected) ? actual.includes(expected) : isDeepStrictEqual(actual, expected);
  });
}

function database(records = [payroll()], employees = [structuredClone(employee)]) {
  const data = { payroll_requests: records, employees, attendance: [] };
  const indexes = [];
  const db = { data, indexes, collection(name) {
    const rows = data[name] ?? [];
    return {
      createIndex: async (keys, options) => { indexes.push({ keys, options }); },
      find: query => ({ toArray: async () => structuredClone(rows.filter(row => matches(row, query))) }),
      findOne: async query => structuredClone(rows.find(row => matches(row, query)) ?? null),
      insertOne: async record => { rows.push({ ...structuredClone(record), _id: record.id }); },
      updateOne: async (query, update) => {
        const row = rows.find(row => matches(row, query));
        if (!row) return { modifiedCount: 0 };
        const claimed = update.$addToSet?.quarterlyKeys;
        if (claimed && rows.some(other => other !== row && other.employeeId === row.employeeId && other.quarterlyKeys?.includes(claimed))) throw Object.assign(new Error('duplicate quarter'), { code: 11000 });
        for (const [key, value] of Object.entries(update.$set ?? {})) row[key] = structuredClone(value);
        for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + value;
        for (const [key, value] of Object.entries(update.$push ?? {})) row[key] = [...(row[key] ?? []), ...structuredClone(value.$each)];
        for (const [key, value] of Object.entries(update.$addToSet ?? {})) row[key] = [...new Set([...(row[key] ?? []), value])];
        for (const [key, value] of Object.entries(update.$pull ?? {})) row[key] = (row[key] ?? []).filter(item => typeof value === 'object' ? !matches(item, value) : item !== value);
        for (const key of Object.keys(update.$unset ?? {})) delete row[key];
        return { modifiedCount: 1 };
      },
      findOneAndUpdate: async (query, update) => {
        const row = rows.find(row => matches(row, query));
        if (!row) return null;
        await db.collection(name).updateOne(query, update);
        return structuredClone(row);
      },
      updateMany: async (query, update) => {
        for (const row of rows.filter(row => matches(row, query))) await db.collection(name).updateOne({ _id: row._id }, update);
      },
    };
  } };
  return db;
}

async function include(db, selectedPeriod = period, selectedQuarter = quarter) {
  const entries = await previewQuarterlyAdditions(db, selectedPeriod, selectedQuarter);
  const entry = entries.find(row => row.eligible);
  assert.ok(entry, JSON.stringify(entries));
  return includeQuarterlyAdditions(db, selectedPeriod, selectedQuarter, [{ requestId: entry.requestId, token: entry.token }], 'admin');
}

test('quarterly allowances automatically enter the final payroll of the quarter', async () => {
  assert.deepEqual(configuredAdditions(employee, 'per-payroll'), [{ label: 'Travel', value: 50, sourceKey: 'travel', frequency: 'per-payroll' }]);
  assert.equal(configuredAdditions({ identifiers: [{ type: 'SSS', value: '0123456789', amount: 1500 }] }, 'per-payroll').length, 0);
  assert.ok(identifiersValidationError([{ ...employee.identifiers[0], frequency: 'daily' }]));
  const db = database([]);
  const result = await preparePayrollRecord(db, employee, period, {});
  assert.equal(result.record.currentAmount, 1750);
  assert.equal(result.record.additions.length, 3);
  assert.deepEqual(result.record.quarterlyKeys, [quarter]);
  const refreshed = await preparePayrollRecord(db, employee, period, {});
  assert.equal(refreshed.record.currentAmount, 1750);
  assert.equal(refreshed.record.quarterlyAdditions.length, 2);
});

test('quarter selection supports late payments and year boundaries but rejects future or malformed quarters', () => {
  assert.equal(quarterlySelectionError(period, '2025-Q4', '2026-09-28'), null);
  assert.equal(quarterlySelectionError('2027-01-01', '2026-Q4', '2027-01-05'), null);
  for (const value of ['2026-Q4', '2027-Q1', '2026-Q0', '2026-Q5', '', undefined]) assert.ok(quarterlySelectionError(period, value, '2026-09-28'));
  assert.ok(quarterlySelectionError('2026-13-01', quarter, '2026-09-28'));
});

test('inclusion snapshots reviewed amounts, stays unpaid, survives recalculation and profile changes', async () => {
  const db = database();
  assert.equal((await include(db))[0].included, true);
  const row = db.data.payroll_requests[0];
  assert.equal(row.status, 'processing');
  assert.equal(row.amount, 1800);
  assert.deepEqual(row.quarterlyKeys, [quarter]);
  assert.match(row.additions[0].label, /Q3 2026/);
  db.data.employees[0].identifiers[0].amount = 3000;
  await preparePayrollRecord(db, db.data.employees[0], period, {});
  assert.equal(row.amount, 1750); // no attendance + 50 recurring + the original 1700 quarterly bundle
  assert.equal(row.quarterlyAdditions[0].value, 1500);
  assert.equal(db.indexes[0].options.unique, true);
});

test('stale previews are rejected when employee amounts change', async () => {
  const db = database();
  const [entry] = await previewQuarterlyAdditions(db, period, quarter);
  db.data.employees[0].identifiers[0].amount = 3000;
  const [result] = await includeQuarterlyAdditions(db, period, quarter, [{ requestId: entry.requestId, token: entry.token }], 'admin');
  assert.equal(result.included, false);
  assert.equal(db.data.payroll_requests[0].amount, 100);
});

test('concurrent inclusion requests add the bundle once in the same payroll', async () => {
  const db = database();
  const [entry] = await previewQuarterlyAdditions(db, period, quarter);
  const selections = [{ requestId: entry.requestId, token: entry.token }];
  const results = await Promise.all([includeQuarterlyAdditions(db, period, quarter, selections, 'a'), includeQuarterlyAdditions(db, period, quarter, selections, 'b')]);
  assert.equal(results.flat().filter(result => result.included).length, 1);
  assert.equal(db.data.payroll_requests[0].amount, 1800);
});

test('concurrent inclusion in different payroll periods is rejected by the unique quarter constraint', async () => {
  const db = database([payroll(), payroll('P2', '2026-10-01')]);
  const [first] = await previewQuarterlyAdditions(db, period, quarter);
  const [second] = await previewQuarterlyAdditions(db, '2026-10-01', quarter);
  const results = await Promise.all([
    includeQuarterlyAdditions(db, period, quarter, [{ requestId: first.requestId, token: first.token }], 'a'),
    includeQuarterlyAdditions(db, '2026-10-01', quarter, [{ requestId: second.requestId, token: second.token }], 'b'),
  ]);
  assert.equal(results.flat().filter(result => result.included).length, 1);
  assert.equal(db.data.payroll_requests.reduce((sum, row) => sum + row.amount, 0), 1900);
});

test('pending, held, carried and paid bundles cannot be included twice; undo remains pending', async () => {
  const db = database();
  await include(db);
  for (const status of ['processing', 'rejected', 'carried_over', 'paid', 'approved', 'processing']) {
    db.data.payroll_requests[0].status = status;
    const [entry] = await previewQuarterlyAdditions(db, period, quarter);
    assert.equal(entry.eligible, false);
    assert.match(entry.reason, ['paid', 'approved'].includes(status) ? /Already paid/ : /unpaid payroll/);
  }
});

test('removing a pending inclusion releases the quarter; paid or carried additions cannot be removed', async () => {
  const db = database();
  await include(db);
  for (const status of ['paid', 'carried_over', 'rejected']) {
    db.data.payroll_requests[0].status = status;
    assert.equal(await removeQuarterlyAdditions(db, 'P1', quarter, 'admin'), false);
  }
  db.data.payroll_requests[0].status = 'processing';
  assert.equal(await removeQuarterlyAdditions(db, 'P1', quarter, 'admin'), true);
  assert.equal(db.data.payroll_requests[0].amount, 100);
  assert.equal((await previewQuarterlyAdditions(db, period, quarter))[0].eligible, true);
  await include(db);
  assert.equal(db.data.payroll_requests[0].amount, 1800);
});

test('legacy paid additions block inclusion until reconciled instead of allowing another payout', async () => {
  const legacy = { ...payroll('old', '2026-09-01'), status: 'paid', additions: [{ label: 'SSS', value: 1500 }] };
  const db = database([payroll(), legacy]);
  const [entry] = await previewQuarterlyAdditions(db, period, quarter);
  assert.equal(entry.legacyWarning, true);
  assert.equal(entry.eligible, false);
  assert.equal(entry.status, 'attention');
  const [result] = await includeQuarterlyAdditions(db, period, quarter, [{ requestId: entry.requestId, token: entry.token }], 'admin');
  assert.equal(result.included, false);
});

test('different quarters may be included in one payroll for late payments', async () => {
  const db = database();
  await include(db, period, '2026-Q2');
  await include(db);
  assert.deepEqual(db.data.payroll_requests[0].quarterlyKeys, ['2026-Q2', '2026-Q3']);
  assert.equal(db.data.payroll_requests[0].amount, 3500);
});

test('held payroll and employees without configured quarterly amounts are ineligible', async () => {
  const db = database();
  db.data.payroll_requests[0].status = 'rejected';
  assert.equal((await previewQuarterlyAdditions(db, period, quarter))[0].eligible, false);
  db.data.payroll_requests[0].status = 'processing';
  db.data.employees[0].identifiers = [];
  assert.equal((await previewQuarterlyAdditions(db, period, quarter))[0].eligible, false);
});

test('quarterly balances carry forward with their labelled breakdown and remain reserved', async () => {
  const db = database();
  await include(db);
  db.data.payroll_requests[0].status = 'rejected';
  const next = await preparePayrollRecord(db, employee, '2026-10-01', {});
  assert.equal(next.record.carryOverAmount, 1800);
  assert.equal(next.record.amount, 1850);
  assert.equal(next.record.carriedQuarterlyAdditions.reduce((sum, item) => sum + item.value, 0), 1700);
  assert.equal(db.data.payroll_requests[0].status, 'carried_over');
  assert.equal((await previewQuarterlyAdditions(db, '2026-10-01', quarter))[0].eligible, false);
  await preparePayrollRecord(db, employee, '2026-10-01', {});
  const later = await preparePayrollRecord(db, employee, '2026-10-16', {});
  assert.equal(later.record.amount, 1900);
  assert.equal(later.record.carriedQuarterlyAdditions.length, 2);
});

test('a refresh started before quarterly inclusion does not overwrite that inclusion', async () => {
  const db = database();
  const originalCollection = db.collection.bind(db);
  let intercepted = false;
  db.collection = name => {
    const collection = originalCollection(name);
    if (name === 'payroll_requests') {
      const update = collection.findOneAndUpdate;
      collection.findOneAndUpdate = async (query, changes) => {
        if (!intercepted) { intercepted = true; await include(db); }
        return update(query, changes);
      };
    }
    return collection;
  };
  const result = await preparePayrollRecord(db, employee, period, {});
  assert.equal(result.record.amount, 1800);
  assert.equal(result.record.quarterlyAdditions.length, 2);
  await preparePayrollRecord(db, employee, period, {});
  assert.equal(db.data.payroll_requests[0].amount, 1750);
});

test('paid payroll amounts are never recalculated from new profile frequencies', async () => {
  const row = { ...payroll(), status: 'paid', amount: 9876, additions: [{ label: 'Historical addition', value: 9776 }] };
  const db = database([row]);
  await preparePayrollRecord(db, employee, period, {});
  assert.equal(row.amount, 9876);
  assert.equal(row.additions[0].label, 'Historical addition');
});

test('MongoDB payroll preparation uses one transaction session for reads and writes', async () => {
  const calls = [];
  let ended = false;
  const session = { withTransaction: async (work, options) => { assert.equal(options.readConcern.level, 'snapshot'); return work(); }, endSession: async () => { ended = true; } };
  const db = { client: { startSession: () => session }, collection: () => Object.fromEntries(['find', 'findOne', 'insertOne', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteMany'].map(method => [method, (...args) => { calls.push({ method, args }); return Promise.resolve('result'); }])) };
  const result = await payrollTransaction(db, async transactionDb => {
    assert.equal(transactionDb.inPayrollTransaction, true);
    const collection = transactionDb.collection('payroll_requests');
    await collection.find({}); await collection.findOne({}); await collection.insertOne({});
    await collection.updateOne({}, {}); await collection.updateMany({}, {});
    await collection.findOneAndUpdate({}, {}, { returnDocument: 'after' });
    await collection.deleteMany({});
    return 'committed';
  });
  assert.equal(result, 'committed');
  assert.equal(ended, true);
  assert.equal(calls.length, 7);
  for (const call of calls) assert.equal(call.args.at(-1).session, session);
  assert.equal(calls.find(call => call.method === 'findOneAndUpdate').args.at(-1).returnDocument, 'after');
  ended = false;
  await assert.rejects(payrollTransaction(db, async () => { throw new Error('rollback'); }), /rollback/);
  assert.equal(ended, true);
});

test('quarterly frequency changes take effect next quarter and cannot rewrite past eligibility', () => {
  const changed = structuredClone(employee.identifiers);
  changed[0].frequency = 'per-payroll';
  const scheduled = scheduleIdentifierFrequencies(employee, changed, '2026-09-28');
  assert.equal(frequencyForQuarter(scheduled[0], '2026-Q2'), 'quarterly');
  assert.equal(frequencyForQuarter(scheduled[0], '2026-Q3'), 'quarterly');
  assert.equal(frequencyForQuarter(scheduled[0], '2026-Q4'), 'per-payroll');
  assert.equal(configuredAdditions({ identifiers: scheduled }, 'per-payroll', '2026-Q3').some(item => item.sourceKey === 'sss'), false);
  assert.equal(configuredAdditions({ identifiers: scheduled }, 'per-payroll', '2026-Q4').some(item => item.sourceKey === 'sss'), true);
  assert.equal(nextQuarter('2026-Q4'), '2027-Q1');
});

test('a scheduled change can be cancelled without losing the original frequency', () => {
  const changed = structuredClone(employee.identifiers);
  changed[0].frequency = 'per-payroll';
  const scheduled = scheduleIdentifierFrequencies(employee, changed, '2026-09-28');
  const cancelled = scheduleIdentifierFrequencies({ ...employee, identifiers: scheduled }, employee.identifiers, '2026-09-29');
  assert.equal(frequencyForQuarter(cancelled[0], '2026-Q3'), 'quarterly');
  assert.equal(frequencyForQuarter(cancelled[0], '2026-Q4'), 'quarterly');
});

test('every-payroll to quarterly starts next quarter and blocks overlapping ordinary payouts', async () => {
  const old = structuredClone(employee);
  old.identifiers[0].frequency = 'per-payroll';
  const changed = structuredClone(old.identifiers);
  changed[0].frequency = 'quarterly';
  const scheduled = scheduleIdentifierFrequencies(old, changed, '2026-09-28');
  assert.equal(frequencyForQuarter(scheduled[0], quarter), 'per-payroll');
  assert.equal(frequencyForQuarter(scheduled[0], '2026-Q4'), 'quarterly');
  const ordinary = { ...payroll('P0', '2026-09-01'), status: 'paid', additions: [{ label: 'SSS', sourceKey: 'sss', frequency: 'per-payroll', coverageQuarter: quarter, value: 250 }] };
  const db = database([ordinary, payroll()]);
  const [entry] = await previewQuarterlyAdditions(db, period, quarter);
  assert.equal(entry.status, 'attention');
  assert.equal(entry.eligible, false);
  const [result] = await includeQuarterlyAdditions(db, period, quarter, [{ requestId: entry.requestId, token: entry.token }], 'admin');
  assert.equal(result.included, false);
});

test('even a bypassed profile frequency change cannot repeat a quarterly allowance in ordinary payroll', async () => {
  const db = database([payroll('P0', '2026-09-01')]);
  await include(db, '2026-09-01');
  db.data.payroll_requests[0].status = 'paid';
  db.data.employees[0].identifiers[0].frequency = 'per-payroll';
  const additions = await recurringPayrollAdditions(db, db.data.employees[0], period);
  assert.equal(additions.some(item => item.sourceKey === 'sss'), false);
  assert.equal(additions.find(item => item.sourceKey === 'travel').value, 50);
  const result = await preparePayrollRecord(db, db.data.employees[0], period, {});
  assert.equal(result.record.amount, 50);
  assert.equal((await previewQuarterlyAdditions(db, period, quarter))[0].status, 'paid');
});

test('a quarter before employee eligibility and a newly added allowance cannot be backdated', async () => {
  const recent = { ...structuredClone(employee), createdAt: '2026-08-10T00:00:00Z' };
  const db = database([payroll()], [recent]);
  const [entry] = await previewQuarterlyAdditions(db, period, '2026-Q2');
  assert.equal(entry.status, 'unavailable');
  assert.match(entry.reason, /starting Q3 2026/);
  const identifiers = scheduleIdentifierFrequencies(null, employee.identifiers, '2026-09-28');
  assert.equal(configuredAdditions({ identifiers }, 'quarterly', '2026-Q2').length, 0);
  assert.equal(configuredAdditions({ identifiers }, 'quarterly', '2026-Q3').length, 2);
});

test('unlabelled payments in another period cannot be assumed to cover a different quarter', async () => {
  const legacy = { ...payroll('old', '2026-09-01'), status: 'paid', additions: [{ label: 'SSS', value: 1500 }] };
  const db = database([payroll(), legacy]);
  const [entry] = await previewQuarterlyAdditions(db, period, '2026-Q2');
  assert.equal(entry.status, 'attention');
  assert.equal(entry.eligible, false);
  assert.equal(entry.history[0].id, 'old');
});

test('undo requires a reason and returned-or-not-paid confirmation; the quarter remains reserved', async () => {
  for (const body of [undefined, {}, { reason: 'Incorrect payment record' }, { paymentReversedConfirmed: true, reason: 'short' }, { paymentReversedConfirmed: true, reason: 'a'.repeat(251) }]) assert.ok(undoPaymentValidationError(body));
  assert.equal(undoPaymentValidationError({ paymentReversedConfirmed: true, reason: 'The transfer was cancelled before completion.' }), null);
  const db = database();
  await include(db);
  db.data.payroll_requests[0].status = 'paid';
  db.data.payroll_requests[0].status = 'processing'; // Undo corrects status, not the allowance claim.
  const [entry] = await previewQuarterlyAdditions(db, period, quarter);
  assert.equal(entry.status, 'included');
  assert.equal(entry.eligible, false);
});
