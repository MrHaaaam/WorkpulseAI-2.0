import { combinedSalaryAddition, manilaDate, nextQuarter, quarterForDate, scheduleSalaryAddition } from '../../shared/quarterly-additions.js';
import { ADDITION_MAX, validBoundedNumber } from '../../shared/field-limits.js';

export async function migrateLegacySalaryAdditions(db, today = manilaDate()) {
  const employees = await db.collection('employees').find({ $or: [{ salaryAddition: { $exists: false } }, { 'salaryAddition.frequency': 'per-payroll' }] }).toArray();
  const quarter = quarterForDate(today);
  const quarterEndPeriod = `${today.slice(0, 4)}-${String(Number(quarter.slice(-1)) * 3).padStart(2, '0')}-16`;
  let converted = 0;
  let needsReview = 0;
  for (const employee of employees) {
    const identifiers = Array.isArray(employee.identifiers) ? employee.identifiers : [];
    const combined = combinedSalaryAddition(employee);
    if (!validBoundedNumber(combined.amount, 0, ADDITION_MAX)) { needsReview += 1; continue; }
    const paidQuarterEnd = await db.collection('payroll_requests').findOne({ employeeId: employee.id, periodStart: quarterEndPeriod, status: { $in: ['paid', 'approved'] } });
    const salaryAddition = scheduleSalaryAddition(employee, combined, today, paidQuarterEnd ? nextQuarter(quarter) : quarter);
    const result = await db.collection('employees').updateOne(
      employee.salaryAddition ? { _id: employee._id, 'salaryAddition.frequency': 'per-payroll' } : { _id: employee._id, salaryAddition: { $exists: false } },
      { $set: { salaryAddition, identifiers: identifiers.map(item => ({ ...item, amount: 0 })) } },
    );
    converted += result.modifiedCount;
  }
  return { converted, needsReview };
}
