import { archiveCutoff, isArchivedRecord, recordArchiveDate } from '../../../shared/record-archives.js';
import { paidAdditionEntries } from '../../../shared/paid-additions.js';
import { leaveDateProgress } from '../../../shared/calendar-leave.js';

export function registerRecordArchives(router, getDb) {
  router.get('/record-archives/:kind', async (req, res) => {
    const kind = req.params.kind;
    const employee = req.auth?.accountType === 'employee';
    if (!['leave', 'payroll', 'cash', 'additions'].includes(kind)) return res.status(400).json({ error: 'Unknown archive.' });
    if (!employee && req.auth?.actor?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
    if (employee && (!req.auth.actor.employeeId || kind === 'additions')) return res.status(403).json({ error: 'This archive is unavailable.' });
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const search = String(req.query.search || '').trim().toLowerCase().slice(0, 200);
    const status = String(req.query.status || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if ([from, to].some(value => value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) || (from && to && from > to)) return res.status(400).json({ error: 'Choose a valid date range.' });
    try {
      const db = getDb();
      const scope = employee ? { employeeId: req.auth.actor.employeeId } : {};
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
      const options = [...new Set(rows.map(row => row.status))].sort();
      const types = [...new Set(rows.map(row => row.type))].sort();
      const type = String(req.query.type || '');
      rows = rows.filter(row => (!status || row.status === status) && (!type || row.type === type) && (!from || row.date >= from) && (!to || row.date <= to)
        && `${row.employeeName} ${row.employeeId} ${row.date} ${row.status} ${row.type} ${row.details} ${row.amount ?? ''}`.toLowerCase().includes(search));
      rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      const totalItems = rows.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / 10));
      const safePage = Math.min(page, totalPages);
      res.json({ items: rows.slice((safePage - 1) * 10, safePage * 10), cutoff, options, types, page: safePage, totalItems, totalPages, pageSize: 10 });
    } catch { res.status(500).json({ error: 'Unable to load archived records. Please try again.' }); }
  });
}
