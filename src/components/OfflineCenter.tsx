import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudCheck, CloudOff, Loader2, RefreshCw, WifiOff, Search, Plus, FileClock, Filter } from 'lucide-react';
import { apiFetch, apiNetworkFetch, storeSession } from '../lib/api';
import { connectionChanged, deleteOfflineItem, isOffline, offlineItems, offlineOwner, queueOffline, updateOfflineItem, type OfflineItem } from '../lib/offline';
import { Dialog, DialogClose, DialogHeader } from './ui/Dialog';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

const manilaDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const manilaTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
export function OfflineCenter() {
  const { toast } = useToast();
  const [items, setItems] = useState<OfflineItem[]>([]); const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(isOffline()); const [storageError, setStorageError] = useState('');
  const [busy, setBusy] = useState(false); const syncing = useRef(false); const [password, setPassword] = useState('');
  const [employeeId, setEmployeeId] = useState(''); const [date, setDate] = useState(manilaDate());
  const [checkIn, setCheckIn] = useState(''); const [checkOut, setCheckOut] = useState(''); const [reason, setReason] = useState('Internet outage; attendance verified by administrator.');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [recordDate, setRecordDate] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [role, setRole] = useState(sessionStorage.getItem('workpulse_role') || '');
  const [now, setNow] = useState(Date.now);
  const [shellReady, setShellReady] = useState(Boolean(navigator.serviceWorker?.controller));
  const refresh = useCallback(async () => {
    setOffline(isOffline()); setRole(sessionStorage.getItem('workpulse_role') || '');
    setNow(Date.now());
    const owner = offlineOwner();
    try { const records = owner ? await offlineItems() : []; if (owner !== offlineOwner()) return; setItems(records); setStorageError(''); }
    catch (cause) { setStorageError(cause instanceof Error ? cause.message : 'Unable to read local storage.'); }
  }, []);
  const pending = items.filter(item => item.status !== 'synced');
  const sync = useCallback(async (includeAttendance = false) => {
    if (syncing.current || !navigator.onLine || !offlineOwner()) return;
    syncing.current = true; setBusy(true);
    const owner = offlineOwner(); let saved = 0; let rejected = 0;
    try {
      const sessionResponse = await apiNetworkFetch('/api/auth/session');
      const session = await sessionResponse.json();
      if (!sessionResponse.ok || !session.offlineOwner || session.offlineOwner !== owner) throw new Error('Sign into the same account before synchronizing these records.');
      storeSession(session); connectionChanged(true);
      const records = (await offlineItems()).filter(item => item.status === 'pending' && (item.kind !== 'attendance' || includeAttendance));
      for (const item of records) {
        if (offlineOwner() !== owner) break;
        const attemptedItem = { ...item, attemptedAt: new Date().toISOString() };
        await updateOfflineItem(attemptedItem);
        const response = await apiNetworkFetch('/api/offline/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: { id: item.id, kind: item.kind, payload: item.payload }, ...(item.kind === 'attendance' ? { password } : {}) }) });
        const result = await response.json().catch(() => ({}));
        if ([401, 429].includes(response.status)) throw new Error(result.error || 'Sign in again to synchronize.');
        if (response.status >= 500) throw new Error(result.error || 'Server unavailable. Local records are retained.');
        if (!response.ok) { await updateOfflineItem({ ...attemptedItem, status: 'review', error: result.error || 'Server validation rejected this record.' }); rejected++; continue; }
        await updateOfflineItem({ ...attemptedItem, status: 'synced', error: undefined }); saved++;
      }
      if (saved) { toast({ title: `${saved} local record${saved === 1 ? '' : 's'} synchronized`, description: 'Accepted by the server. Refresh the affected page to see the saved records.', variant: 'success' }); window.dispatchEvent(new Event('workpulse-synced')); }
      if (rejected) toast({ title: 'Some records need review', description: 'Open Offline records to see the server validation errors. Rejected records were not applied.', variant: 'error' });
    } catch (cause) {
      if (cause instanceof TypeError || !navigator.onLine) connectionChanged(false);
      toast({ title: 'Synchronization paused', description: cause instanceof Error ? cause.message : 'Reconnect and retry. Your local records are retained.', variant: 'error' });
    } finally { setPassword(''); setBusy(false); syncing.current = false; await refresh(); }
  }, [password, refresh, toast]);
  const syncRef = useRef(sync);
  useEffect(() => { syncRef.current = sync; }, [sync]);
  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    const changed = () => { void refresh(); };
    const online = () => { connectionChanged(true); void syncRef.current(false); };
    const offline = () => { connectionChanged(false); toast({ title: 'Offline mode', description: 'Supported records can be saved locally. Payments, approvals and fingerprint matching require internet.', variant: 'info' }); };
    const toastEvent = (event: Event) => toast((event as CustomEvent).detail);
    const show = () => { setOpen(true); void refresh(); };
    window.addEventListener('workpulse-offline-change', changed); window.addEventListener('online', online); window.addEventListener('offline', offline); window.addEventListener('workpulse-offline-toast', toastEvent);
    window.addEventListener('workpulse-open-offline', show);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine && offlineOwner()) void offlineItems().then(records => { if (records.some(item => item.status === 'pending' && item.kind !== 'attendance')) void syncRef.current(false); }).catch(() => {});
    }, 30_000);
    return () => { clearInterval(timer); window.removeEventListener('workpulse-offline-change', changed); window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('workpulse-offline-toast', toastEvent); window.removeEventListener('workpulse-open-offline', show); };
  }, [refresh, toast]);
  useEffect(() => {
    if (role === 'admin') void apiFetch('/api/employees').then(response => response.json()).then(data => { if (Array.isArray(data)) setEmployees(data); }).catch(() => {});
  }, [open, role]);
  useEffect(() => {
    const ready = () => setShellReady(Boolean(navigator.serviceWorker?.controller));
    navigator.serviceWorker?.addEventListener('controllerchange', ready);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', ready);
  }, []);
  async function capture(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      if (!employeeId.trim() || !checkIn || reason.trim().length < 5) throw new Error('Enter employee ID, time-in and a reason.');
      const capturedNow = new Date();
      const today = manilaDate();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date || date > today) throw new Error('Choose today or a valid past date.');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(checkIn) || (checkOut && !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkOut))) throw new Error('Enter valid attendance times.');
      if (date < today && !checkOut) throw new Error('Past attendance needs both time-in and time-out.');
      const start = new Date(date + 'T' + checkIn + ':00+08:00');
      const end = checkOut ? new Date(date + 'T' + checkOut + ':00+08:00') : null;
      if (end && end < start) end.setUTCDate(end.getUTCDate() + 1);
      if (end && end.getTime() === start.getTime()) throw new Error('Time-out must be after time-in.');
      if (start > capturedNow || (end && end > capturedNow)) throw new Error('Attendance times cannot be in the future.');
      if ((await offlineItems()).some(item => item.kind === 'attendance' && item.status !== 'synced' && item.payload.employeeId === employeeId.trim() && item.payload.date === date)) throw new Error('A local attendance record already exists for this employee and date. Review it before adding another.');
      let version = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('null')))).map(byte => byte.toString(16).padStart(2, '0')).join('');
      let sessionNumber = 1;
      try {
        const response = await apiFetch(`/api/attendance/correction?employeeId=${encodeURIComponent(employeeId.trim())}&date=${date}`);
        if (!response.ok) throw new Error('Employee unavailable.');
        const preview = await response.json();
        version = preview.version; sessionNumber = preview.sessions.length + 1;
        if (preview.sessions.some((session: { checkOut?: string }) => !session.checkOut)) throw new Error('An existing session is still open. Use Edit Attendance to complete that session.');
        if (sessionNumber > 3) throw new Error('This date already has three sessions.');
      } catch (cause) {
        // With no cached preview, server validation must confirm this is a new day.
        if (!isOffline()) throw cause;
        if (cause instanceof Error && /existing session|three sessions/.test(cause.message)) throw cause;
      }
      await queueOffline('attendance', { employeeId: employeeId.trim(), date, sessionNumber, checkIn, checkOut, reason: reason.trim(), version, captureOnly: true });
      setCheckIn(''); setCheckOut('');
    } catch (cause) { toast({ title: 'Attendance not saved locally', description: cause instanceof Error ? cause.message : 'Try again.', variant: 'error' }); }
    finally { setBusy(false); }
  }
  const filteredItems = items.filter(item => {
    const employee = employees.find(employee => employee.id === item.payload.employeeId);
    const text = [item.kind, employee?.name, ...Object.values(item.payload).map(String)].join(' ').toLowerCase();
    const dates = item.kind === 'attendance' ? [item.payload.date] : item.kind === 'leave' ? item.payload.requestedDates as string[] : [new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.createdAt))];
    return (!search || text.includes(search.toLowerCase())) && (statusFilter === 'all' || item.status === statusFilter) && (kindFilter === 'all' || item.kind === kindFilter) && (!recordDate || dates?.includes(recordDate));
  });
  const resetFilters = () => { setSearchDraft(''); setSearch(''); setStatusFilter('all'); setKindFilter('all'); setRecordDate(''); };
  const expires = Date.parse(sessionStorage.getItem('workpulse_session_expires') || '');
  if (!offlineOwner() || !Number.isFinite(expires) || expires <= now) return null;
  return <>
    <button type="button" onClick={() => { setOpen(true); void refresh(); }} className={`fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold shadow-lg ${offline ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-violet-200 bg-white text-violet-700'}`}>
      {offline ? <WifiOff className="h-4 w-4" /> : <CloudCheck className="h-4 w-4" />}{offline ? 'Offline - cached data' : 'Offline records'}{pending.length > 0 && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-white">{pending.length}</span>}
    </button>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} className="max-w-4xl">
      <DialogHeader><div><h2 className="flex items-center gap-3 text-xl font-bold text-slate-900"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><CloudOff className="h-5 w-5 text-slate-600" /></span>Offline records</h2><p className="mt-1 text-sm text-slate-500">Manage records saved on this device and sync when connected.</p></div><DialogClose onClose={() => !busy && setOpen(false)} /></DialogHeader>
      <div className="space-y-4 px-5 pb-6 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600"><span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${offline ? 'bg-amber-500' : 'bg-emerald-500'}`} />{offline ? 'Offline - records saved on this device' : 'Connected - ready to sync'}</span><span>{shellReady ? 'Offline cache ready' : 'Keep this tab open for offline access'}</span></div>
        <details className="text-xs text-slate-500"><summary className="cursor-pointer font-medium">About offline access</summary><p className="mt-2 leading-5">Fingerprint matching, payments, approvals, cash disbursement and account changes require internet. Keep this browser's data until all records are synced. Reopening offline requires this device to have loaded WorkPulse online first and a valid existing session.</p></details>
        <div className="grid grid-cols-3 gap-3">{[{ label: 'Pending sync', count: items.filter(item => item.status === 'pending').length }, { label: 'Needs review', count: items.filter(item => item.status === 'review').length }, { label: 'Synced', count: items.filter(item => item.status === 'synced').length }].map(summary => <div key={summary.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs font-medium text-slate-500">{summary.label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{summary.count}</p></div>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Local records</h3><p className="text-xs text-slate-500">Search and review your saved records.</p></div>{role === 'admin' && <Button variant="outline" onClick={() => setCaptureOpen(!captureOpen)} aria-expanded={captureOpen}><Plus className="h-4 w-4" />{captureOpen ? 'Close attendance form' : 'Add attendance'}</Button>}</div>
        {storageError && <p role="alert" className="text-sm text-rose-700">{storageError}</p>}
        {role === 'admin' && captureOpen && <form onSubmit={capture} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5"><h3 className="font-semibold text-slate-900">Add manual attendance</h3><p className="text-xs text-slate-500">Record actual times. An open session from a past date needs time-out before it can sync. Existing records are never silently overwritten.</p>
          <label className="block text-xs font-medium text-slate-700">Employee ID<Input required disabled={busy} list="offline-employees" value={employeeId} onChange={event => setEmployeeId(event.target.value)} placeholder="Type employee ID or choose from saved directory" /><datalist id="offline-employees">{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</datalist></label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-xs text-slate-700">Date<Input required disabled={busy} type="date" max={manilaDate()} value={date} onChange={event => setDate(event.target.value)} /></label><label className="text-xs text-slate-700">Reason<Input required disabled={busy} minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-xs text-slate-700">Time-in<Input required disabled={busy} type="time" value={checkIn} onChange={event => setCheckIn(event.target.value)} /><button type="button" disabled={busy} onClick={() => { setDate(manilaDate()); setCheckIn(manilaTime()); }} className="mt-1 text-xs font-semibold text-violet-700">Use current Manila time</button></label><label className="text-xs text-slate-700">Time-out (optional today)<Input disabled={busy} type="time" value={checkOut} onChange={event => setCheckOut(event.target.value)} /><button type="button" disabled={busy} onClick={() => setCheckOut(manilaTime())} className="mt-1 text-xs font-semibold text-violet-700">Use current Manila time</button></label></div>
          <Button type="submit" disabled={busy}>Save locally</Button>
        </form>}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <form onSubmit={event => { event.preventDefault(); setSearch(searchDraft.trim()); }} className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label="Search local records" className="pl-9" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="Search employee, ID or reason..." /></div><Button type="submit"><Search className="h-4 w-4" />Search</Button></form>
          <div className="flex flex-wrap items-end gap-3">
            <Button variant={statusFilter === 'all' && kindFilter === 'all' && !recordDate && !search && !searchDraft ? 'default' : 'outline'} onClick={resetFilters}>All records <span className="text-xs opacity-75">({items.length})</span></Button>
            <label className="flex-1 text-xs font-medium text-slate-600"><span className="mb-1 flex items-center gap-1"><Filter className="h-3 w-3" />Status</span><select className="h-11 w-full min-w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending sync</option><option value="review">Needs review</option><option value="synced">Synced</option></select></label>
            <label className="flex-1 text-xs font-medium text-slate-600"><span className="mb-1 block">Record type</span><select className="h-11 w-full min-w-36 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={kindFilter} onChange={event => setKindFilter(event.target.value)}><option value="all">All types</option><option value="attendance">Attendance</option><option value="leave">Leave request</option><option value="cash-advance">Cash advance</option></select></label>
            <label className="flex-1 text-xs font-medium text-slate-600"><span className="mb-1 block">Date</span><Input type="date" value={recordDate} onChange={event => setRecordDate(event.target.value)} /></label>
          </div>
        </div>
        <p role="status" className="text-xs text-slate-500">Showing {filteredItems.length} of {items.length} records</p>
        {filteredItems.map(item => <div key={item.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-2"><strong className="text-sm capitalize text-slate-900">{item.kind === 'cash-advance' ? 'Cash advance request' : item.kind === 'leave' ? 'Leave request' : 'Attendance'}</strong><span className={`rounded-full px-2 py-1 text-xs ${item.status === 'synced' ? 'bg-emerald-50 text-emerald-700' : item.status === 'review' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{item.status === 'review' ? 'Needs review' : item.status === 'synced' ? 'Synced' : 'Pending sync'}</span></div>
          <p className="text-xs text-slate-600">{item.kind === 'attendance' ? `${item.payload.employeeId} · ${item.payload.date} · ${item.payload.checkIn} to ${item.payload.checkOut || 'Open'}` : item.kind === 'leave' ? `${item.payload.leaveType} · ${(item.payload.requestedDates as string[]).join(', ')}` : `PHP ${item.payload.amount} · ${item.payload.requestPeriod}`}</p>
          <p className="text-xs text-slate-500">{String(item.payload.reason || 'No reason entered')}</p>
          {item.error && <p role="alert" className="text-xs text-rose-700">{item.error}</p>}
          {item.status === 'pending' && item.attemptedAt && <p className="text-xs text-amber-700">A sync was attempted without confirmation. Retry the original record before changing its details.</p>}
          {item.kind === 'attendance' && item.status !== 'synced' && (!item.attemptedAt || item.status === 'review' && /Past attendance needs both/.test(item.error || '')) && !item.payload.checkOut && <label className="block text-xs text-slate-700">Complete local time-out<Input type="time" disabled={busy} onChange={event => { void updateOfflineItem({ ...item, payload: { ...item.payload, checkOut: event.target.value }, status: 'pending', attemptedAt: undefined, error: undefined }).catch(cause => toast({ title: 'Time-out not saved', description: cause.message, variant: 'error' })); }} /></label>}
          <div className="flex gap-3">{item.status === 'review' && <button type="button" disabled={busy} onClick={() => void updateOfflineItem({ ...item, status: 'pending', error: undefined }).catch(cause => toast({ title: 'Retry unavailable', description: cause.message, variant: 'error' }))} className="text-xs font-semibold text-violet-700">Retry validation</button>}<button type="button" disabled={busy} onClick={() => { if (window.confirm(item.status === 'synced' ? 'Remove this local copy? The server record will stay.' : 'Discard this unsynced local record? It has not been saved to the server.')) void deleteOfflineItem(item.id).catch(cause => toast({ title: 'Local record not removed', description: cause.message, variant: 'error' })); }} className="text-xs text-slate-500">{item.status === 'synced' ? 'Remove local copy' : 'Discard local record'}</button></div>
        </div>)}
        {!filteredItems.length && <div className="rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center"><FileClock className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="text-sm font-semibold text-slate-700">{items.length ? 'No matching records' : 'No local records yet'}</p><p className="mt-1 text-xs text-slate-500">{items.length ? 'Try another search or clear the filters to see all records.' : 'Records saved offline will appear here for review and synchronization.'}</p>{items.length > 0 && <Button variant="ghost" className="mt-3" onClick={resetFilters}>Clear filters</Button>}</div>}
        {pending.some(item => item.kind === 'attendance') && <label className="block text-sm font-medium text-slate-700">Admin password for attendance sync<Input type="password" autoComplete="current-password" disabled={busy || !navigator.onLine} value={password} onChange={event => setPassword(event.target.value)} /><span className="text-xs font-normal text-slate-500">Used only for this sync attempt. Never stored in the local queue.</span></label>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-xs text-slate-500">Sync applies to all pending records.</p><Button disabled={busy || !navigator.onLine || !pending.some(item => item.status === 'pending') || (pending.some(item => item.kind === 'attendance' && item.status === 'pending') && !password)} onClick={() => void sync(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sync pending records</Button></div>
      </div>
    </Dialog>
  </>;
}
