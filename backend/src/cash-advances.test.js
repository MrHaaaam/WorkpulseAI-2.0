import assert from 'node:assert/strict';
import test from 'node:test';
import { cashAdvanceSummary, proposedAdvanceDeduction, payrollAdvanceProposal } from './cash-advances.js';

function database(advances, payroll) {
  return { collection(name) {
    return { find(query) {
      const source = name === 'cash_advances' ? advances : payroll;
      return { async toArray() { return source.filter(row => row.employeeId === query.employeeId && (name === 'cash_advances' ? !row.reversedAt : !query.status || row.status === 'paid' && !row.settledBy)); } };
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

test('three carried earnings periods repay three installments only on destination payment', async () => {
  const rows = [
    { id: 'p1', employeeId: 'E1', periodStart: '2026-09-01', grossAmount: 1000, status: 'carried_over', rolledInto: 'p2' },
    { id: 'p2', employeeId: 'E1', periodStart: '2026-09-16', grossAmount: 1000, status: 'carried_over', rolledInto: 'p3' },
    { id: 'p3', employeeId: 'E1', periodStart: '2026-10-01', grossAmount: 1000, status: 'processing' },
  ];
  const db = database([{ employeeId: 'E1', amount: 1000, startPeriod: '2026-09-01' }], rows);
  const proposal = await payrollAdvanceProposal(db, 'E1', rows[2]);
  assert.equal(proposal.amount, 600); assert.equal(proposal.breakdown.length, 3);
  assert.deepEqual(await payrollAdvanceProposal(db, 'E1', rows[2]), proposal);
  assert.equal((await cashAdvanceSummary(db, 'E1')).balance, 1000);
  rows[2].status = 'paid'; rows[2].advanceDeduction = proposal.amount;
  rows[0].status = rows[1].status = 'paid'; rows[0].settledBy = rows[1].settledBy = 'p3';
  assert.equal((await cashAdvanceSummary(db, 'E1')).balance, 400);
});

test('combined deductions respect start date, debt cap, earnings and unique periods', async () => {
  const current = { id: 'current', employeeId: 'E1', periodStart: '2026-10-01', grossAmount: 1000, status: 'processing' };
  const sources = [
    { id: 'old', employeeId: 'E1', periodStart: '2026-09-01', grossAmount: 1000 },
    { id: 'low', employeeId: 'E1', periodStart: '2026-09-16', grossAmount: 50 },
    { id: 'duplicate', employeeId: 'E1', periodStart: '2026-09-16', grossAmount: 50 },
  ];
  const db = database([{ employeeId: 'E1', amount: 225, startPeriod: '2026-09-16' }], []);
  const proposal = await payrollAdvanceProposal(db, 'E1', current, sources);
  assert.deepEqual(proposal, { amount: 225, breakdown: [{ periodStart: '2026-09-16', amount: 50 }, { periodStart: '2026-10-01', amount: 175 }] });
  assert.equal((await payrollAdvanceProposal(db, 'E1', { ...current, grossAmount: 0 })).amount, 0);
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
