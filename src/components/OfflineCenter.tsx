import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudCheck, CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react';
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
  const expires = Date.parse(sessionStorage.getItem('workpulse_session_expires') || '');
  if (!offlineOwner() || !Number.isFinite(expires) || expires <= now) return null;
  return <>
    <button type="button" onClick={() => { setOpen(true); void refresh(); }} className={`fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold shadow-lg ${offline ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-violet-200 bg-white text-violet-700'}`}>
      {offline ? <WifiOff className="h-4 w-4" /> : <CloudCheck className="h-4 w-4" />}{offline ? 'Offline - cached data' : 'Offline records'}{pending.length > 0 && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-white">{pending.length}</span>}
    </button>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} className="max-w-2xl">
      <DialogHeader><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CloudOff className="h-5 w-5 text-violet-600" />Offline records</h2><p className="mt-1 text-sm text-slate-500">Stored on this browser. Pending records are not yet saved to the server.</p></div><DialogClose onClose={() => !busy && setOpen(false)} /></DialogHeader>
      <div className="space-y-4 px-5 pb-6 pt-3">
        <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">{offline ? 'You are viewing cached data. ' : ''}Fingerprint matching, payments, approvals, cash disbursement and account changes require internet. Keep this browser’s data until all records are synced. Reopening offline requires this device to have loaded WorkPulse online first and a valid existing session.</p>
        <p className={`text-xs ${shellReady ? 'text-emerald-700' : 'text-amber-700'}`}>{shellReady ? 'Offline page cache ready on this device.' : import.meta.env.DEV ? 'Development mode: keep this tab open. Offline page reload is available in the production build.' : 'Offline page preparation is not complete. Keep this tab open until the cache is ready.'}</p>
        {storageError && <p role="alert" className="text-sm text-rose-700">{storageError}</p>}
        {role === 'admin' && <form onSubmit={capture} className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/40 p-4"><h3 className="font-semibold text-slate-900">Capture manual attendance locally</h3><p className="text-xs text-slate-500">Record actual times. An open session from a past date needs time-out before it can sync. Existing records are never silently overwritten.</p>
          <label className="block text-xs font-medium text-slate-700">Employee ID<Input required disabled={busy} list="offline-employees" value={employeeId} onChange={event => setEmployeeId(event.target.value)} placeholder="Type employee ID or choose from saved directory" /><datalist id="offline-employees">{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</datalist></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-700">Date<Input required disabled={busy} type="date" max={manilaDate()} value={date} onChange={event => setDate(event.target.value)} /></label><label className="text-xs text-slate-700">Reason<Input required disabled={busy} minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-700">Time-in<Input required disabled={busy} type="time" value={checkIn} onChange={event => setCheckIn(event.target.value)} /><button type="button" disabled={busy} onClick={() => { setDate(manilaDate()); setCheckIn(manilaTime()); }} className="mt-1 text-xs font-semibold text-violet-700">Use current Manila time</button></label><label className="text-xs text-slate-700">Time-out (optional today)<Input disabled={busy} type="time" value={checkOut} onChange={event => setCheckOut(event.target.value)} /><button type="button" disabled={busy} onClick={() => setCheckOut(manilaTime())} className="mt-1 text-xs font-semibold text-violet-700">Use current Manila time</button></label></div>
          <Button type="submit" disabled={busy}>Save locally</Button>
        </form>}
        {items.map(item => <div key={item.id} className="space-y-2 rounded-xl border border-slate-200 p-3"><div className="flex justify-between gap-2"><strong className="text-sm capitalize text-slate-900">{item.kind === 'cash-advance' ? 'Cash advance request' : item.kind === 'leave' ? 'Leave request' : 'Attendance'}</strong><span className={`rounded-full px-2 py-1 text-xs ${item.status === 'synced' ? 'bg-emerald-50 text-emerald-700' : item.status === 'review' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{item.status === 'review' ? 'Needs review' : item.status === 'synced' ? 'Synced' : 'Pending sync'}</span></div>
          <p className="text-xs text-slate-600">{item.kind === 'attendance' ? `${item.payload.employeeId} · ${item.payload.date} · ${item.payload.checkIn} to ${item.payload.checkOut || 'Open'}` : item.kind === 'leave' ? `${item.payload.leaveType} · ${(item.payload.requestedDates as string[]).join(', ')}` : `PHP ${item.payload.amount} · ${item.payload.requestPeriod}`}</p>
          <p className="text-xs text-slate-500">{String(item.payload.reason || 'No reason entered')}</p>
          {item.error && <p role="alert" className="text-xs text-rose-700">{item.error}</p>}
          {item.status === 'pending' && item.attemptedAt && <p className="text-xs text-amber-700">A sync was attempted without confirmation. Retry the original record before changing its details.</p>}
          {item.kind === 'attendance' && item.status !== 'synced' && (!item.attemptedAt || item.status === 'review' && /Past attendance needs both/.test(item.error || '')) && !item.payload.checkOut && <label className="block text-xs text-slate-700">Complete local time-out<Input type="time" disabled={busy} onChange={event => { void updateOfflineItem({ ...item, payload: { ...item.payload, checkOut: event.target.value }, status: 'pending', attemptedAt: undefined, error: undefined }).catch(cause => toast({ title: 'Time-out not saved', description: cause.message, variant: 'error' })); }} /></label>}
          <div className="flex gap-3">{item.status === 'review' && <button type="button" disabled={busy} onClick={() => void updateOfflineItem({ ...item, status: 'pending', error: undefined }).catch(cause => toast({ title: 'Retry unavailable', description: cause.message, variant: 'error' }))} className="text-xs font-semibold text-violet-700">Retry validation</button>}<button type="button" disabled={busy} onClick={() => { if (window.confirm(item.status === 'synced' ? 'Remove this local copy? The server record will stay.' : 'Discard this unsynced local record? It has not been saved to the server.')) void deleteOfflineItem(item.id).catch(cause => toast({ title: 'Local record not removed', description: cause.message, variant: 'error' })); }} className="text-xs text-slate-500">{item.status === 'synced' ? 'Remove local copy' : 'Discard local record'}</button></div>
        </div>)}
        {!items.length && <p className="py-3 text-center text-sm text-slate-500">No local records for this account.</p>}
        {pending.some(item => item.kind === 'attendance') && <label className="block text-sm font-medium text-slate-700">Admin password for attendance sync<Input type="password" autoComplete="current-password" disabled={busy || !navigator.onLine} value={password} onChange={event => setPassword(event.target.value)} /><span className="text-xs font-normal text-slate-500">Used only for this sync attempt. Never stored in the local queue.</span></label>}
        <div className="flex justify-end"><Button disabled={busy || !navigator.onLine || !pending.some(item => item.status === 'pending') || (pending.some(item => item.kind === 'attendance' && item.status === 'pending') && !password)} onClick={() => void sync(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sync pending records</Button></div>
      </div>
    </Dialog>
  </>;
}
