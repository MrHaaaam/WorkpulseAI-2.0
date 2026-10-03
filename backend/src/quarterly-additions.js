import { payrollTransaction } from './payroll-transaction.js';
import crypto from 'node:crypto';
import { configuredAdditions, validQuarter, quarterForDate, allowanceKey, manilaDate, COMBINED_ADDITION_KEY } from '../../shared/quarterly-additions.js';

const indexPromises = new WeakMap();
export async function ensureQuarterlyIndex(db) {
  if (!indexPromises.has(db)) {
    indexPromises.set(db, db.collection('payroll_requests').createIndex(
      { employeeId: 1, quarterlyKeys: 1 },
      { unique: true, partialFilterExpression: { 'quarterlyKeys.0': { $exists: true } }, name: 'one_quarterly_bundle_per_employee' },
    ).catch((error) => { indexPromises.delete(db); throw error; }));
  }
  return indexPromises.get(db);
}

export function quarterlySelectionError(periodStart, quarter, today) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])-(01|16)$/.test(periodStart) || periodStart > today) return 'Select an existing payroll period.';
  if (!validQuarter(quarter) || quarter > quarterForDate(periodStart) || quarter > quarterForDate(today)) return 'Select the payroll quarter or an earlier quarter for a late payment.';
  return null;
}

const totalOf = (items) => Math.round(items.reduce((sum, item) => sum + item.value, 0) * 100) / 100;
const previewToken = (entry, quarter) => crypto.createHash('sha256').update(JSON.stringify({ requestId: entry.requestId, quarter, items: entry.items })).digest('hex');

const activeStatuses = ['processing', 'rejected', 'carried_over', 'paid', 'approved'];
const recordQuarter = (record) => /^20\d{2}-\d{2}-\d{2}$/.test(record.periodStart || '') ? quarterForDate(record.periodStart) : null;

export function undoPaymentValidationError(body) {
  if (body?.paymentReversedConfirmed !== true) return 'Confirm that payment was not made or the money was returned. Undo does not recover money.';
  if (typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.trim().length > 250) return 'Explain why this payment is being undone using 10 to 250 characters.';
  return null;
}

function eligibilityStart(employee, history) {
  const created = new Date(employee.createdAt);
  if (!Number.isNaN(created.getTime())) return quarterForDate(manilaDate(created));
  return history.map(recordQuarter).filter(Boolean).sort()[0] ?? quarterForDate(manilaDate());
}

export async function recurringPayrollAdditions(db, employee, periodStart) {
  const quarter = quarterForDate(periodStart);
  const configured = configuredAdditions(employee, 'per-payroll', quarter);
  if (!configured.length) return [];
  const history = await db.collection('payroll_requests').find({ employeeId: employee.id, status: { $in: activeStatuses } }).toArray();
  const blocked = new Set();
  for (const record of history) {
    for (const item of [...(record.additions || []), ...(record.quarterlyAdditions || [])]) {
      if (item.quarter === quarter || (!item.frequency && !item.quarter && item.label !== 'Bonus' && recordQuarter(record) === quarter)) blocked.add(allowanceKey(item));
    }
  }
  return configured.filter(item => !blocked.has(item.sourceKey));
}

export async function automaticQuarterlyAdditions(db, employee, periodStart, existing) {
  if (!/-(03|06|09|12)-16$/.test(periodStart)) return [];
  const quarter = quarterForDate(periodStart);
  const configured = configuredAdditions(employee, 'quarterly', quarter);
  if (!configured.length) return [];
  const history = await db.collection('payroll_requests').find({ employeeId: employee.id, status: { $in: activeStatuses } }).toArray();
  if (history.some(record => record.id !== existing?.id && record.quarterlyKeys?.includes(quarter))) return [];
  const priorKeys = new Set((existing?.quarterlyAdditions || []).filter(item => item.quarter === quarter).map(allowanceKey));
  const legacyKeys = new Set((employee.identifiers || []).map(allowanceKey));
  const legacyPaidInQuarter = history.some(record => [...(record.additions || []), ...(record.quarterlyAdditions || [])].some(item =>
    item.label !== 'Bonus' && (
      (item.quarter === quarter && legacyKeys.has(allowanceKey(item))) ||
      (recordQuarter(record) === quarter && !item.quarter && (!item.frequency || legacyKeys.has(allowanceKey(item))))
    )
  ));
  return configured.filter(item => !(item.sourceKey === COMBINED_ADDITION_KEY && legacyPaidInQuarter) && !priorKeys.has(item.sourceKey) && !history.some(record =>
    (record.additions || []).some(old =>
      allowanceKey(old) === item.sourceKey && (old.quarter === quarter || (!old.quarter && !old.frequency))
    )
  ));
}

export async function previewQuarterlyAdditions(db, periodStart, quarter, employeeId) {
  const employeeQuery = { archived: { $ne: true }, status: { $ne: 'inactive' }, ...(employeeId ? { id: employeeId } : {}) };
  const payrollQuery = { status: { $in: activeStatuses }, ...(employeeId ? { employeeId } : {}) };
  // MongoDB sessions cannot run parallel operations inside a transaction.
  const [employees, history] = db.inPayrollTransaction
    ? [await db.collection('employees').find(employeeQuery).toArray(), await db.collection('payroll_requests').find(payrollQuery).toArray()]
    : await Promise.all([db.collection('employees').find(employeeQuery).toArray(), db.collection('payroll_requests').find(payrollQuery).toArray()]);
  return employees.map((employee) => {
    const employeeHistory = history.filter(item => item.employeeId === employee.id);
    const records = employeeHistory.filter(item => item.periodStart === periodStart);
    const items = configuredAdditions(employee, 'quarterly', quarter);
    const record = records.find(item => item.status === 'processing' && !item.rolledInto) ?? records[0];
    const claim = employeeHistory.find(item => item.quarterlyKeys?.includes(quarter));
    const sourceKeys = new Set(items.map(item => item.sourceKey));
    const conflicts = employeeHistory.filter(item => (item.additions || []).some(addition =>
      !addition.quarter && addition.label !== 'Bonus' && (!addition.frequency || (recordQuarter(item) === quarter && sourceKeys.has(allowanceKey(addition))))
    ));
    const earliestQuarter = eligibilityStart(employee, employeeHistory);
    const beforeEmployment = quarter < earliestQuarter;
    const legacyWarning = conflicts.some(item => item.additions.some(addition => !addition.frequency && !addition.quarter && addition.label !== 'Bonus'));
    let status = 'eligible';
    let reason = '';
    if (claim) {
      status = ['paid', 'approved'].includes(claim.status) ? 'paid' : 'included';
      reason = status === 'paid' ? 'Already paid for these months. Do not add it again.' : 'Already in an unpaid payroll. Pay that payroll instead of adding this allowance again.';
    } else if (beforeEmployment) {
      status = 'unavailable'; reason = `This employee can receive allowances starting ${earliestQuarter.slice(5)} ${earliestQuarter.slice(0, 4)}. Choose that period or a later one.`;
    } else if (conflicts.length) {
      status = 'attention'; reason = legacyWarning ? 'Older payrolls already contain allowance amounts, but the months they cover were not recorded. Check those amounts before adding another allowance.' : 'This allowance is already in regular payroll for these months. Do not add it again.';
    } else if (!record || record.status !== 'processing' || record.rolledInto) {
      status = 'unavailable'; reason = !record ? "Create this employee's payroll first." : ['paid', 'approved'].includes(record.status) ? 'This payroll has already been paid. Choose an unpaid payroll.' : record.status === 'rejected' ? 'This payroll is on hold. Remove the hold before adding an allowance.' : 'This payroll was moved into a later payroll. Open the later payroll to add an allowance.';
    } else if (!items.length) {
      status = 'unavailable'; reason = 'No quarterly allowance is set for this employee for these months. Check the employee profile.';
    }
    const claimedItems = claim?.quarterlyAdditions?.filter(item => item.quarter === quarter) ?? [];
    const entry = { status, earliestQuarter, canRemove: Boolean(claim && claim.id === record?.id && record.status === 'processing' && !record.rolledInto), claimedItems, employeeId: employee.id, employeeName: employee.name, requestId: record?.id, items, total: totalOf(claim ? claimedItems : items), eligible: status === 'eligible', reason, legacyWarning,
      history: (claim ? [claim] : conflicts).map(item => ({ id: item.id, periodStart: item.periodStart, status: item.status, additions: (item.additions || []).filter(addition => addition.label !== 'Bonus').map(addition => ({ label: addition.label, value: addition.value })) })),
    };
    return { ...entry, token: previewToken(entry, quarter) };
  });
}

export async function includeQuarterlyAdditions(db, periodStart, quarter, selections, actor) {
  await ensureQuarterlyIndex(db);
  const results = [];
  for (const selection of selections) {
    try {
      const result = await payrollTransaction(db, async transactionDb => {
        const payroll = await transactionDb.collection('payroll_requests').findOne({ id: selection.requestId });
        if (!payroll) return { requestId: selection.requestId, included: false, reason: 'Payroll not found.' };
        // Serialize profile changes, recurring calculations and quarterly inclusion.
        if (transactionDb.inPayrollTransaction) await transactionDb.collection('employees').updateOne({ id: payroll.employeeId }, { $inc: { payrollPolicyRevision: 1 } });
        const [entry] = await previewQuarterlyAdditions(transactionDb, periodStart, quarter, payroll.employeeId);
        if (!entry?.eligible || entry.requestId !== selection.requestId || entry.token !== selection.token) return { requestId: selection.requestId, included: false, reason: entry?.reason || 'The amounts changed. Review the preview again.' };
        const updated = await transactionDb.collection('payroll_requests').updateOne(
          { id: entry.requestId, employeeId: entry.employeeId, periodStart, status: 'processing', rolledInto: { $exists: false }, quarterlyKeys: { $ne: quarter } },
          {
            $addToSet: { quarterlyKeys: quarter },
            $push: { quarterlyAdditions: { $each: entry.items }, additions: { $each: entry.items } },
            $inc: { currentAmount: entry.total, amount: entry.total },
            $set: { quarterlyIncludedBy: actor, updatedAt: new Date() },
          },
        );
        return { requestId: entry.requestId, included: updated.modifiedCount === 1, reason: updated.modifiedCount === 1 ? '' : 'Payroll changed. Refresh and review it again.' };
      });
      results.push(result);
    } catch (error) {
      if (error.code !== 11000) throw error;
      results.push({ requestId: selection.requestId, included: false, reason: 'This quarter is already included in another payroll.' });
    }
  }
  return results;
}

export async function removeQuarterlyAdditions(db, requestId, quarter, actor) {
  const record = await db.collection('payroll_requests').findOne({ id: requestId, status: 'processing', rolledInto: { $exists: false }, quarterlyKeys: quarter });
  if (!record) return false;
  const items = (record.quarterlyAdditions || []).filter((item) => item.quarter === quarter);
  const result = await db.collection('payroll_requests').updateOne(
    { _id: record._id, status: 'processing', rolledInto: { $exists: false }, quarterlyKeys: quarter, quarterlyAdditions: record.quarterlyAdditions },
    { $pull: { quarterlyKeys: quarter, quarterlyAdditions: { quarter }, additions: { quarter } }, $inc: { currentAmount: -totalOf(items), amount: -totalOf(items) }, $set: { quarterlyUpdatedBy: actor, updatedAt: new Date() } },
  );
  return result.modifiedCount === 1;
}
