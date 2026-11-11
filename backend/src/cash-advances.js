export const CASH_ADVANCE_INSTALLMENT = 200;

const cents = value => Math.round(Number(value || 0) * 100);

export async function cashAdvanceSummary(db, employeeId, periodStart) {
  const advances = await db.collection('cash_advances').find({ employeeId, reversedAt: { $exists: false } }).toArray();
  const payroll = await db.collection('payroll_requests').find({ employeeId, status: 'paid', settledBy: { $exists: false } }).toArray();
  const repaidCents = payroll.reduce((sum, row) => sum + cents(row.advanceDeduction), 0);
  const advancedCents = advances.reduce((sum, row) => sum + cents(row.amount), 0);
  const eligibleCents = advances.filter(row => !periodStart || !row.startPeriod || row.startPeriod <= periodStart).reduce((sum, row) => sum + cents(row.amount), 0);
  return {
    employeeId,
    advanced: advancedCents / 100,
    repaid: repaidCents / 100,
    balance: Math.max(0, advancedCents - repaidCents) / 100,
    eligibleBalance: Math.max(0, eligibleCents - repaidCents) / 100,
    installment: CASH_ADVANCE_INSTALLMENT,
    advances: advances.map(({ _id, ...row }) => row),
    repayments: payroll.filter(row => cents(row.advanceDeduction) > 0).map(row => ({
      payrollId: row.id, periodStart: row.periodStart, paidAt: row.paidAt,
      amount: cents(row.advanceDeduction) / 100,
    })),
  };
}

export function proposedAdvanceDeduction(balance, earnedPay) {
  return Math.min(cents(CASH_ADVANCE_INSTALLMENT), Math.max(0, cents(balance)), Math.max(0, cents(earnedPay))) / 100;
}

// Follow the carry chain, counting each earnings period once. Debt is repaid
// only by the destination payment, never by the carried source statements.
export async function payrollAdvanceProposal(db, employeeId, current, additionalSources = []) {
  const records = await db.collection('payroll_requests').find({ employeeId }).toArray();
  const selected = new Map([...additionalSources, current].map(row => [row.id || row._id || row.periodStart, row]));
  let changed = true;
  while (changed) {
    changed = false;
    const ids = new Set([...selected.values()].map(row => row.id).filter(Boolean));
    for (const row of records) {
      if (!row.settledBy && row.rolledInto && ids.has(row.rolledInto) && ['processing', 'rejected', 'carried_over'].includes(row.status)) {
        const key = row.id || row._id || row.periodStart;
        if (!selected.has(key)) { selected.set(key, row); changed = true; }
      }
    }
  }
  const periods = new Map();
  for (const row of selected.values()) {
    if (!/^\d{4}-\d{2}-(01|16)$/.test(row.periodStart || '')) continue;
    const earned = Math.max(0, cents(row.grossAmount));
    periods.set(row.periodStart, Math.max(periods.get(row.periodStart) || 0, earned));
  }
  let allocated = 0;
  const breakdown = [];
  for (const [periodStart, earned] of [...periods].sort(([a], [b]) => a.localeCompare(b))) {
    const summary = await cashAdvanceSummary(db, employeeId, periodStart);
    const amount = proposedAdvanceDeduction(Math.max(0, summary.eligibleBalance - allocated), earned / 100);
    if (amount > 0) breakdown.push({ periodStart, amount });
    allocated = Math.round((allocated + amount) * 100) / 100;
  }
  return { amount: allocated, breakdown };
}
