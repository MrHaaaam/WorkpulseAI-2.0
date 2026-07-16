import { useState, useMemo } from "react";
import { 
  Search, 
  Filter, 
  UserCheck, 
  UserMinus, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpDown, 
  Download,
  FileText,
  Flag,
  Bell
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";

// Type definitions
interface AttendanceRecord {
  employeeId: string;
  name: string;
  role: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: "Present" | "Late" | "Absent" | "On Leave";
  biometricVerified: boolean;
}

interface AttendanceViewProps {
  role: "admin" | "manager";
}

const initialAttendanceRecords: AttendanceRecord[] = [
  { employeeId: "EMP-001", name: "Sarah Jenkins", role: "Staff", date: "2026-07-16", checkIn: "08:15 AM", checkOut: "05:00 PM", status: "Late", biometricVerified: true },
  { employeeId: "EMP-002", name: "Marcus Ray", role: "Manager", date: "2026-07-16", checkIn: "07:45 AM", checkOut: "04:30 PM", status: "Present", biometricVerified: true },
  { employeeId: "EMP-003", name: "Elena Rodriguez", role: "Staff", date: "2026-07-16", checkIn: "07:55 AM", checkOut: "05:00 PM", status: "Present", biometricVerified: true },
  { employeeId: "EMP-004", name: "David Chen", role: "Admin", date: "2026-07-16", checkIn: "08:02 AM", checkOut: "05:15 PM", status: "Present", biometricVerified: true },
  { employeeId: "EMP-005", name: "James Wilson", role: "Staff", date: "2026-07-16", checkIn: "09:12 AM", checkOut: "06:00 PM", status: "Late", biometricVerified: false },
  { employeeId: "EMP-006", name: "Alina Kova", role: "Staff", date: "2026-07-16", checkIn: "--:--", checkOut: "--:--", status: "Absent", biometricVerified: false },
  { employeeId: "EMP-007", name: "Robert Downey", role: "Staff", date: "2026-07-16", checkIn: "--:--", checkOut: "--:--", status: "On Leave", biometricVerified: false },
];

export default function AttendanceView({ role }: AttendanceViewProps) {
  const isAdmin = role === "admin";
  
  const [records, setRecords] = useState<AttendanceRecord[]>(initialAttendanceRecords);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Filtered and Sorted Records
  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => {
        const matchesSearch = 
          record.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          record.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || record.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortOrder === "asc") {
          return a.name.localeCompare(b.name);
        } else {
          return b.name.localeCompare(a.name);
        }
      });
  }, [records, searchQuery, statusFilter, sortOrder]);

  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter(r => r.status === "Present" || r.status === "Late").length;
    const late = records.filter(r => r.status === "Late").length;
    const absent = records.filter(r => r.status === "Absent").length;
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
    
    return { total, present, late, absent, attendanceRate };
  }, [records]);

  // Handle action button events
  const handleActionClick = (employeeId: string, actionType: "ping" | "redflag") => {
    const actionMsg = actionType === "redflag" 
      ? `🚨 Red Flagged employee ${employeeId} for attendance violation.`
      : `🔔 Sent ping reminder to employee ${employeeId}.`;
    alert(actionMsg);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {isAdmin ? "Admin Attendance Management" : "Team Attendance"}
          </h2>
          <p className="text-sm text-slate-500 font-normal">
            {isAdmin 
              ? "Oversee organization-wide clock-ins, trigger flags, and send system pings." 
              : "Monitor your direct reports' daily presence, schedules, and active statuses."}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex items-center gap-2 text-slate-700">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          {isAdmin && (
            <Button size="sm" className="bg-[#8642ED] hover:bg-[#7232d1] text-white">
              <FileText className="h-4 w-4 mr-2" /> Sync Biometrics
            </Button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-[#8642ED]">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Tracked Staff</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.total}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Attendance Rate</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.attendanceRate}%</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Late Arrivals</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.late}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <UserMinus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Absent Today</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.absent}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Control Panel */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff by name or employee ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8642ED]/25 focus:border-[#8642ED]"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase">Filters</span>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-1 focus:ring-[#8642ED]"
              >
                <option value="all">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Absent">Absent</option>
                <option value="On Leave">On Leave</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                className="text-xs border border-slate-200 text-slate-600 font-medium"
              >
                Sort <ArrowUpDown className="ml-1.5 h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-3.5">Employee ID</th>
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Check In</th>
                  <th className="px-6 py-3.5">Check Out</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.length > 0 ? (
                  filteredRecords.map((record) => {
                    const isAbsent = record.status === "Absent";
                    const isLate = record.status === "Late";

                    return (
                      <tr 
                        key={record.employeeId} 
                        className={`transition-colors ${
                          isAbsent 
                            ? "bg-rose-50/70 hover:bg-rose-100/60" 
                            : "hover:bg-slate-50/40"
                        }`}
                      >
                        {/* ID */}
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-400">
                          {record.employeeId}
                        </td>
                        
                        {/* Name & Role */}
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-semibold text-slate-900 text-[14px]">{record.name}</p>
                            <p className="text-[11px] text-slate-400 font-medium">{record.role}</p>
                          </div>
                        </td>
                        
                        {/* Check In */}
                        <td className="px-6 py-4 font-semibold text-xs text-slate-700">
                          {record.checkIn}
                        </td>

                        {/* Check Out */}
                        <td className="px-6 py-4 font-semibold text-xs text-slate-700">
                          {record.checkOut}
                        </td>

                        {/* Status Badges */}
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            record.status === "Present" ? "text-emerald-700 bg-emerald-50" :
                            record.status === "Late" ? "text-amber-700 bg-amber-50" :
                            record.status === "Absent" ? "text-rose-700 bg-rose-50/10 border border-rose-200" :
                            "text-indigo-700 bg-indigo-50"
                          }`}>
                            {record.status}
                          </span>
                        </td>

                        {/* Actions (Ping / Redflag Icons) */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isAbsent || isLate ? (
                              <button
                                onClick={() => handleActionClick(record.employeeId, "redflag")}
                                title="Red Flag Violation"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors"
                              >
                                <Flag className="h-4 w-4 fill-current" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActionClick(record.employeeId, "ping")}
                                title="Ping Staff"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                              >
                                <Bell className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <AlertCircle className="h-8 w-8 mb-2 stroke-[1.5]" />
                        <p className="text-sm font-medium">No attendance records match your query.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}