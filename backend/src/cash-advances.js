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
