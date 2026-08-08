import { useEffect, useState } from "react";
import { Check, Clock, X } from "lucide-react";

import { Card, CardContent } from "../components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { apiFetch } from "../lib/api";

export interface AttendanceRecord {
  employeeId: string;
  name: string;
  role: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: "Present" | "Late" | "Absent" | "On Leave";
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
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Attendance</h2>
        <p className="text-sm text-slate-500">View attendance records</p>
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
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-slate-400">
                    Loading attendance...
                  </TableCell>
                </TableRow>
              ) : localRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-slate-400">
                    No attendance records found.
                  </TableCell>
                </TableRow>
              ) : (
                localRecords.map((r) => (
                  <TableRow key={`${r.employeeId}-${r.date}`}> 
                    <TableCell>
                      <div className="font-medium text-slate-900">{r.name}</div>
                      <div className="text-xs text-slate-400">{r.role}</div>
                    </TableCell>
                    <TableCell className="text-slate-600">{r.date}</TableCell>
                    <TableCell className="text-slate-600">{r.checkIn}</TableCell>
                    <TableCell className="text-slate-600">{r.checkOut}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

