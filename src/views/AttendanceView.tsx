import { useEffect, useState } from "react";
import { Check, Clock, X } from "lucide-react";

import { Card, CardContent } from "../components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { apiFetch } from "../lib/api";
import { DateNavigator } from "../components/DateNavigator";

export interface AttendanceRecord {
  employeeId: string;
  name: string;
  role: string;
  date: string;
  checkIn: string;
  checkOut: string;
  sessions?: { checkIn: string; checkOut?: string | null }[];
  sessionCount?: number;
  status: "Present" | "Late" | "Absent" | "On Leave";
}

function attendanceSessions(record: AttendanceRecord) {
  if (record.sessions?.length) return record.sessions;
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
  const filteredRecords = localRecords.filter((record) => record.date === selectedDate);

  useEffect(() => {
    // If parent passed data, render it immediately.
    if (records?.length) {
      setLocalRecords(records);
      return;
    }

    let mounted = true;
    const fetchAttendance = async () => {
      try {
        setError(null);
        setLoading(true);

        // Placeholder endpoint; update when your backend is ready.
        const res = await apiFetch("/api/attendance");
        if (!res.ok) throw new Error(`Failed to load attendance (${res.status})`);

        const data = (await res.json()) as AttendanceRecord[];
        if (mounted) setLocalRecords(data);
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Failed to load attendance");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAttendance();
    return () => {
      mounted = false;
    };
  }, [records]);

  const statusBadge = (status: AttendanceRecord["status"]) => {
    switch (status) {
      case "Present":
        return (
          <Badge variant="success">
            <Check className="h-3 w-3" /> Present
          </Badge>
        );
      case "Late":
        return (
          <Badge variant="warning">
            <Clock className="h-3 w-3" /> Late
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
      default:
        return <Badge variant="neutral">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Attendance</h2>
          <p className="text-sm text-slate-500">View up to three time-in and time-out sessions per employee each day.</p>
        </div>

        <DateNavigator label="Workforce date" value={selectedDate} onChange={setSelectedDate} />
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <Card data-guide="attendance-table">
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
                    No attendance records found for {displayWorkforceDate(selectedDate)}.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((record) => {
                  const sessions = attendanceSessions(record);
                  return (
                    <TableRow key={`${record.employeeId}-${record.date}`}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{record.name}</div>
                        <div className="text-xs text-slate-400">{record.role}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-600">{record.date}</TableCell>
                      <TableCell>
                        {record.status === "On Leave" ? <div className="min-w-[28rem] text-sm font-medium text-indigo-600">Approved leave — no time-in required</div> : <div className="flex min-w-[28rem] flex-wrap gap-2">
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
        </CardContent>
      </Card>
    </div>
  );
}

