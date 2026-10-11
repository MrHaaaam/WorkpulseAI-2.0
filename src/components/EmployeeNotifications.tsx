import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CalendarDays, Clock3, RefreshCw, UserRound, WalletCards, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Button } from './ui/Button';

export type EmployeeNotificationSection = 'attendance' | 'calendar' | 'leave' | 'payroll' | 'profile';
type Notification = { id: string; category: 'attendance' | 'leave' | 'payroll' | 'cash-advance' | 'profile'; section: EmployeeNotificationSection; title: string; description: string; createdAt: string; read: boolean; date?: string };
const categories = [
  { key: 'all', label: 'All', icon: Bell }, { key: 'attendance', label: 'Attendance', icon: Clock3 },
  { key: 'leave', label: 'Leave', icon: CalendarDays }, { key: 'payroll', label: 'Payroll', icon: WalletCards },
  { key: 'cash-advance', label: 'Cash advances', icon: WalletCards }, { key: 'profile', label: 'My details', icon: UserRound },
] as const;

export function EmployeeNotifications({ onNavigate }: { onNavigate: (section: EmployeeNotificationSection, date?: string) => void }) {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<Notification[]>([]);
  const [category, setCategory] = useState<string>('all'); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [reading, setReading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null); const bellRef = useRef<HTMLButtonElement>(null);
  const readIdsRef = useRef(new Set<string>());
  const load = useCallback(async () => {
    try {
      const response = await apiFetch('/api/employee/me/notifications');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load notifications.');
      setItems((data as Notification[]).map(item => readIdsRef.current.has(item.id) ? { ...item, read: true } : item)); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load notifications.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); bellRef.current?.focus(); }
      if (event.key === 'Tab') {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; };
  }, [open]);
  async function markRead(ids: string[]) {
    if (!ids.length || reading) return;
    setReading(true);
    try {
      const response = await apiFetch('/api/employee/me/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to mark notifications as read.');
      for (const id of data.readIds) readIdsRef.current.add(id);
      setItems(current => current.map(item => readIdsRef.current.has(item.id) ? { ...item, read: true } : item));
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Read status was not saved.'); }
    finally { setReading(false); }
  }
  const unread = items.filter(item => !item.read);
  const shown = items.filter(item => category === 'all' || item.category === category);
  function close() { setOpen(false); bellRef.current?.focus(); }
  return <>
    <button ref={bellRef} type="button" aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`} aria-expanded={open} aria-controls="employee-notification-panel" onClick={() => { setCategory('all'); setOpen(true); void load(); }} className="relative ml-auto mr-3 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-violet-50 hover:text-violet-700"><Bell className="h-5 w-5" />{unread.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-violet-600 px-1 text-center text-[10px] font-bold leading-5 text-white">{unread.length > 99 ? '99+' : unread.length}</span>}</button>
    {open && createPortal(<div className="fixed inset-0 z-[90] flex items-start justify-end bg-slate-950/40 p-2 pt-20 backdrop-blur-sm sm:p-5 sm:pt-20" onClick={close}><div id="employee-notification-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="employee-notifications-title" onClick={event => event.stopPropagation()} className="flex max-h-[calc(100svh-6rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 id="employee-notifications-title" className="flex items-center gap-2 text-lg font-bold text-slate-900"><Bell className="h-5 w-5 text-violet-600" />Notifications</h2><p className="mt-1 text-xs text-slate-500">Updates from your administrator · {unread.length} unread</p></div><button type="button" aria-label="Close notifications" onClick={close} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="space-y-3 border-b border-slate-100 p-4"><div className="flex flex-wrap gap-2">{categories.map(({ key, label, icon: Icon }) => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${category === key ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-violet-50'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={reading || !unread.length} onClick={() => void markRead(unread.map(item => item.id))}>{reading ? 'Saving...' : 'Mark all read'}</Button><Button type="button" size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button></div></div>
      <div className="space-y-3 overflow-y-auto p-4">{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{loading ? <p className="py-6 text-center text-sm text-slate-500">Loading notifications...</p> : shown.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No notifications yet{category === 'all' ? '.' : ' in this category.'}</p> : shown.map(item => <button key={item.id} type="button" onClick={() => { if (!item.read) void markRead([item.id]); onNavigate(item.section, item.date); close(); }} className={`block w-full rounded-xl border p-4 text-left hover:border-violet-300 hover:bg-violet-50 ${item.read ? 'border-slate-200 bg-white' : 'border-violet-200 bg-violet-50/60'}`}><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{item.title}</p>{!item.read && <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">New</span>}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.description}</p><p className="mt-2 text-xs text-slate-400">{new Date(item.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p></button>)}</div>
    </div></div>, document.body)}
  </>;
}
