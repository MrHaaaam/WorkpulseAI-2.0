import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Search, ShieldCheck } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Dialog, DialogClose, DialogHeader } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useToast } from "./ui/Toast";

type EmployeeState = { id: string; name: string; role: string; clockedIn: boolean; lastTime: string | null; sessionCount: number; blockedReason: string | null };
type BulkSelection = { action: "time-in" | "time-out"; ids: string[]; mode: "all" | "selected" };

function attendanceLabel(employee: EmployeeState) {
  if (employee.clockedIn) return "Clocked in";
  if (employee.blockedReason?.includes("approved leave")) return "On leave";
  if (employee.blockedReason) return "Unavailable";
  return employee.sessionCount ? "Clocked out" : "Not yet clocked in";
}

export function ManualAttendanceDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [employees, setEmployees] = useState<EmployeeState[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulk, setBulk] = useState<BulkSelection | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = employees.filter(employee => selectedIds.includes(employee.id));
  const filtered = useMemo(() => employees.filter(employee => `${employee.name} ${employee.id} ${employee.role}`.toLowerCase().includes(search.trim().toLowerCase())), [employees, search]);
  const notYet = employees.filter(employee => !employee.clockedIn && employee.sessionCount === 0 && !employee.blockedReason);
  const clockedIn = employees.filter(employee => employee.clockedIn);
  const selectedForClockIn = selected.filter(employee => !employee.clockedIn && !employee.blockedReason);
  const selectedForClockOut = selected.filter(employee => employee.clockedIn);
  const action = bulk?.action || "time-in";
  const canSave = Boolean(bulk?.ids.length);

  function toggleEmployee(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    setBulk(null);
    setError("");
  }

  async function refresh() {
    const response = await apiFetch("/api/attendance/manual");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load employees.");
    setDate(data.date);
    setEmployees(data.employees);
  }

  useEffect(() => {
    let active = true;
    apiFetch("/api/attendance/manual").then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load employees.");
      if (active) { setDate(data.date); setEmployees(data.employees); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load employees."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/attendance/manual/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeIds: bulk?.ids, action, date, note, password, selectionMode: bulk?.mode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to record attendance.");
      onSaved();
      const warningCount = (data.results || []).filter((result: { payrollWarning?: string }) => Boolean(result.payrollWarning)).length;
      toast({ title: action === "time-in" ? "Clock-ins recorded" : "Clock-outs recorded", description: `${data.recorded} recorded at ${data.time}.${data.skipped ? ` ${data.skipped} skipped; review the list.` : ""}${warningCount ? ` ${warningCount} payroll records need review.` : ""}`, variant: data.skipped || warningCount ? "error" : "success" });
      if (data.skipped || warningCount) {
        setError((data.results || []).filter((result: { ok: boolean }) => !result.ok).slice(0, 3).map((result: { employeeId: string; error: string }) => `${result.employeeId}: ${result.error}`).join(" ") || "Some payroll records need review.");
        setBulk(null);
        setSelectedIds([]);
        setPassword("");
        await refresh();
        return;
      }
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to record attendance."); }
    finally { setSaving(false); }
  }

  return <Dialog open onClose={() => { if (!saving) onClose(); }} className="max-w-4xl">
    <DialogHeader><div><h2 className="flex items-center gap-2 text-lg font-bold text-violet-800"><Clock className="h-5 w-5" />Record attendance manually</h2><p className="mt-1 text-sm text-slate-500">Scanner unavailable · Today only{date ? ` · ${new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}` : ""}</p></div><DialogClose onClose={onClose} /></DialogHeader>
    <form className="space-y-4 px-4 pb-5 pt-3 sm:px-6" onSubmit={save}>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="relative"><label htmlFor="manual-attendance-search" className="mb-1 block text-sm font-medium text-slate-700">Employees</label><Search className="absolute bottom-3 left-3 h-4 w-4 text-slate-400" /><Input id="manual-attendance-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or employee ID" className="pl-9" /></div>
      <div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-sm font-semibold text-violet-800">{selectedIds.length} selected</span><Button type="button" size="sm" variant="outline" disabled={!selectedForClockIn.length || saving} onClick={() => setBulk({ action: "time-in", ids: selectedForClockIn.map(employee => employee.id), mode: "selected" })}>Clock in selected ({selectedForClockIn.length})</Button><Button type="button" size="sm" variant="outline" disabled={!selectedForClockOut.length || saving} onClick={() => setBulk({ action: "time-out", ids: selectedForClockOut.map(employee => employee.id), mode: "selected" })}>Clock out selected ({selectedForClockOut.length})</Button>{selectedIds.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedIds([]); setBulk(null); }}>Clear</Button>}</div>
      <div className="grid max-h-[48vh] grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-violet-100 bg-violet-50/30 p-2 sm:grid-cols-2">
        {loading ? <p className="col-span-full p-3 text-center text-sm text-slate-500">Loading employees...</p> : filtered.length ? filtered.map(employee => { const checked = selectedIds.includes(employee.id); return <button key={employee.id} type="button" aria-pressed={checked} disabled={Boolean(employee.blockedReason)} title={employee.blockedReason || undefined} onClick={() => toggleEmployee(employee.id)} className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left text-sm ${checked ? "border-violet-600 bg-violet-600 text-white" : "border-slate-100 bg-white text-slate-800 hover:border-violet-200 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-70"}`}><span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${checked ? "border-white bg-white text-violet-700" : "border-slate-300 bg-white"}`}>{checked && <Check className="h-3 w-3" />}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{employee.name}</span><span className={`block text-xs ${checked ? "text-violet-100" : "text-slate-500"}`}>{employee.id} · {employee.role}</span></span><span className={`shrink-0 text-right text-xs font-medium ${checked ? "text-white" : employee.blockedReason ? "text-amber-700" : "text-slate-600"}`}>{attendanceLabel(employee)}</span></button> }) : <p className="col-span-full p-3 text-center text-sm text-slate-500">No matching active employees.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-violet-100 pt-3"><p className="text-xs text-slate-500">Or choose everyone eligible. Search does not limit these actions.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" className="border-violet-200 text-violet-700" disabled={loading || saving || !notYet.length} onClick={() => { setBulk({ action: "time-in", ids: notYet.map(employee => employee.id), mode: "all" }); setSelectedIds([]); }}>Clock in all not yet in ({notYet.length})</Button><Button type="button" size="sm" variant="outline" className="border-violet-200 text-violet-700" disabled={loading || saving || !clockedIn.length} onClick={() => { setBulk({ action: "time-out", ids: clockedIn.map(employee => employee.id), mode: "all" }); setSelectedIds([]); }}>Clock out all clocked in ({clockedIn.length})</Button></div></div>
      {bulk && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900"><p className="font-semibold">Ready to {bulk.action === "time-in" ? "clock in" : "clock out"} {bulk.ids.length} selected employee{bulk.ids.length === 1 ? "" : "s"} now</p><p className="mt-1 text-xs">Anyone whose attendance changes before saving will be skipped. The server records the current Manila time.</p></div>}      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-700">Note <span className="font-normal text-slate-400">(optional)</span><Input maxLength={200} value={note} onChange={event => setNote(event.target.value)} placeholder="Scanner issue details" className="mt-1" /></label><label className="block text-sm font-medium text-slate-700">Admin password<Input type="password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" className="mt-1" /></label></div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!canSave || !date || !password || saving}><ShieldCheck className="h-4 w-4" />{saving ? "Recording..." : bulk ? `Record ${bulk.ids.length} clock-${action === "time-in" ? "ins" : "outs"}` : selectedIds.length ? "Choose clock-in or clock-out" : "Select employees above"}</Button></div>
    </form>
  </Dialog>;
}
