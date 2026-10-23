import { useEffect, useState } from 'react';
import { Archive, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Button } from './ui/Button';
import { Dialog, DialogClose, DialogHeader } from './ui/Dialog';
import { Input } from './ui/Input';
import { PaginationControls } from './ui/Pagination';
import { RecordFilters } from './ui/RecordFilters';

type Kind = 'leave' | 'cash' | 'payroll' | 'additions';
type ArchiveRow = { id: string; employeeId: string; employeeName: string; date: string; type: string; status: string; amount: number | null; details: string };
type Result = { items: ArchiveRow[]; cutoff: string; options: string[]; types: string[]; page: number; totalItems: number; totalPages: number; pageSize: number };
const formatDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });

export function RecordArchives({ kind, title, employee = false, onViewPayroll }: { kind: Kind; title: string; employee?: boolean; onViewPayroll?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`View ${title.toLowerCase()} archives`}><Archive className="h-4 w-4" />Archives</Button>{open && <ArchiveDialog kind={kind} title={title} employee={employee} onViewPayroll={onViewPayroll} onClose={() => setOpen(false)} />}</>;
}

function ArchiveDialog({ kind, title, employee, onClose, onViewPayroll }: { kind: Kind; title: string; employee: boolean; onClose: () => void; onViewPayroll?: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([search, filter, type, from, to, page, revision]);
  const [response, setResponse] = useState<{ key: string; data?: Result; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ search, status: filter, type, from, to, page: String(page) });
      void apiFetch(`/api/record-archives/${kind}?${params}`, { signal: controller.signal }).then(async result => {
        const data = await result.json();
        if (!result.ok) throw new Error(data.error || 'Unable to load archives.');
        if (!controller.signal.aborted) setResponse({ key, data });
      }).catch(error => { if (!controller.signal.aborted) setResponse({ key, error: error instanceof Error ? error.message : 'Unable to load archives.' }); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, search, filter, type, from, to, page, revision, key]);
  const loading = response?.key !== key;
  const data = response?.data;
  const reset = (set: (value: string) => void) => (value: string) => { set(value); setPage(1); };
  return <Dialog open onClose={onClose} className="max-w-6xl"><DialogHeader><div><h2 className="text-lg font-bold text-slate-900">{title} archives</h2><p className="mt-1 text-sm text-slate-500">Records three calendar months old or older{data?.cutoff ? ` — dated ${formatDate(data.cutoff)} or earlier` : ''}. Older unresolved items also remain in the active list.</p></div><DialogClose onClose={onClose} /></DialogHeader>
    <div className="space-y-4 px-4 pb-6 sm:px-6">
      <RecordFilters label={`${title.toLowerCase()} archives`} search={search} setSearch={reset(setSearch)} filter={filter} setFilter={reset(setFilter)} options={data?.options || []} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">From<Input type="date" aria-label="Archive start date" value={from} max={to || data?.cutoff} onChange={event => reset(setFrom)(event.target.value)} /></label>
        <label className="text-sm text-slate-600">To<Input type="date" aria-label="Archive end date" value={to} min={from} max={data?.cutoff} onChange={event => reset(setTo)(event.target.value)} /></label>
        {kind === 'cash' && <select aria-label="Archive record type" value={type} onChange={event => reset(setType)(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All record types</option>{(data?.types || []).map(value => <option key={value}>{value}</option>)}</select>}
        {(from || to || type) && <Button type="button" size="sm" variant="outline" onClick={() => { setFrom(''); setTo(''); setType(''); setPage(1); }}>Clear date/type filters</Button>}
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw className="h-4 w-4" />Refresh</Button>
      </div>
      <div role="status" aria-live="polite" className="text-sm text-slate-500">{loading ? 'Loading archived records...' : response?.error || `${data?.totalItems || 0} archived records found`}</div>
      {!loading && response?.error && <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Try again</Button>}
      {!loading && !response?.error && <><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[650px] text-left text-sm"><caption className="sr-only">{title} archived records</caption><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{!employee && <th scope="col" className="p-3">Employee</th>}<th scope="col" className="p-3">Date</th><th scope="col" className="p-3">Type</th><th scope="col" className="p-3">Status</th>{kind !== 'leave' && <th scope="col" className="p-3">Amount</th>}<th scope="col" className="p-3">Details</th></tr></thead><tbody>{data?.items.map(row => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">{!employee && <td className="p-3"><p className="font-semibold text-slate-900">{row.employeeName}</p><p className="text-xs text-slate-500">{row.employeeId}</p></td>}<td className="whitespace-nowrap p-3">{formatDate(row.date)}</td><td className="p-3">{row.type}</td><td className="p-3 capitalize">{row.status.replaceAll('_', ' ')}</td>{kind !== 'leave' && <td className="whitespace-nowrap p-3">{row.amount == null ? '—' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(row.amount)}</td>}<td className="max-w-md whitespace-pre-wrap break-words p-3 text-slate-600">{row.details}{kind === 'payroll' && onViewPayroll && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { onClose(); onViewPayroll(row.id.slice("Payroll:".length)); }}>View payslip</Button>}</td></tr>)}</tbody></table>{!data?.items.length && <p className="p-10 text-center text-sm text-slate-500">No archived records match these filters.</p>}</div>{data && <PaginationControls {...data} onPageChange={setPage} />}</>}
    </div>
  </Dialog>;
}
