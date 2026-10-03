import { AdminPageHeader } from "../components/AdminPageHeader";
import { useEffect, useMemo, useState } from "react";
import { CalendarOff, Check, Clock, Download, Search, ShieldCheck, X } from "lucide-react";

import { Card, CardContent } from "../components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { apiFetch } from "../lib/api";
import { DateNavigator } from "../components/DateNavigator";
import { PaginationControls } from "../components/ui/Pagination";
import { usePagination } from "../hooks/usePagination";
import { downloadCsv } from "../lib/exportCsv";
import { Input } from "../components/ui/Input";
import { ManualAttendanceDialog } from "../components/ManualAttendanceDialog";
import { IdleDayDialog } from "../components/IdleDayDialog";

export interface AttendanceRecord {
  employeeId: string;
  name: string;
  role: string;
  date: string;
  checkIn: string;
  checkOut: string;
  sessions?: { checkIn: string; checkOut?: string | null }[];
  sessionCount?: number;
  manualRecorded?: boolean;
  status: "Present" | "Absent" | "On Leave" | "Idle";
}

type IdleDayReport = { date: string; employees: number; worked: number };

function attendanceSessions(record: AttendanceRecord) {
  if (record.sessions?.length) return record.sessions;
  if (!record.checkIn) return [];
  return [{ checkIn: record.checkIn, checkOut: record.checkOut }];
}

function displayTime(value?: string | null) {
  return value || "—";
}

function workforceDateToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function displayWorkforceDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function AttendanceView(props: {
  role: "admin" | "manager";
  records: AttendanceRecord[];
}) {
  const { records } = props;

  // Keep UI stable even when no backend wired yet.
  const [loading, setLoading] = useState(false);
  const [localRecords, setLocalRecords] = useState<AttendanceRecord[]>(records);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(workforceDateToday);
  const [rangeMode, setRangeMode] = useState<"day" | "current" | "previous" | "custom">("day");
  const [customFrom, setCustomFrom] = useState(selectedDate);
  const [customTo, setCustomTo] = useState(selectedDate);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AttendanceRecord["status"]>("all");
  const [manualOpen, setManualOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [idleDays, setIdleDays] = useState<IdleDayReport[]>([]);
  const [idleReportError, setIdleReportError] = useState("");
  const idleWindow = useMemo(() => {
    const from = workforceDateToday();
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 29);
    return { from, to: end.toISOString().slice(0, 10) };
  }, []);
  const range = useMemo(() => {
    if (rangeMode === "day") return { from: selectedDate, to: selectedDate };
    if (rangeMode === "custom") return { from: customFrom, to: customTo };
    const today = new Date(`${workforceDateToday()}T00:00:00Z`);
    if (rangeMode === "current") { const from = `${today.getUTCFullYear()}-${String(today.getUTCMonth()+1).padStart(2,"0")}-${today.getUTCDate()<=15?"01":"16"}`; const end = new Date(today.getUTCFullYear(), today.getUTCMonth() + 1, 0).getDate(); return { from, to: `${from.slice(0,8)}${today.getUTCDate()<=15?'15':String(end).padStart(2,'0')}` }; }
    const end = new Date(today); end.setUTCDate(today.getUTCDate()<=15?0:15); const start = new Date(end); start.setUTCDate(end.getUTCDate()<=15?1:16);
    return { from: start.toISOString().slice(0,10), to: end.toISOString().slice(0,10) };
  }, [customFrom, customTo, rangeMode, selectedDate]);
  const loadedRecords = records.length ? records : localRecords;
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return loadedRecords.filter((record) => (statusFilter === "all" || record.status === statusFilter) && (!query || `${record.name} ${record.employeeId} ${record.role}`.toLowerCase().includes(query)));
  }, [loadedRecords, search, statusFilter]);
  const attendancePage = usePagination(filteredRecords, `${range.from}|${range.to}|${search}|${statusFilter}`);

  useEffect(() => {
    if (records.length) return;

    let mounted = true;
    const fetchAttendance = async () => {
      try {
        setError(null);
        setLoading(true);

        // Placeholder endpoint; update when your backend is ready.
        if (range.from > range.to) throw new Error("The start date must be before the end date.");
        const res = await apiFetch(`/api/attendance?from=${range.from}&to=${range.to}`);
        if (!res.ok) throw new Error(`Failed to load attendance (${res.status})`);

        const data = (await res.json()) as AttendanceRecord[];
        if (mounted) setLocalRecords(data);
      } catch (reason: unknown) {
        if (mounted) setError(reason instanceof Error ? reason.message : "Failed to load attendance");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAttendance();
    return () => {
      mounted = false;
    };
  }, [range.from, range.to, records.length, refreshKey]);
  useEffect(() => {
    let active = true;
    apiFetch(`/api/attendance/idle-days?from=${idleWindow.from}&to=${idleWindow.to}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load idle day report."); return data as IdleDayReport[]; })
      .then((data) => { if (active) { setIdleDays(data); setIdleReportError(""); } })
      .catch((reason) => { if (active) { setIdleDays([]); setIdleReportError(reason instanceof Error ? reason.message : "Unable to load idle day report."); } });
    return () => { active = false; };
  }, [idleWindow.from, idleWindow.to, refreshKey]);
  const totals = { present: filteredRecords.filter(r=>r.status==="Present").length, absent: filteredRecords.filter(r=>r.status==="Absent").length, leave: filteredRecords.filter(r=>r.status==="On Leave").length, idle: idleDays.length };

  const exportAttendance = async () => {
    const headers = ["Employee ID", "Employee Name", "Role", "Date", "Status", "Session Count", "Session 1 In", "Session 1 Out", "Session 2 In", "Session 2 Out", "Session 3 In", "Session 3 Out"];
    const rows = filteredRecords.map((record) => {
      const sessions = attendanceSessions(record).slice(0, 3);
      return [record.employeeId, record.name, record.role, record.date, record.status, sessions.length, ...Array.from({ length: 3 }, (_, index) => [sessions[index]?.checkIn, sessions[index]?.checkOut]).flat()];
    });
    void apiFetch("/api/attendance/audit-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format: "csv", from: range.from, to: range.to, recordCount: rows.length }) }).catch(() => undefined);
    downloadCsv(`attendance-${range.from}-to-${range.to}.csv`, headers, rows);
  };

  const statusBadge = (status: AttendanceRecord["status"]) => {
    switch (status) {
      case "Present":
        return (
          <Badge variant="success">
            <Check className="h-3 w-3" /> Present
          </Badge>
        );
      case "Absent":
        return (
          <Badge variant="neutral">
            <X className="h-3 w-3" /> Absent
          </Badge>
        );
      case "On Leave":
        return (
          <Badge variant="info">
            <Clock className="h-3 w-3" /> On Leave
          </Badge>
        );
      case "Idle":
        return <Badge variant="info"><CalendarOff className="h-3 w-3" /> Idle day</Badge>;
      default:
        return <Badge variant="neutral">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Attendance" description="Review daily attendance and up to three sessions per employee." icon={Clock} actions={<>{rangeMode === "day" && <DateNavigator label="Workforce date" value={selectedDate} onChange={setSelectedDate} />}{props.role === "admin" && <button type="button" aria-label="Record attendance" onClick={() => setManualOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"><ShieldCheck className="h-4 w-4" /><span className="header-button-label">Record attendance</span></button>}{props.role === "admin" && <button type="button" aria-label="Idle day" onClick={() => setIdleOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-200 bg-white px-4 text-sm font-semibold text-violet-700 shadow-sm hover:bg-violet-50"><CalendarOff className="h-4 w-4" /><span className="header-button-label">Idle day</span></button>}<button type="button" aria-label="Export CSV" disabled={loading || filteredRecords.length === 0} onClick={() => void exportAttendance()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-200 bg-white px-4 text-sm font-semibold text-violet-700 shadow-sm hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /><span className="header-button-label">Export CSV</span></button></>} />
      {manualOpen && <ManualAttendanceDialog onClose={() => setManualOpen(false)} onSaved={() => setRefreshKey(key => key + 1)} />}
      {idleOpen && <IdleDayDialog onClose={() => setIdleOpen(false)} onSaved={() => setRefreshKey(key => key + 1)} />}
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap gap-2">{([['day','One Day'],['current','Current 15 Days'],['previous','Previous 15 Days'],['custom','Custom Range']] as const).map(([value,label])=><button key={value} type="button" onClick={()=>setRangeMode(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${rangeMode===value?'bg-violet-600 text-white':'border border-slate-200 text-slate-600'}`}>{label}</button>)}</div>{rangeMode==='custom'&&<div className="mt-4 flex flex-wrap gap-3"><label className="text-xs font-semibold text-slate-600">From<input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-2"/></label><label className="text-xs font-semibold text-slate-600">To<input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-2"/></label></div>}<p className="mt-3 text-xs text-slate-500">Showing {displayWorkforceDate(range.from)}{range.from!==range.to?` to ${displayWorkforceDate(range.to)}`:''}</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(totals).map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs capitalize text-slate-500">{label==='leave'?'On leave':label==='idle'?'Upcoming idle days':label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-[11px] text-slate-500">{label === 'idle' ? 'Saved dates in the next 30 days' : 'Employees in current view'}</p></div>)}</div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <Card data-guide="attendance-table">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4"><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search attendance" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, ID, or role" className="pl-9" /></div><label className="flex items-center gap-2 text-sm font-medium text-slate-600"><span className="sr-only">Attendance status</span><select aria-label="Filter attendance by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | AttendanceRecord["status"])} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"><option value="all">All statuses</option><option value="Present">Present</option><option value="Absent">Absent</option><option value="On Leave">On Leave</option><option value="Idle">Idle day</option></select></label></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-slate-400">
                    Loading attendance...
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-sm text-slate-400">
                    No attendance records found in the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                attendancePage.pageItems.map((record) => {
                  const sessions = attendanceSessions(record);
                  return (
                    <TableRow key={`${record.employeeId}-${record.date}`}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{record.name}</div>
                        <div className="text-xs text-slate-400">{record.role}</div>
                        {record.manualRecorded && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700"><ShieldCheck className="h-3 w-3" />Recorded by admin</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-600">{displayWorkforceDate(record.date)}</TableCell>
                      <TableCell>
                        {record.status === "On Leave" ? <div className="min-w-[28rem] text-sm font-medium text-indigo-600">Approved leave — no time-in required</div> : sessions.length === 0 ? <div className="min-w-[28rem] text-sm font-medium text-slate-400">{record.status === "Idle" ? "Optional workday — no time-in required" : "No attendance session recorded"}</div> : <div className="flex min-w-[28rem] flex-wrap gap-2">
                          {sessions.map((session, index) => (
                            <div key={`${record.employeeId}-${record.date}-${index}`} className="min-w-36 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-violet-600">Session {index + 1}</div>
                              <div className="whitespace-nowrap text-xs font-medium text-slate-700">
                                {displayTime(session.checkIn)} <span className="mx-1 text-slate-300">→</span> {session.checkOut ? displayTime(session.checkOut) : <span className="text-amber-600">Open</span>}
                              </div>
                            </div>
                          ))}
                        </div>}
                      </TableCell>
                      <TableCell>{statusBadge(record.status)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <PaginationControls {...attendancePage} onPageChange={attendancePage.setPage} />
        </CardContent>
      </Card>
      <Card>
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6"><h2 className="font-semibold text-slate-900">Upcoming idle days</h2><p className="mt-1 text-sm text-slate-600">Saved dates from {displayWorkforceDate(idleWindow.from)} to {displayWorkforceDate(idleWindow.to)}, nearest first. This report does not follow the attendance filter.</p></div>
        <CardContent className="space-y-3 py-4">
          {idleReportError ? <p role="alert" className="text-sm text-rose-700">{idleReportError}</p> : idleDays.length === 0 ? <p className="text-sm text-slate-500">No idle days are scheduled in the next 30 days.</p> : idleDays.map((item) => <div key={item.date} className="flex flex-col gap-2 rounded-lg border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="font-medium text-slate-900">{displayWorkforceDate(item.date)}</p><p className="text-sm text-slate-700">{item.employees} {item.employees === 1 ? 'employee' : 'employees'} covered{item.date <= idleWindow.from ? ` · ${item.worked} worked` : ''}</p></div>)}
        </CardContent>
      </Card>
    </div>
  );
}

