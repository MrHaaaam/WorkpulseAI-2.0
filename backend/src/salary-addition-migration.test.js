import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacySalaryAdditions } from './salary-addition-migration.js';

test('existing split amounts become one addition without changing old payroll', async () => {
  const employees = [{ _id: 'one', id: 'E1', identifiers: [
    { type: 'SSS', value: '123', amount: 145, frequency: 'quarterly' },
    { type: 'Pag-IBIG', value: '456', amount: 105, frequency: 'quarterly' },
  ] }];
  const oldPayroll = { employeeId: 'E1', periodStart: '2026-09-16', status: 'paid', additions: [{ label: 'SSS', value: 145 }, { label: 'Pag-IBIG', value: 105 }] };
  const db = { collection(name) {
    if (name === 'employees') return {
      find: () => ({ toArray: async () => employees.filter(item => !item.salaryAddition).map(item => structuredClone(item)) }),
      updateOne: async (query, update) => {
        const employee = employees.find(item => item._id === query._id && !item.salaryAddition);
        if (!employee) return { modifiedCount: 0 };
        Object.assign(employee, structuredClone(update.$set));
        return { modifiedCount: 1 };
      },
    };
    if (name === 'payroll_requests') return { findOne: async () => oldPayroll };
    throw new Error(`Unexpected collection ${name}`);
  } };
  assert.deepEqual(await migrateLegacySalaryAdditions(db, '2026-09-30'), { converted: 1, needsReview: 0 });
  assert.equal(employees[0].salaryAddition.amount, 250);
  assert.equal(employees[0].salaryAddition.eligibleFromQuarter, '2026-Q4');
  assert.ok(employees[0].identifiers.every(item => item.amount === 0));
  assert.deepEqual(oldPayroll.additions.map(item => item.label), ['SSS', 'Pag-IBIG']);
  assert.deepEqual(await migrateLegacySalaryAdditions(db, '2026-09-30'), { converted: 0, needsReview: 0 });
});

test('mixed old payment schedules become one quarterly amount starting next quarter', async () => {
  const employee = { _id: 'two', id: 'E2', identifiers: [{ amount: 100, frequency: 'quarterly' }, { amount: 50, frequency: 'per-payroll' }] };
  const db = { collection(name) {
    if (name === 'employees') return { find: () => ({ toArray: async () => [structuredClone(employee)] }), updateOne: async (_query, update) => { Object.assign(employee, update.$set); return { modifiedCount: 1 }; } };
    return { findOne: async () => null };
  } };
  assert.deepEqual(await migrateLegacySalaryAdditions(db, '2026-09-30'), { converted: 1, needsReview: 0 });
  assert.equal(employee.salaryAddition.amount, 150);
  assert.equal(employee.salaryAddition.frequency, 'quarterly');
  assert.equal(employee.salaryAddition.eligibleFromQuarter, '2026-Q4');
});
