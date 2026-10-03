import assert from 'node:assert/strict';
import test from 'node:test';
import { cashAdvanceSummary, proposedAdvanceDeduction } from './cash-advances.js';

function database(advances, payroll) {
  return { collection(name) {
    return { find(query) {
      const source = name === 'cash_advances' ? advances : payroll;
      return { async toArray() { return source.filter(row => row.employeeId === query.employeeId && (name === 'cash_advances' ? !row.reversedAt : row.status === 'paid' && !row.settledBy)); } };
    } };
  } };
}

test('one installment is capped by earned pay and the unpaid remainder persists', async () => {
  const advances = [{ employeeId: 'E1', amount: 1000 }];
  const payroll = [];
  const db = database(advances, payroll);
  const before = await cashAdvanceSummary(db, 'E1');
  assert.equal(proposedAdvanceDeduction(before.balance, 150), 150);
  assert.equal(proposedAdvanceDeduction(before.balance, 0), 0);
  payroll.push({ employeeId: 'E1', status: 'paid', advanceDeduction: 150, periodStart: '2026-01-01' });
  const after = await cashAdvanceSummary(db, 'E1');
  assert.equal(after.balance, 850);
  assert.equal(proposedAdvanceDeduction(after.balance, 400), 200);
});

test('undoing payment restores debt and carried source payroll does not repay twice', async () => {
  const payroll = [
    { employeeId: 'E1', status: 'paid', advanceDeduction: 200 },
    { employeeId: 'E1', status: 'paid', advanceDeduction: 200, settledBy: 'other-payroll' },
  ];
  const db = database([{ employeeId: 'E1', amount: 300 }], payroll);
  assert.equal((await cashAdvanceSummary(db, 'E1')).balance, 100);
  payroll[0].status = 'processing';
  assert.equal((await cashAdvanceSummary(db, 'E1')).balance, 300);
});

test('a request or approval alone is not debt, and a later start period waits', async () => {
  const advances = [];
  const db = database(advances, []);
  assert.equal((await cashAdvanceSummary(db, 'E1', '2026-09-16')).balance, 0);
  advances.push({ employeeId: 'E1', amount: 1000, startPeriod: '2026-10-16' });
  const beforeStart = await cashAdvanceSummary(db, 'E1', '2026-09-16');
  assert.equal(beforeStart.balance, 1000);
  assert.equal(beforeStart.eligibleBalance, 0);
  assert.equal(proposedAdvanceDeduction(beforeStart.eligibleBalance, 500), 0);
  assert.equal((await cashAdvanceSummary(db, 'E1', '2026-10-16')).eligibleBalance, 1000);
});
