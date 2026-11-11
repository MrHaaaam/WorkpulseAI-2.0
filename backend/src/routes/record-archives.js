import { archiveCutoff, isArchivedRecord, recordArchiveDate } from '../../../shared/record-archives.js';
import { paidAdditionEntries } from '../../../shared/paid-additions.js';
import { leaveDateProgress } from '../../../shared/calendar-leave.js';
import { payrollTransaction } from '../payroll-transaction.js';

function archiveAccess(req) {
  const employee = req.auth?.accountType === 'employee';
  if (!employee && req.auth?.actor?.role !== 'admin') return null;
  if (employee && (!req.auth.actor.employeeId || req.params.kind === 'additions')) return null;
  return { employee, owner: employee ? `employee:${req.auth.actor.employeeId}` : 'admin', scope: employee ? { employeeId: req.auth.actor.employeeId } : {} };
}

function validRange(from, to) {
  const valid = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  return valid(from) && valid(to) && !(from && to && from > to);
}

function matchesFilters(rows, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase().slice(0, 200);
  const { status, type, from, to } = filters;
  return rows.filter(row => (!status || row.status === status) && (!type || row.type === type) && (!from || row.date >= from) && (!to || row.date <= to)
    && `${row.employeeName} ${row.employeeId} ${row.date} ${row.status} ${row.type} ${row.details} ${row.amount ?? ''}`.toLowerCase().includes(search));
}

async function archiveRows(db, kind, scope, owner) {
  const cutoff = archiveCutoff();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const normalize = (record, type, dateKind = kind) => ({
    id: `${type}:${record.id}`, employeeName: record.employeeName || '', employeeId: record.employeeId || '',
    date: recordArchiveDate(dateKind, record), type,
    status: kind === 'leave' ? leaveDateProgress(record, today).status : record.status || 'Recorded',
    amount: record.amount ?? record.total ?? null,
    details: kind === 'leave' ? `${record.leaveType || ''} · ${record.startDate} to ${record.endDate} · ${record.totalDays || 0} days · ${record.reason || ''}`
      : kind === 'additions' ? `${record.allowances.map(item => `${item.label}: ${item.value}`).join(', ')} · Payroll ${record.periodStart || ''}`
      : `${record.reason || record.note || ''}${record.adminNote ? ` · ${record.adminNote}` : ''}${record.periodStart ? ` · Payroll ${record.periodStart}` : ''}${record.startPeriod ? ` · Repayment starts ${record.startPeriod}` : ''}`,
  });
  let rows;
  if (kind === 'cash') {
    const [requests, advances, payroll] = await Promise.all([
      db.collection('cash_advance_requests').find(scope).toArray(),
      db.collection('cash_advances').find({ ...scope, reversedAt: { $exists: false } }).toArray(),
      db.collection('payroll_requests').find({ ...scope, status: 'paid', settledBy: { $exists: false }, advanceDeduction: { $gt: 0 } }).toArray(),
    ]);
    rows = [
      ...requests.filter(row => isArchivedRecord('cash', row, cutoff)).map(row => normalize(row, 'Request', 'cash')),
      ...advances.filter(row => isArchivedRecord('cash-given', row, cutoff)).map(row => normalize(row, 'Cash given', 'cash-given')),
      ...payroll.filter(row => isArchivedRecord('repayment', row, cutoff)).map(row => normalize({ ...row, amount: row.advanceDeduction }, 'Repayment', 'repayment')),
    ];
  } else {
    let records = await db.collection(kind === 'leave' ? 'leave_requests' : 'payroll_requests').find(scope).toArray();
    if (kind === 'additions') records = paidAdditionEntries(records, await db.collection('employees').find({}).toArray());
    rows = records.filter(row => isArchivedRecord(kind, row, cutoff)).map(row => normalize(row, kind === 'leave' ? 'Leave request' : kind === 'payroll' ? 'Payroll' : 'Salary addition'));
  }

  const deleted = await db.collection('archive_deleted_records').find({ owner, kind }).toArray();
  const deletedIds = new Set(deleted.map(row => row.rowId));
  return { rows: rows.filter(row => !deletedIds.has(row.id)), cutoff };
}

export function registerRecordArchives(router, getDb) {
  router.get('/record-archives/:kind', async (req, res) => {
    const kind = req.params.kind;
    if (!['leave', 'payroll', 'cash', 'additions'].includes(kind)) return res.status(400).json({ error: 'Unknown archive.' });
    const access = archiveAccess(req);
    if (!access) return res.status(403).json({ error: 'This archive is unavailable.' });
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const filters = Object.fromEntries(['search', 'status', 'type', 'from', 'to'].map(key => [key, String(req.query[key] || '')]));
    if (!validRange(filters.from, filters.to)) return res.status(400).json({ error: 'Choose a valid date range.' });
    try {
      const { rows: allRows, cutoff } = await archiveRows(getDb(), kind, access.scope, access.owner);
      const options = [...new Set(allRows.map(row => row.status))].sort();
      const types = [...new Set(allRows.map(row => row.type))].sort();
      const rows = matchesFilters(allRows, filters).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      const totalItems = rows.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / 10));
      const safePage = Math.min(page, totalPages);
      res.json({ items: rows.slice((safePage - 1) * 10, safePage * 10), cutoff, options, types, page: safePage, totalItems, totalPages, pageSize: 10 });
    } catch { res.status(500).json({ error: 'Unable to load archived records. Please try again.' }); }
  });

  router.post('/record-archives/:kind/delete', async (req, res) => {
    const kind = req.params.kind;
    if (!['leave', 'payroll', 'cash', 'additions'].includes(kind)) return res.status(400).json({ error: 'Unknown archive.' });
    const access = archiveAccess(req);
    if (!access) return res.status(403).json({ error: 'This archive is unavailable.' });
    const { ids, allMatching, excludedIds = [], filters = {} } = req.body || {};
    const validIds = value => Array.isArray(value) && value.length <= 500 && value.every(id => typeof id === 'string' && id.length <= 250);
    if (allMatching !== true && (!validIds(ids) || !ids.length) || !validIds(excludedIds) || typeof filters !== 'object' || filters === null || Array.isArray(filters)) return res.status(400).json({ error: 'Select archived records to delete.' });
    if (!validRange(String(filters.from || ''), String(filters.to || ''))) return res.status(400).json({ error: 'Choose a valid date range.' });
    try {
      const deleted = await payrollTransaction(getDb(), async db => {
        const { rows } = await archiveRows(db, kind, access.scope, access.owner);
        const selected = allMatching === true ? matchesFilters(rows, filters).filter(row => !excludedIds.includes(row.id)) : rows.filter(row => ids.includes(row.id));
        if (allMatching !== true && selected.length !== new Set(ids).size) { const error = new Error('Some selected records are unavailable or are not in your archive. Refresh and select again.'); error.status = 409; throw error; }
        for (const row of selected) {
          await db.collection('archive_deleted_records').updateOne({ _id: `${access.owner}:${kind}:${row.id}` }, { $setOnInsert: { owner: access.owner, kind, rowId: row.id, employeeId: row.employeeId, deletedAt: new Date(), deletedBy: req.auth.actor.email || req.auth.actor.employeeId || 'admin' } }, { upsert: true });
        }
        return selected.length;
      });
      res.locals ??= {};
      res.locals.auditMetadata = { archiveAction: 'deleted', archiveKind: kind, recordCount: deleted };
      res.json({ deleted });
    } catch (error) { res.status(error.status || 500).json({ error: error.status === 409 ? error.message : 'Unable to delete archived records. Please refresh and try again.' }); }
  });
}
