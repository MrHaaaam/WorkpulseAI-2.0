import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Button } from "./ui/Button";
import { Dialog, DialogClose, DialogHeader } from "./ui/Dialog";
import { Input, Label } from "./ui/Input";
import { useToast } from "./ui/Toast";

function workforceDateToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function earliestIdleDate() {
  const date = new Date(`${workforceDateToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return { leading: first.getDay(), dates: Array.from({ length: count }, (_, index) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`) };
}

export function IdleDayDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (dates: string[], idleDay: boolean) => void }) {
  const { toast } = useToast();
  const [date, setDate] = useState(workforceDateToday);
  const [month, setMonth] = useState(() => { const today = workforceDateToday(); return new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1); });
  const [dates, setDates] = useState<string[]>([]);
  const [idleDay, setIdleDay] = useState(false);
  const [workday, setWorkday] = useState(true);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const visibleMonth = monthDays(month);
  const minDate = earliestIdleDate();

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      if (!date || date < minDate) { setLoading(false); return; }
      apiFetch(`/api/attendance/idle-day?date=${encodeURIComponent(date)}`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load idle day status.");
      if (active) { setIdleDay(data.idleDay); setWorkday(data.workday); if (!data.workday) setDates(current => current.filter(value => value !== date)); }
      }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load idle day status."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [date, minDate]);

  async function save(next: boolean) {
    const selectedDates = dates.length ? dates : date && workday ? [date] : [];
    if (!selectedDates.length || selectedDates.some(value => value < minDate) || !password || saving || loading) return;
    setSaving(true);
    setError("");
    try {
      for (const selectedDate of selectedDates) {
        const response = await apiFetch("/api/attendance/idle-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: selectedDate, idleDay: next, password }) });
        const data = await response.json();
        if (!response.ok) throw new Error(`${selectedDate}: ${data.error || "Unable to update idle day."}`);
      }
      onSaved(selectedDates, next);
      toast({ title: next ? "Idle day set" : "Idle day removed", description: `${selectedDates.length} date${selectedDates.length === 1 ? "" : "s"} updated.`, variant: "success" });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update idle day.");
    } finally { setSaving(false); }
  }

  return <Dialog open onClose={onClose} className="max-w-2xl">
    <DialogHeader><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Attendance control</p><h2 className="mt-1 text-xl font-semibold text-slate-900">Manage idle days</h2><p className="mt-1 text-sm text-slate-600">Applies to all active employees on the selected workday.</p></div><DialogClose onClose={onClose}/></DialogHeader>
    <form onSubmit={event => { event.preventDefault(); void save(true); }} className="space-y-5 px-4 pb-5 sm:px-6 sm:pb-6">
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Choose workdays</p><p className="mt-1 text-base font-semibold text-slate-900">{month.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}</p></div><div className="flex gap-1"><button type="button" aria-label="Previous month" disabled={visibleMonth.dates[0] <= minDate} onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Next month" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button></div></div>
        <div className="grid grid-cols-7 gap-1 text-center sm:gap-2">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="py-2 text-[10px] font-semibold text-slate-500 sm:text-xs">{day}</span>)}{Array.from({ length: visibleMonth.leading }, (_, index) => <span key={`blank-${index}`} />)}{visibleMonth.dates.map(value => { const selected = dates.includes(value); const focused = date === value; return <button disabled={value < minDate || saving} key={value} type="button" aria-label={`${value}${selected ? ", selected" : ""}`} aria-pressed={selected} onClick={() => { setDate(value); setDates(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value].sort()); setError(""); }} className={`min-h-12 rounded-lg border text-sm font-semibold transition sm:min-h-14 ${selected ? "border-violet-600 bg-violet-600 text-white" : focused ? "border-violet-500 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:border-violet-400 hover:bg-violet-50"}`}>{Number(value.slice(-2))}</button>; })}</div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><p className="text-xs text-slate-600">{dates.length} {dates.length === 1 ? "date" : "dates"} selected. Click dates to add or remove them.</p>{dates.length > 0 && <button type="button" onClick={() => setDates([])} className="text-xs font-semibold text-violet-700 hover:underline">Clear selection</button>}</div>
      </div>
      {dates.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dates to set as idle</p><div className="flex flex-wrap gap-2" aria-label="Selected idle dates">{dates.map(value => <button key={value} type="button" disabled={saving} onClick={() => setDates(current => current.filter(item => item !== value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400" aria-label={`Remove ${value}`}>{value} <span aria-hidden="true" className="ml-2 text-slate-400">?</span></button>)}</div></div>}
      <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected date status: {date}</p><p className="mt-2 text-sm font-semibold text-slate-900">{loading ? "Checking date..." : !workday ? "Non-working day" : idleDay ? "Idle day is active" : "Regular workday"}</p><p className="mt-1 text-sm leading-6 text-slate-600">{!workday ? "This date is already non-working; no idle-day change is needed." : "Employees may still clock in and are paid for hours worked. Employees who stay home are not marked absent on an idle day."}</p></div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="space-y-2"><Label htmlFor="idle-admin-password">Confirm with admin password</Label><Input id="idle-admin-password" type="password" autoComplete="current-password" className="sm:max-w-sm" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required/></div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>{idleDay && (dates.length === 0 || (dates.length === 1 && dates[0] === date)) && <Button type="button" variant="outline" disabled={!password || saving || loading || !workday || date < minDate} onClick={() => void save(false)}>Remove idle day</Button>}<Button type="submit" disabled={!dates.length || !password || saving || loading || !workday || date < minDate}>{saving ? "Saving..." : `Set ${dates.length} ${dates.length === 1 ? "idle day" : "idle days"}`}</Button></div>
    </form>
  </Dialog>;
}
