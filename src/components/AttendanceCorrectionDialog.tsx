import { useEffect, useState } from 'react';
import { Bell, Clock3, Loader2, Save, Search, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Button } from './ui/Button';
import { Input, Textarea } from './ui/Input';
import { Dialog, DialogClose } from './ui/Dialog';
import { useToast } from './ui/Toast';
import { isOffline } from '../lib/offline';
import { attendanceWindowError, type AttendanceWindow } from '../../shared/attendance-window.js';

type Employee = { id: string; name: string };
type Preview = { employee: Employee; date: string; schedule?: AttendanceWindow; sessions: ({ checkIn: string; checkOut?: string | null } & AttendanceWindow)[]; version: string; blockedReason?: string | null };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function timeInput(value?: string | null) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '';
  const hour = match[3] ? Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0) : Number(match[1]);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
async function read(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load attendance.');
  return data;
}
export function AttendanceCorrectionDialog({ initialEmployeeId = '', initialDate = today(), onClose, onSaved }: { initialEmployeeId?: string; initialDate?: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const searchTerms = employeeSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matchingEmployees = employees.filter(employee => searchTerms.every(term => `${employee.name} ${employee.id}`.toLocaleLowerCase().includes(term)));
  const selectedEmployee = employees.find(employee => employee.id === employeeId);
  const employeeOptions = selectedEmployee && !matchingEmployees.some(employee => employee.id === employeeId)
    ? [selectedEmployee, ...matchingEmployees] : matchingEmployees;
  const [date, setDate] = useState(initialDate);
  const [sessionNumber, setSessionNumber] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checkIn, setCheckIn] = useState(''); const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    apiFetch('/api/employees').then(read).then((data: Employee[]) => { if (active) setEmployees(data); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { setLoading(Boolean(employeeId && date)); setPreview(null); setError(''); } });
    if (!employeeId || !date) return () => { active = false; };
    apiFetch(`/api/attendance/correction?employeeId=${encodeURIComponent(employeeId)}&date=${date}`).then(read).then((data: Preview) => {
      if (active) { setPreview(data); setSessionNumber(1); setCheckIn(timeInput(data.sessions[0]?.checkIn)); setCheckOut(timeInput(data.sessions[0]?.checkOut)); }
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [employeeId, date, reload]);
  function chooseSession(number: number) {
    setSessionNumber(number); setCheckIn(timeInput(preview?.sessions[number - 1]?.checkIn)); setCheckOut(timeInput(preview?.sessions[number - 1]?.checkOut));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!preview || preview.blockedReason || saving) return;
    setSaving(true); setError('');
    try {
      if (!checkIn && checkOut) {
        const session = preview.sessions[sessionNumber - 1];
        if (!session?.checkIn || session.checkOut) throw new Error(`Session ${sessionNumber} ${session?.checkOut ? `is already closed (${session.checkIn} to ${session.checkOut})` : 'has no recorded time-in'}. A time-out-only request requires an open session. Nothing was saved.`);
      }
      const windowError = attendanceWindowError(checkIn, checkOut, { ...preview.schedule, ...preview.sessions[sessionNumber - 1] });
      if (windowError) throw new Error(windowError);
      const result = await read(await apiFetch('/api/attendance/correction', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, date, sessionNumber, checkIn, checkOut, reason, password, version: preview.version }) }));
      if (result.queued) { onClose(); return; }
      onSaved(); toast({ title: 'Attendance updated', description: 'The employee was notified. Unpaid payroll was recalculated.', variant: 'success' }); onClose();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to save attendance.';
      setError(message); toast({ title: 'Attendance was not updated', description: message, variant: 'error' });
    }
    finally { setSaving(false); }
  }
  if (isOffline()) return <Dialog open onClose={onClose}><div className="space-y-4 p-6"><h2 className="text-lg font-semibold">Edit Attendance requires internet</h2><p role="alert" className="text-sm text-slate-600">Existing attendance cannot be edited offline. Use Offline records to capture employee time-in and time-out, then reconnect to sync.</p><Button onClick={onClose}>Close</Button></div></Dialog>;
  return <Dialog open onClose={() => !saving && onClose()} className="flex max-w-2xl flex-col overflow-hidden">
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-5 sm:px-6">
      <div className="flex gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200"><Clock3 className="h-6 w-6" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600">Attendance correction</p><h2 className="mt-1 text-xl font-bold text-slate-900">Edit attendance</h2><p className="mt-1 text-sm text-slate-500">Review the record and update the employee’s times.</p></div></div><DialogClose onClose={() => !saving && onClose()} />
    </div>
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
    <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:px-6">
      <fieldset disabled={saving} className="space-y-3">
        <label className="block text-sm font-semibold text-slate-700">Search employee<div className="relative mt-1.5"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 h-4 w-4 text-slate-400" /><Input type="search" disabled={saving} value={employeeSearch} onChange={event => setEmployeeSearch(event.target.value)} placeholder="Search by name or employee ID" className="pl-9 font-normal" /></div></label>
        {employeeSearch.trim() && <p role="status" className="text-xs text-slate-500">{matchingEmployees.length ? `${matchingEmployees.length} matching employee${matchingEmployees.length === 1 ? '' : 's'}. Select below.` : 'No matching employees. Try another name or ID.'}{selectedEmployee && !matchingEmployees.some(employee => employee.id === employeeId) ? ' Your current selection is kept until you choose another employee.' : ''}</p>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Employee<select required value={employeeId} onChange={event => setEmployeeId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="">Select employee</option>{employeeOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.name} ({employee.id})</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Date<Input required type="date" max={today()} value={date} onChange={event => setDate(event.target.value)} className="mt-1" /></label></div>
      </fieldset>
      {loading && <p role="status" className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading current times...</p>}
      {preview?.blockedReason && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-semibold">Attendance cannot be edited</p><p className="mt-1">{preview.blockedReason}</p></div>}
      {preview && <><div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 text-sm"><div className="mb-3 flex items-center justify-between"><p className="font-semibold text-slate-800">Current attendance</p><span className="rounded-full border border-violet-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-600">Saved record</span></div>{preview.sessions.length ? preview.sessions.map((session, index) => <div key={index} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5"><span className="text-xs font-medium text-slate-500">Session {index + 1}</span><span className="font-semibold tabular-nums text-slate-800">{session.checkIn}<span className="mx-3 font-normal text-violet-400">→</span>{session.checkOut || 'Open'}</span></div>) : <p className="text-slate-500">{preview.blockedReason ? 'No time-in recorded.' : 'No time-in recorded. You can add the first session.'}</p>}</div>
        <fieldset disabled={saving || Boolean(preview.blockedReason)} className="space-y-3"><label className="block text-sm font-semibold text-slate-700">Session<select value={sessionNumber} onChange={event => chooseSession(Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3">{Array.from({ length: Math.min(3, preview.sessions.length + 1) }, (_, index) => <option key={index} value={index + 1}>Session {index + 1}{index === preview.sessions.length ? ' (add)' : ''}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-slate-700">Time-in<Input type="time" value={checkIn} onChange={event => setCheckIn(event.target.value)} className="mt-1" /></label><label className="text-sm font-semibold text-slate-700">Time-out<Input type="time" value={checkOut} onChange={event => setCheckOut(event.target.value)} className="mt-1" /></label></div></fieldset>
        {preview.sessions[sessionNumber - 1] && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving || Boolean(preview.blockedReason) || sessionNumber !== preview.sessions.length} onClick={() => setCheckOut('')}>Clear accidental time-out</Button><Button type="button" variant="outline" disabled={saving || Boolean(preview.blockedReason)} onClick={() => { setCheckIn(''); setCheckOut(''); }}>Clear both times</Button></div>}
        {!checkIn && !checkOut && preview.sessions[sessionNumber - 1] && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Saving will remove this session. Original times remain in correction history.</p>}
        <p className="text-xs leading-5 text-slate-500">Manila time. Earlier time-out means the next day. Clear time-out to reopen the last session. Clear both times to remove an accidental session. A time-out requires a time-in. Corrections preserve history and update unpaid payroll.</p>
      </>}
      <label className="block text-sm font-semibold text-slate-700">Reason for correction<Textarea required minLength={5} maxLength={500} rows={3} disabled={saving || Boolean(preview?.blockedReason)} value={reason} onChange={event => setReason(event.target.value)} placeholder="Forgot to scan; arrival verified by supervisor." className="mt-1.5 block w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50" /></label>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><ShieldCheck className="h-4 w-4 text-violet-600" />Administrator verification</div><label className="block text-xs font-medium text-slate-600">Admin password<Input required={!isOffline()} type="password" autoComplete="current-password" disabled={saving || Boolean(preview?.blockedReason)} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password to authorize changes" className="mt-1.5" /></label></div>
      {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}{employeeId && date && <button type="button" disabled={saving} onClick={() => setReload(key => key + 1)} className="ml-2 underline">Reload current times</button>}</div>}
    </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6"><p className="flex items-center gap-2 text-xs text-slate-500"><Bell className="h-4 w-4 text-violet-500" />Employee notified after server synchronization</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!preview || Boolean(preview?.blockedReason) || loading || saving || (!isOffline() && !password) || reason.trim().length < 5}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving...' : isOffline() ? 'Save locally' : 'Save changes'}</Button></div></div>
    </form>
  </Dialog>;
}
