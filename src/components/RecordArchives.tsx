import { useEffect, useState } from 'react';
import { Archive, RefreshCw, CalendarDays, FileText, WalletCards, CircleCheck, CircleX, Clock3, Ban, ArrowUpRight, SlidersHorizontal, SearchX, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Button } from './ui/Button';
import { Dialog, DialogClose, DialogHeader } from './ui/Dialog';
import { Input } from './ui/Input';
import { PaginationControls } from './ui/Pagination';
import { RecordFilters } from './ui/RecordFilters';
import { useToast } from './ui/Toast';

type Kind = 'leave' | 'cash' | 'payroll' | 'additions';
type ArchiveRow = { id: string; employeeId: string; employeeName: string; date: string; type: string; status: string; amount: number | null; details: string };
type Result = { items: ArchiveRow[]; cutoff: string; options: string[]; types: string[]; page: number; totalItems: number; totalPages: number; pageSize: number };
const formatDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });

const archiveThemes = {
  leave: { icon: CalendarDays, header: 'from-violet-100 via-violet-50 to-white', iconStyle: 'bg-violet-600 shadow-violet-200', accent: 'text-violet-700', tint: 'bg-violet-50 text-violet-700 ring-violet-200', table: 'bg-violet-50/80 text-violet-800', hover: 'hover:bg-violet-50/40' },
  payroll: { icon: FileText, header: 'from-emerald-100 via-emerald-50 to-white', iconStyle: 'bg-emerald-600 shadow-emerald-200', accent: 'text-emerald-700', tint: 'bg-emerald-50 text-emerald-700 ring-emerald-200', table: 'bg-emerald-50/80 text-emerald-800', hover: 'hover:bg-emerald-50/40' },
  cash: { icon: WalletCards, header: 'from-sky-100 via-sky-50 to-white', iconStyle: 'bg-sky-600 shadow-sky-200', accent: 'text-sky-700', tint: 'bg-sky-50 text-sky-700 ring-sky-200', table: 'bg-sky-50/80 text-sky-800', hover: 'hover:bg-sky-50/40' },
  additions: { icon: WalletCards, header: 'from-amber-100 via-amber-50 to-white', iconStyle: 'bg-amber-600 shadow-amber-200', accent: 'text-amber-700', tint: 'bg-amber-50 text-amber-700 ring-amber-200', table: 'bg-amber-50/80 text-amber-800', hover: 'hover:bg-amber-50/40' },
};

function ArchiveStatus({ value }: { value: string }) {
  const status = value.toLowerCase();
  const good = ['paid', 'approved', 'accepted', 'disbursed', 'recorded'].includes(status);
  const bad = ['rejected', 'failed'].includes(status);
  const cancelled = ['cancelled', 'passed', 'carried_over'].includes(status);
  const Icon = good ? CircleCheck : bad ? CircleX : cancelled ? Ban : Clock3;
  const label = ({ processing: 'Unpaid', rejected: 'Declined', disbursed: 'Cash given', carried_over: 'Carried forward' } as Record<string, string>)[status] || value.replaceAll('_', ' ');
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${good ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : bad ? 'bg-rose-50 text-rose-700 ring-rose-200' : cancelled ? 'bg-slate-100 text-slate-600 ring-slate-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}><Icon aria-hidden="true" className="h-3.5 w-3.5" />{label}</span>;
}

export function RecordArchives({ kind, title, employee = false, onViewPayroll }: { kind: Kind; title: string; employee?: boolean; onViewPayroll?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" size="sm" variant="outline" className="border-violet-200 bg-violet-50/60 text-violet-700 hover:border-violet-300 hover:bg-violet-100" onClick={() => setOpen(true)} aria-label={`View ${title.toLowerCase()} archives`}><Archive className="h-4 w-4" />Archives</Button>{open && <ArchiveDialog kind={kind} title={title} employee={employee} onViewPayroll={onViewPayroll} onClose={() => setOpen(false)} />}</>;
}

function ArchiveDialog({ kind, title, employee, onClose, onViewPayroll }: { kind: Kind; title: string; employee: boolean; onClose: () => void; onViewPayroll?: (id: string) => void }) {
  const { toast } = useToast();
  const [selection, setSelection] = useState<{ key: string; all: boolean; ids: string[] }>({ key: '', all: false, ids: [] });
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; allMatching: boolean; excludedIds: string[]; filters: { search: string; status: string; type: string; from: string; to: string }; count: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
  const selectionKey = JSON.stringify([search, filter, type, from, to]);
  const currentSelection = selection.key === selectionKey ? selection : { key: selectionKey, all: false, ids: [] };
  const selectedCount = currentSelection.all ? Math.max(0, (data?.totalItems || 0) - currentSelection.ids.length) : currentSelection.ids.length;
  const isSelected = (id: string) => currentSelection.all ? !currentSelection.ids.includes(id) : currentSelection.ids.includes(id);
  const allPageSelected = Boolean(data?.items.length) && Boolean(data?.items.every(row => isSelected(row.id)));
  const toggleRows = (ids: string[], checked: boolean) => {
    const remove = currentSelection.all ? checked : !checked;
    setSelection({ ...currentSelection, ids: remove ? currentSelection.ids.filter(id => !ids.includes(id)) : [...new Set([...currentSelection.ids, ...ids])] });
  };
  const selectionDisabled = loading || deleting || Boolean(pendingDelete);
  async function deleteSelected() {
    if (!pendingDelete || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      const result = await apiFetch(`/api/record-archives/${kind}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingDelete) });
      const body = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(body.error || 'Unable to delete archived records.');
      setSelection({ key: selectionKey, all: false, ids: [] }); setPendingDelete(null);
      setRevision(value => value + 1);
      toast({ title: 'Archived records deleted', description: `${body.deleted} records removed from ${employee ? 'your' : 'the admin'} archive.`, variant: 'success' });
    } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Unable to delete archived records.'); }
    finally { setDeleting(false); }
  }
  const theme = archiveThemes[kind];
  const Icon = theme.icon;
  return <Dialog open onClose={() => { if (!deleting) onClose(); }} className="max-w-6xl overflow-y-auto border-white bg-slate-50">
    <div className={`border-b border-slate-200/70 bg-gradient-to-r ${theme.header}`}><DialogHeader><div className="flex items-start gap-3 sm:gap-4"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-lg ${theme.iconStyle}`}><Icon aria-hidden="true" className="h-6 w-6" /></span><div><p className={`text-[10px] font-bold uppercase tracking-[.2em] ${theme.accent}`}>Record library</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title} archives</h2><p className="mt-1.5 max-w-xl text-xs leading-5 text-slate-600 sm:text-sm">Records three calendar months old or older. Older unresolved items also remain in the active list.</p></div></div>{!deleting && <DialogClose onClose={onClose} />}</DialogHeader>
      <div className="grid grid-cols-2 gap-3 px-4 pb-5 pt-2 sm:grid-cols-3 sm:px-6">
        <div className="rounded-xl border border-white bg-white/85 px-4 py-3 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Matching records</p><p className={`mt-1 text-2xl font-bold tabular-nums ${theme.accent}`}>{loading ? '?' : data?.totalItems ?? 0}</p></div>
        <div className="rounded-xl border border-white bg-white/85 px-4 py-3 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Archived through</p><p className="mt-2 text-sm font-bold text-slate-800">{data?.cutoff ? formatDate(data.cutoff) : '?'}</p></div>
        <div className="col-span-2 flex items-center justify-between rounded-xl border border-white bg-white/85 px-4 py-3 shadow-sm sm:col-span-1 sm:block"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{employee ? 'Your personal records' : 'Employee records'}</p><p className="mt-0 text-sm font-bold text-slate-800 sm:mt-2">Page {data?.page || 1} <span className="font-normal text-slate-400">of {data?.totalPages || 1}</span></p></div>
      </div>
    </div>
    <div className="space-y-4 px-4 pb-6 pt-5 sm:px-6">
      <fieldset disabled={deleting || Boolean(pendingDelete)} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className={`h-4 w-4 ${theme.accent}`} /><p className="text-xs font-bold text-slate-700">Find archived records</p></div>
        <RecordFilters label={`${title.toLowerCase()} archives`} search={search} setSearch={reset(setSearch)} filter={filter} setFilter={reset(setFilter)} options={data?.options || []} />
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <label className="min-w-0 flex-1 space-y-1.5 text-[11px] font-semibold text-slate-500 sm:flex-none">From<Input type="date" aria-label="Archive start date" value={from} max={to || data?.cutoff} onChange={event => reset(setFrom)(event.target.value)} className="bg-slate-50/70" /></label>
          <label className="min-w-0 flex-1 space-y-1.5 text-[11px] font-semibold text-slate-500 sm:flex-none">To<Input type="date" aria-label="Archive end date" value={to} min={from} max={data?.cutoff} onChange={event => reset(setTo)(event.target.value)} className="bg-slate-50/70" /></label>
          {kind === 'cash' && <select aria-label="Archive record type" value={type} onChange={event => reset(setType)(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-slate-50/70 px-3 text-sm"><option value="">All record types</option>{(data?.types || []).map(value => <option key={value}>{value}</option>)}</select>}
          {(from || to || type) && <Button type="button" size="sm" variant="outline" onClick={() => { setFrom(''); setTo(''); setType(''); setPage(1); }}>Clear date/type filters</Button>}
          <Button type="button" size="sm" variant="outline" className="sm:ml-auto" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
        </div>
      </fieldset>
      <div className={`flex flex-wrap items-center gap-2 rounded-xl p-3 ring-1 ring-inset ${theme.tint}`}>
        <span role="status" aria-live="polite" className="mr-1 text-xs font-bold">{selectedCount} records selected</span>
        <Button type="button" size="sm" variant="outline" disabled={selectionDisabled || !data?.totalItems} onClick={() => setSelection({ key: selectionKey, all: true, ids: [] })}>Select all records ({data?.totalItems || 0})</Button>
        <Button type="button" size="sm" variant="outline" disabled={selectionDisabled || !selectedCount} onClick={() => setSelection({ key: selectionKey, all: false, ids: [] })}>Clear selection</Button>
        <Button type="button" size="sm" variant="destructive" disabled={selectionDisabled || !selectedCount} onClick={() => { setDeleteError(''); setPendingDelete({ ids: currentSelection.all ? [] : currentSelection.ids, allMatching: currentSelection.all, excludedIds: currentSelection.all ? currentSelection.ids : [], filters: { search, status: filter, type, from, to }, count: selectedCount }); }}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Delete selected ({selectedCount})</Button>
        <p className="w-full text-[11px] font-normal opacity-80">Select all includes every record matching these filters across all pages.</p>
      </div>
      {pendingDelete && <div role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-sm font-bold text-rose-900">Delete {pendingDelete.count} archived records?</p><p className="text-xs leading-5 text-rose-700">These entries will be removed from {employee ? 'your personal archive. The admin?s archive is unaffected.' : 'the admin archive. Employee archives are unaffected.'} Original records remain available for attendance, payroll, and balance calculations.</p>{deleteError && <p className="text-xs font-semibold text-rose-800">{deleteError}</p>}<div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={deleting} onClick={() => { setPendingDelete(null); setDeleteError(''); }}>Cancel deletion</Button><Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={() => void deleteSelected()}>{deleting ? 'Deleting...' : 'Confirm deletion'}</Button></div></div>}
      <div role="status" aria-live="polite" className={`flex items-center gap-2 px-1 text-xs font-medium ${response?.error && !loading ? 'text-rose-700' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${response?.error && !loading ? 'bg-rose-500' : loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-500'}`} />{loading ? 'Loading archived records...' : response?.error || `${data?.totalItems || 0} archived records found`}</div>
      {!loading && response?.error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><p className="mb-3 text-sm font-medium text-rose-800">We couldn?t load your archives.</p><Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Try again</Button></div>}
      {loading && <div aria-hidden="true" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{[0, 1, 2, 3].map(index => <div key={index} className="flex animate-pulse items-center gap-4 border-b border-slate-100 py-3 last:border-0"><div className="h-10 w-10 rounded-xl bg-slate-100" /><div className="h-3 w-1/3 rounded bg-slate-100" /><div className="ml-auto h-6 w-20 rounded-full bg-slate-100" /></div>)}</div>}
      {!loading && !response?.error && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="max-h-[46vh] overflow-auto"><table className="w-full min-w-[700px] text-left text-sm"><caption className="sr-only">{title} archived records</caption><thead className={`sticky top-0 z-10 text-[10px] uppercase tracking-wider shadow-sm ${theme.table}`}><tr><th scope="col" className="w-12 px-4 py-3.5"><input type="checkbox" aria-label="Select archived records on this page" disabled={selectionDisabled} checked={allPageSelected} ref={input => { if (input) input.indeterminate = !allPageSelected && Boolean(data?.items.some(row => isSelected(row.id))); }} onChange={event => toggleRows(data?.items.map(row => row.id) || [], event.target.checked)} className="h-4 w-4 accent-violet-600" /></th>{!employee && <th scope="col" className="px-5 py-3.5 font-bold">Employee</th>}<th scope="col" className="px-5 py-3.5 font-bold">Date</th><th scope="col" className="px-5 py-3.5 font-bold">Type</th><th scope="col" className="px-5 py-3.5 font-bold">Status</th>{kind !== 'leave' && <th scope="col" className="px-5 py-3.5 text-right font-bold">Amount</th>}<th scope="col" className="px-5 py-3.5 font-bold">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{data?.items.map(row => <tr key={row.id} className={`transition-colors ${isSelected(row.id) ? 'bg-violet-50/80' : 'even:bg-slate-50/40'} ${theme.hover}`}><td className="px-4 py-4"><input type="checkbox" aria-label={`Select archived record ${row.id}`} checked={isSelected(row.id)} disabled={selectionDisabled} onChange={event => toggleRows([row.id], event.target.checked)} className="h-4 w-4 accent-violet-600" /></td>{!employee && <td className="px-5 py-4"><div className="flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold ring-1 ring-inset ${theme.tint}`}>{(row.employeeName || row.employeeId).split(/\s+/).map(part => part[0]).join('').slice(0, 2)}</span><div><p className="whitespace-nowrap font-semibold text-slate-900">{row.employeeName || 'Employee'}</p><p className="mt-0.5 text-[11px] text-slate-400">{row.employeeId}</p></div></div></td>}<td className="whitespace-nowrap px-5 py-4"><div className="flex items-center gap-2 text-xs font-medium text-slate-600"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />{formatDate(row.date)}</div></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-inset ${theme.tint}`}><Icon aria-hidden="true" className="h-3.5 w-3.5" />{row.type}</span></td><td className="px-5 py-4"><ArchiveStatus value={row.status} /></td>{kind !== 'leave' && <td className="whitespace-nowrap px-5 py-4 text-right font-bold tabular-nums text-slate-900">{row.amount == null ? '?' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(row.amount)}</td>}<td className="min-w-56 max-w-sm px-5 py-4"><p className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">{row.details}</p>{kind === 'payroll' && onViewPayroll && <Button type="button" size="sm" variant="outline" className="mt-2 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={() => { onClose(); onViewPayroll(row.id.slice('Payroll:'.length)); }}>View payslip<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Button>}</td></tr>)}</tbody></table>{!data?.items.length && <div className="flex flex-col items-center px-6 py-12 text-center"><span className={`mb-3 grid h-14 w-14 place-items-center rounded-2xl ring-1 ring-inset ${theme.tint}`}><SearchX aria-hidden="true" className="h-6 w-6" /></span><p className="font-semibold text-slate-800">No archived records match these filters.</p><p className="mt-1 text-xs text-slate-500">Try a different search, status, or date range.</p></div>}</div>{data && <PaginationControls {...data} onPageChange={value => { if (!deleting && !pendingDelete) setPage(value); }} />}</div>}
    </div>
  </Dialog>;
}
