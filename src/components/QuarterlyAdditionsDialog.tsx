import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { quarterForDate, quarterLabel } from '../../shared/quarterly-additions.js';
import { apiFetch } from '../lib/api';
import { Dialog, DialogClose, DialogHeader } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

type ReviewStatus = 'eligible' | 'included' | 'paid' | 'attention' | 'unavailable';
const statusNames: Record<ReviewStatus, string> = { eligible: 'Ready to add', included: 'Already in payroll', paid: 'Already paid', attention: 'Check older payroll', unavailable: 'Cannot add yet' };

type Entry = {
  status: ReviewStatus; earliestQuarter: string;
  history: { id: string; periodStart: string; status: string; additions: { label: string; value: number }[] }[];
  employeeId: string; employeeName: string; requestId?: string; token: string;
  items: { label: string; value: number }[]; claimedItems: { label: string; value: number }[];
  total: number; eligible: boolean; reason: string; legacyWarning: boolean; canRemove: boolean;
};
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(value);

const payrollStatusNames: Record<string, string> = {
  processing: 'Not paid yet', rejected: 'Payment on hold', carried_over: 'Moved to carried balance', paid: 'Marked as paid', approved: 'Marked as paid',
};
function displayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Date not recorded';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function allowanceStatus(entry: Entry) {
  if (entry.status === 'attention' && entry.history.length && entry.history.every(record => record.status === 'carried_over')) return 'In carried balance';
  return statusNames[entry.status];
}
function allowanceExplanation(entry: Entry) {
  if (entry.status !== 'attention') return entry.reason;
  const carried = entry.history.some(record => record.status === 'carried_over');
  const paid = entry.history.some(record => ['paid', 'approved'].includes(record.status));
  if (carried && !paid && entry.history.every(record => record.status === 'carried_over')) return "These older allowance amounts were moved into a later payroll's carried balance. They are not marked as paid. You cannot add another allowance until the older amounts are checked.";
  if (paid && entry.history.every(record => ['paid', 'approved'].includes(record.status))) return 'Older payrolls already contain allowance amounts marked as paid. Check which months those payments covered before adding another allowance.';
  if (carried || paid) return 'Older payrolls already contain allowance amounts. Some may be in carried balance or marked as paid. Check the amounts below before adding another allowance.';
  return 'Older unpaid payrolls already contain allowance amounts. Check which months they cover so the employee is not paid twice.';
}

export function QuarterlyAdditionsDialog({ period, onClose, onChanged }: { period: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [year, setYear] = useState(period.slice(0, 4));
  const [quarterNumber, setQuarterNumber] = useState(quarterForDate(period).slice(-1));
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const quarter = `${year}-Q${quarterNumber}`;
  const eligible = (entries ?? []).filter(entry => entry.eligible && entry.requestId);
  const total = eligible.filter(entry => selected.includes(entry.requestId!)).reduce((sum, entry) => sum + entry.total, 0);
  const filtered = (entries ?? []).filter(entry => (filter === 'all' || entry.status === filter) && `${entry.employeeName} ${entry.employeeId}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const displayedPage = Math.min(page, pageCount);
  const shown = filtered.slice((displayedPage - 1) * 8, displayedPage * 8);
  const shownEligible = shown.filter(entry => entry.eligible && entry.requestId);
  const validYear = /^20\d{2}$/.test(year) && year <= period.slice(0, 4);
  const isPast = quarter < quarterForDate(period);
  const resetPreview = () => { setPage(1); setEntries(null); setSelected([]); setError(''); setMessage(''); };

  async function request(action: string, body: object) {
    const response = await apiFetch(`/api/payroll-requests/quarterly-additions/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update quarterly additions.');
    return data;
  }

  async function preview() {
    setBusy(true); setError(''); setMessage(''); setEntries(null); setSelected([]);
    try {
      const data = await request('preview', { periodStart: period, quarter });
      setEntries(data.entries); setPage(1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load the preview.'); }
    finally { setBusy(false); }
  }

  async function update(action: 'include' | 'remove', requestId?: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const selections = eligible.filter(entry => selected.includes(entry.requestId!)).map(entry => ({ requestId: entry.requestId, token: entry.token }));
      const data = await request(action, { periodStart: period, quarter, selections, requestId });
      setMessage(action === 'remove' ? 'Allowance removed from this unpaid payroll.' : `Added to payroll for ${data.included} employee(s). They have not been marked as paid.`);
      if (data.results?.some((item: { included: boolean }) => !item.included)) setError('Some allowances could not be added because payroll changed. Check the updated employee list below.');
      await onChanged();
      const updated = await request('preview', { periodStart: period, quarter });
      setEntries(updated.entries); setSelected([]); setPage(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update additions.');
      setEntries(null); setSelected([]);
      await onChanged().catch(() => undefined);
    } finally { setBusy(false); }
  }

  return <Dialog open onClose={() => !busy && onClose()} className="flex h-[94svh] max-w-5xl flex-col overflow-hidden sm:h-[88vh]">
    <DialogHeader><div><h3 className="text-lg font-bold text-slate-900">Add quarterly allowances</h3><p className="mt-1 text-sm text-slate-500">Add extra pay for a 3-month period to the payroll starting {displayDate(period)}.</p></div><DialogClose onClose={() => !busy && onClose()} /></DialogHeader>
    <div className="shrink-0 space-y-3 border-b border-slate-200 px-4 pb-4 pt-2 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs font-semibold text-slate-600">Year<Input className="w-24" inputMode="numeric" maxLength={4} value={year} disabled={busy} onChange={event => { setYear(event.target.value.replace(/\D/g, '').slice(0, 4)); resetPreview(); }} /></label>
        <label className="min-w-44 flex-1 space-y-1 text-xs font-semibold text-slate-600">Months covered<Select value={quarterNumber} disabled={busy} onChange={event => { setQuarterNumber(event.target.value); resetPreview(); }}>{['1', '2', '3', '4'].map((value, index) => <option key={value} value={value} disabled={year === period.slice(0, 4) && value > quarterForDate(period).slice(-1)}>{['January - March', 'April - June', 'July - September', 'October - December'][index]}</option>)}</Select></label>
        <Button variant="outline" disabled={busy || !validYear || quarter > quarterForDate(period)} onClick={() => void preview()}>{busy ? 'Please wait...' : 'Show employees'}</Button>
      </div>
      <p className="text-xs leading-5 text-slate-500">{isPast ? 'You chose an earlier 3-month period. Add an allowance only if it is still owed.' : 'Choose employees marked Ready to add. This adds their allowance to payroll; it does not mark them as paid.'}</p>
      {entries && <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label="Search employee name or ID" className="pl-9" placeholder="Search employee name or ID" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        <Select className="sm:w-60" aria-label="Filter allowance status" value={filter} onChange={event => { setFilter(event.target.value as ReviewStatus | 'all'); setPage(1); }}><option value="all">All employees ({entries.length})</option>{(Object.keys(statusNames) as ReviewStatus[]).map(status => <option key={status} value={status}>{statusNames[status]} ({entries.filter(entry => entry.status === status).length})</option>)}</Select>
      </div>}
      {entries && <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><label className="flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" disabled={busy || !shownEligible.length} checked={shownEligible.length > 0 && shownEligible.every(entry => selected.includes(entry.requestId!))} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, ...shownEligible.map(entry => entry.requestId!)])].slice(0, 500) : current.filter(id => !shownEligible.some(entry => entry.requestId === id)))} />Select everyone ready to add on this page ({shownEligible.length})</label><button type="button" className="font-semibold text-amber-800 hover:underline" onClick={() => { setFilter('attention'); setPage(1); }}>Check older payroll ({entries.filter(entry => entry.status === 'attention').length})</button></div>}
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:px-6">
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {!entries && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm leading-6 text-slate-500">Choose the months and click Show employees.<br />You will see who can receive an allowance and why others cannot be selected.</div>}
      {entries && !shown.length && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No employees match this list. Choose All employees or change your search.</p>}
      {shown.map(entry => <article key={entry.employeeId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">{entry.eligible && <input aria-label={`Select ${entry.employeeName}`} className="mt-1 h-4 w-4 shrink-0" type="checkbox" disabled={busy || !entry.eligible || (selected.length >= 500 && !selected.includes(entry.requestId!))} checked={Boolean(entry.requestId && selected.includes(entry.requestId))} onChange={event => setSelected(current => event.target.checked ? [...current, entry.requestId!] : current.filter(id => id !== entry.requestId))} />}
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-slate-900">{entry.employeeName}</p><p className="text-xs text-slate-500">{entry.employeeId}</p></div><div className="text-right"><p className="text-[11px] text-slate-500">{entry.claimedItems.length ? "Already added" : "Allowance amount"}</p><p className="font-bold text-slate-900">{money(entry.total)}</p><span className={`text-xs font-semibold ${entry.status === 'eligible' ? 'text-emerald-700' : entry.status === 'attention' ? 'text-amber-800' : 'text-slate-500'}`}>{allowanceStatus(entry)}</span></div></div>
          <div className="mt-3 space-y-1">{(entry.claimedItems.length ? entry.claimedItems : entry.items).map(item => <p key={item.label} className="flex flex-wrap justify-between gap-x-4 text-sm text-slate-600"><span>{item.label}</span><span>{money(item.value)}</span></p>)}</div>
          {entry.reason && <p className={`mt-3 text-xs leading-5 ${entry.status === 'attention' ? 'text-amber-800' : 'text-slate-500'}`}>{allowanceExplanation(entry)}</p>}
          {entry.history.length > 0 && <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-violet-700">See amounts already in payroll</summary><div className="mt-2 space-y-2">{entry.history.map(record => <div key={record.id} className="rounded-lg bg-slate-50 p-2"><p className="font-semibold">Payroll starting {displayDate(record.periodStart)}</p><p className="mt-1 font-medium text-slate-600">{payrollStatusNames[record.status] ?? "Check payment status"}</p>{record.additions.map((item, index) => <p key={index}>{item.label}: {money(item.value)}</p>)}</div>)}</div></details>}
          {entry.canRemove && <button type="button" disabled={busy} onClick={() => void update('remove', entry.requestId)} className="mt-3 text-xs font-semibold text-rose-700 disabled:opacity-50">Remove this allowance from payroll</button>}
          {entry.status === 'attention' && <p className="mt-2 text-xs text-slate-500">Next step: ask the person who handles payroll to check these older amounts and confirm which months they cover.</p>}
          </div>
        </div>
      </article>)}
    </div>
    <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
      {entries && <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{filtered.length} matching employees - page {displayedPage} of {pageCount}</span><div className="flex gap-2"><Button size="sm" variant="outline" aria-label="Previous employee page" disabled={displayedPage <= 1 || busy} onClick={() => setPage(displayedPage - 1)}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" aria-label="Next employee page" disabled={displayedPage >= pageCount || busy} onClick={() => setPage(displayedPage + 1)}><ChevronRight size={14} /></Button></div></div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">{selected.length} employees selected - {money(total)} to add</p><p className="mt-1 text-xs text-slate-500">{validYear ? quarterLabel(quarter) : 'Select a valid year'}{selected.length > 0 && <button type="button" disabled={busy} className="ml-3 font-semibold text-violet-700" onClick={() => setSelected([])}>Clear selection</button>}</p></div><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button><Button disabled={busy || !selected.length || !entries} onClick={() => void update('include')}>Add to payroll</Button></div></div>
    </div>
  </Dialog>;
}
