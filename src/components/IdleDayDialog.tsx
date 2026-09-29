import { useEffect, useState, type FormEvent } from "react";
import { CalendarOff } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Button } from "./ui/Button";
import { Dialog, DialogClose, DialogHeader } from "./ui/Dialog";
import { Input, Label } from "./ui/Input";
import { useToast } from "./ui/Toast";

export function IdleDayDialog({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [idleDay, setIdleDay] = useState(false);
  const [workday, setWorkday] = useState(true);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch(`/api/attendance/idle-day?date=${encodeURIComponent(date)}`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load idle day status.");
      if (active) { setIdleDay(data.idleDay); setWorkday(data.workday); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load idle day status."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!password || saving || loading || !workday) return;
    setSaving(true);
    setError("");
    try {
      const next = !idleDay;
      const response = await apiFetch("/api/attendance/idle-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, idleDay: next, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update idle day.");
      onSaved();
      toast({ title: next ? "Idle day set" : "Idle day removed", description: next ? "Everyone may work or stay home on this date without an absence." : "Normal attendance rules apply again.", variant: "success" });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update idle day.");
    } finally { setSaving(false); }
  }

  return <Dialog open onClose={onClose} className="max-w-md">
    <DialogHeader><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><CalendarOff size={21}/></span><div><h2 className="text-xl font-bold text-slate-900">Idle day</h2><p className="text-sm text-slate-500">{date} · Applies to all employees</p></div></div><DialogClose onClose={onClose}/></DialogHeader>
    <form onSubmit={event => void save(event)} className="space-y-4 px-4 pb-5 sm:px-6 sm:pb-6">
      {loading ? <p className="text-sm text-slate-500">Loading...</p> : <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-900">{idleDay ? "This is an idle day. Employees may still clock in. Anyone who stays home is not marked absent." : "Set an idle day when orders are low. Employees may still clock in and are paid for hours worked. Those who stay home are not marked absent."}</p>}
      {!workday && !loading && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">This is already a non-working day. No idle-day change is needed.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="space-y-2"><Label htmlFor="idle-admin-password">Admin password</Label><Input id="idle-admin-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required/></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!password || saving || loading || !workday}>{saving ? "Saving..." : idleDay ? "Remove idle day" : "Set idle day"}</Button></div>
    </form>
  </Dialog>;
}
