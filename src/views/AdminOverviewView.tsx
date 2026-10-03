import { Input } from "../components/ui/Input";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { useState } from "react";
import { 
  Users, 
  UserPlus,
  UserCheck, 
  Clock, 
  Fingerprint, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  ReceiptText, 
  AlertCircle, 
  CheckCircle2,
  Gauge,
  WalletCards,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Tabs } from "../components/ui/Tabs";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { DateNavigator } from "../components/DateNavigator";
import { PaginationControls } from "../components/ui/Pagination";
import { usePagination } from "../hooks/usePagination";

type ViewMode = "daily" | "weekly" | "monthly";

// Shared Interfaces for Data Hydration
export interface TrendMetrics {
  label: string;
  present: number;
  late: number;
  absent: number;
  uniquePresent: number;
}

export interface BreakdownItem {
  name: string;
  value: number;
  color: string;
}

export interface AuditLogItem {
  id: string | number;
  user: string;
  role: "Admin" | "Manager" | "Staff" | string;
  action: string;
  time: string;
  date: string;
  status: "Success" | "On Time" | "Late" | "Pending" | string;
  detail?: string;
}

// Unified UI Color Map Configurations
const cardColorStyles = {
  purple: { bg: "bg-[#8642ED]/10", text: "text-[#8642ED]" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-600" },
};

/* ==========================================================================
   1. ADMIN OVERVIEW COMPONENT
   ========================================================================== */
interface AdminOverviewProps {
  attendanceTrends: Record<ViewMode, TrendMetrics[]>;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  auditTrail: AuditLogItem[];
  metrics: {
    totalStaff: number;
    activeWorkforce: number;
    workforceEligible: number;
    pendingPayrollCount: number;
    biometricKeysActive: number;
  };
  analytics: {
    attendanceRate: number;
    punctualityRate: number;
    payrollCompletion: number;
  };
  latestAttendanceDate?: string;
  performanceDate: string;
  onPerformanceDateChange: (value: string) => void;
  employees: { createdAt?: string; role?: string; status?: string }[];
  leaveRequests: { id: string; employeeId?: string; startDate: string; endDate: string; approvedDates?: string[]; totalDays: number; status: string }[];
  attendanceRecords: { employeeId?: string; date?: string; status: string; worked?: boolean }[];
  onNavigate?: (view: "attendance" | "employees" | "leave" | "payroll" | "settings" | "admin" | "insights") => void;
  auditLoading?: boolean;
  auditError?: string;
  auditDate: string;
  onAuditDateChange: (value: string) => void;
}

export function AdminOverviewView({ 
  attendanceTrends, 
  viewMode,
  onViewModeChange,
  auditTrail = [], 
  metrics,
  analytics,
  latestAttendanceDate,
  performanceDate,
  onPerformanceDateChange,
  employees = [],
  leaveRequests = [],
  attendanceRecords = [],
  onNavigate,
  auditLoading = false,
  auditError = '',
  auditDate,
  onAuditDateChange,
}: AdminOverviewProps) {
  const auditPage = usePagination(auditTrail, auditDate);
  const chartData = attendanceTrends?.[viewMode] || [];
  const chartHasData = chartData.some((item) => item.present > 0 || item.absent > 0);
  const chartSummary = chartData.map((item) => `${item.label}: ${item.present} present, ${item.absent} recorded absent`).join("; ");
  const anchor = new Date(`${performanceDate}T00:00:00Z`);
  const bucketStart = (date: Date) => {
    const start = new Date(date);
    if (viewMode === "weekly") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    if (viewMode === "monthly") start.setUTCDate(1);
    return start;
  };
  const hiringData = Array.from({ length: viewMode === "daily" ? 7 : 6 }, (_, index) => {
    const date = bucketStart(anchor);
    const offset = (viewMode === "daily" ? 6 : 5) - index;
    if (viewMode === "daily") date.setUTCDate(date.getUTCDate() - offset);
    else if (viewMode === "weekly") date.setUTCDate(date.getUTCDate() - offset * 7);
    else date.setUTCMonth(date.getUTCMonth() - offset);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", ...(viewMode === "monthly" ? {} : { day: "numeric" }) });
    return { label, key, count: 0 };
  });
  const chartRangeStart = hiringData[0].key;
  const chartRangeStartLabel = new Date(`${chartRangeStart}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  employees.forEach((employee) => {
    if (!employee.createdAt) return;
    const created = new Date(employee.createdAt);
    if (Number.isNaN(created.getTime())) return;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(created);
    const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value || "";
    const createdDate = `${part("year")}-${part("month")}-${part("day")}`;
    if (createdDate < chartRangeStart || createdDate > performanceDate) return;
    const bucketKey = bucketStart(new Date(`${createdDate}T00:00:00Z`)).toISOString().slice(0, 10);
    const bucket = hiringData.find((item) => item.key === bucketKey);
    if (bucket) bucket.count += 1;
  });
  const hiringSummary = hiringData.map((item) => `${item.key}: ${item.count} registered`).join("; ");
  const leavesInRange = leaveRequests.filter((leave) => leave.startDate <= performanceDate && leave.endDate >= chartRangeStart);
  const leaveStatusData = [
    { label: "Pending", count: leavesInRange.filter((leave) => leave.status.toLowerCase() === "pending").length, fill: "#f59e0b" },
    { label: "Approved", count: leavesInRange.filter((leave) => leave.status.toLowerCase() === "approved").length, fill: "#10b981" },
    { label: "Rejected", count: leavesInRange.filter((leave) => leave.status.toLowerCase() === "rejected").length, fill: "#ef4444" },
  ];
  const leaveStatusSummary = leaveStatusData.map((item) => `${item.label}: ${item.count}`).join("; ");
  const totalLeaveRequests = leaveStatusData.reduce((total, item) => total + item.count, 0);
  const newEmployeesInPeriod = hiringData.reduce((total, item) => total + item.count, 0);
  const performanceDateLabel = new Date(`${performanceDate}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  });
  const approvedLeavesForDate = leaveRequests.filter((leave) => {
    if (leave.status !== "approved") return false;
    return leave.approvedDates?.length ? leave.approvedDates.includes(performanceDate) : leave.startDate <= performanceDate && leave.endDate >= performanceDate;
  });
  const performanceRecords = attendanceRecords.filter((record) => record.date === performanceDate);
  const attendedEmployeeIds = new Set(performanceRecords.flatMap((record, index) =>
    record.status === "Present" || (record.status === "Idle" && record.worked) ? [record.employeeId || `record-${index}`] : []));
  const attendedForDate = attendedEmployeeIds.size;
  const onTimeForDate = attendedForDate;
  const employeesOnLeave = new Set(approvedLeavesForDate.map((leave) => leave.employeeId || leave.id).filter((id) => !attendedEmployeeIds.has(id))).size;
  const idleWithoutWork = new Set(performanceRecords.flatMap((record, index) =>
    record.status === "Idle" && !record.worked && !attendedEmployeeIds.has(record.employeeId || `record-${index}`) ? [record.employeeId || `record-${index}`] : [])).size;
  const expectedWorkforceForDate = Math.max(attendedForDate, metrics.workforceEligible - employeesOnLeave - idleWithoutWork);
  const manilaTodayParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const todayPart = (type: "year" | "month" | "day") => manilaTodayParts.find((part) => part.type === type)?.value || "";
  const manilaToday = `${todayPart("year")}-${todayPart("month")}-${todayPart("day")}`;
  const attendanceReviewCount = performanceDate < manilaToday ? Math.max(0, expectedWorkforceForDate - attendedForDate) : 0;
  const attendanceRateForDate = expectedWorkforceForDate ? attendedForDate / expectedWorkforceForDate * 100 : 0;
  const registeredOnSelectedDate = employees.filter((employee) => {
    if (!employee.createdAt) return false;
    const createdAt = new Date(employee.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(createdAt);
    const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value || "";
    return `${value("year")}-${value("month")}-${value("day")}` === performanceDate;
  }).length;
  const roleCounts = ([
    { key: "supervisor", label: "Supervisors", color: "bg-slate-700" },
    { key: "manager", label: "Managers", color: "bg-violet-600" },
    { key: "regular", label: "Regular", color: "bg-sky-600" },
    { key: "extra", label: "Extra", color: "bg-teal-600" },
  ] as const).map((role) => ({ ...role, count: employees.filter((employee) => employee.role?.toLowerCase() === role.key && employee.status !== "inactive").length }));
  const roleTotal = roleCounts.reduce((total, role) => total + role.count, 0);
  const failedAuditEvents = auditTrail.filter((event) => event.status === "Failed").length;
  const performanceMetrics = [
    { label: "Attendance rate", value: attendanceRateForDate, icon: Gauge, color: "text-emerald-600", bar: "bg-emerald-500", hint: attendedForDate ? `${attendedForDate} of ${expectedWorkforceForDate} expected employees recorded attendance` : "No attendance has been recorded for this date", format: "percent" as const, unavailable: expectedWorkforceForDate === 0 },
    { label: "New employees registered", value: registeredOnSelectedDate, icon: UserPlus, color: "text-violet-600", bar: "bg-violet-500", hint: "Created on the selected date", format: "count" as const },
    { label: "Payroll completion", value: analytics.payrollCompletion, icon: WalletCards, color: "text-amber-600", bar: "bg-amber-500", hint: "Requests marked as paid", format: "percent" as const },
  ];

  const adminMetrics = [
    { label: "Expected workforce", value: expectedWorkforceForDate, progress: metrics.workforceEligible ? expectedWorkforceForDate / metrics.workforceEligible * 100 : 0, hint: "Eligible staff, excluding leave without attendance and idle days", icon: Users, color: "text-violet-600", bar: "bg-violet-500" },
    { label: "Present", value: onTimeForDate, progress: expectedWorkforceForDate ? onTimeForDate / expectedWorkforceForDate * 100 : 0, hint: "Recorded attendance on the selected date", icon: UserCheck, color: "text-emerald-600", bar: "bg-emerald-500" },
    { label: "No attendance recorded", value: Math.max(0, expectedWorkforceForDate - attendedForDate), progress: expectedWorkforceForDate ? Math.max(0, expectedWorkforceForDate - attendedForDate) / expectedWorkforceForDate * 100 : 0, hint: "Review before treating these records as absences", icon: AlertCircle, color: "text-red-600", bar: "bg-red-500" },
    { label: "On approved leave", value: employeesOnLeave, progress: metrics.workforceEligible ? employeesOnLeave / metrics.workforceEligible * 100 : 0, hint: "No time-in required for the selected date", icon: Calendar, color: "text-sky-600", bar: "bg-sky-500" },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Admin Overview" description="Track your workforce, attendance, and items to review." icon={Activity} actions={<><Tabs ariaLabel="Overview chart period" value={viewMode} onValueChange={(value) => onViewModeChange(value as ViewMode)} items={[{ value: "daily", label: "Daily", shortLabel: "D" }, { value: "weekly", label: "Weekly", shortLabel: "W" }, { value: "monthly", label: "Monthly", shortLabel: "M" }]} /><DateNavigator label="Overview date" value={performanceDate} onChange={onPerformanceDateChange} /></>} />

      {/* Workforce inventory cards */}
      <Card data-guide="workforce-operations">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daily Workforce</CardTitle>
              <CardDescription>Staffing status for {performanceDateLabel}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div aria-live="polite" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {adminMetrics.map((m) => {
          const Icon = m.icon;
          const safeProgress = Math.max(0, Math.min(100, m.progress));
          return (
            <div key={m.label} className="motion-safe:animate-fade-in rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600">{m.label}</p>
                  <Icon className={`h-4 w-4 ${m.color}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{m.value}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${safeProgress}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-600">{m.hint}</span>
                  <span className={`shrink-0 font-semibold ${m.color}`}>{safeProgress.toFixed(0)}%</span>
                </div>
            </div>
          );
        })}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500"><strong>Review note:</strong> “No attendance recorded” may mean a missed scan, an incomplete record, or an absence. Verify the employee’s schedule and circumstances before taking action.</p>
        </CardContent>
      </Card>

      <Card data-guide="performance-snapshot">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Attendance Performance</CardTitle>
              <CardDescription>Rates calculated from records for {performanceDateLabel}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {performanceMetrics.map((metric) => {
              const Icon = metric.icon;
              const safeValue = Math.max(0, metric.value);
              const progressValue = metric.format === "count"
                ? (metrics.totalStaff ? Math.min(100, safeValue / metrics.totalStaff * 100) : 0)
                : Math.min(100, safeValue);
              return (
                <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">{metric.label}</p>
                    <Icon className={`h-4 w-4 ${metric.color}`} />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {'unavailable' in metric && metric.unavailable ? "No data" : metric.format === "count" ? safeValue : `${safeValue.toFixed(1)}%`}
                  </p>
                  {metric.format !== "count" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={metric.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressValue)}>
                    <div className={`h-full rounded-full ${metric.bar}`} style={{ width: `${progressValue}%` }} />
                  </div>}
                  <p className="mt-2 text-[11px] leading-5 text-slate-600">{metric.hint}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Primary Analytics Visualization Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card data-guide="attendance-trends" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Workforce Attendance Trends</CardTitle>
            <CardDescription>Present vs recorded absent by {viewMode === "daily" ? "day" : viewMode === "weekly" ? "week" : "month"}, {chartRangeStartLabel} to {performanceDateLabel}{latestAttendanceDate ? ` · latest record ${latestAttendanceDate}` : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="sr-only">Attendance trend summary. {chartSummary || "No attendance data is available for this period."}</p>
            {chartHasData ? <div role="img" aria-label={`Attendance trend for the ${viewMode} view. ${chartSummary}`}><ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresentAdmin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAbsentAdmin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                <Area type="linear" dataKey="present" name="Present" stroke="#10b981" strokeWidth={2} fill="url(#colorPresentAdmin)" />
                <Area type="linear" dataKey="absent" name="Recorded absent" stroke="#dc2626" strokeWidth={2} strokeDasharray="2 3" fill="url(#colorAbsentAdmin)" />
              </AreaChart>
            </ResponsiveContainer></div> : <div className="grid h-[300px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">No attendance trend is available for this period. Add or verify attendance records to generate the chart.</div>}
          </CardContent>
        </Card>

        <Card data-guide="today-breakdown">
          <CardHeader>
            <CardTitle>Employees by Role</CardTitle>
            <CardDescription>Active workforce across the four employee roles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-end justify-between border-b border-slate-200 pb-5">
              <div><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total employees</p><p className="mt-1 text-4xl font-semibold tabular-nums text-slate-900">{roleTotal}</p></div>
              <Users className="h-6 w-6 text-slate-400" aria-hidden="true" />
            </div>
            <div className="space-y-5" aria-label="Employee count by role">
              {roleCounts.map((role) => <div key={role.key}>
                <div className="mb-2 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium text-slate-700">{role.label}</span><span className="font-semibold tabular-nums text-slate-900">{role.count}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${role.color}`} style={{ width: `${roleTotal ? role.count / roleTotal * 100 : 0}%` }} /></div>
              </div>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <section aria-label="Workforce and leave analytics">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>New Employees by {viewMode === "daily" ? "Day" : viewMode === "weekly" ? "Week" : "Month"}</CardTitle><CardDescription>{chartRangeStartLabel} to {performanceDateLabel}</CardDescription></CardHeader>
            <CardContent>
              <p className="sr-only">New employees by {viewMode === "daily" ? "day" : viewMode === "weekly" ? "week" : "month"}. {hiringSummary}</p>
              <div className="mb-5 flex items-baseline gap-2 border-b border-slate-100 pb-4">
                <span className="text-3xl font-semibold tracking-tight text-slate-900">{newEmployeesInPeriod}</span>
                <span className="text-xs text-slate-500">new employees in this range</span>
              </div>
              {newEmployeesInPeriod > 0 ? <div role="img" aria-label={`New employees by ${viewMode}. ${hiringSummary}`}><ResponsiveContainer width="100%" height={205}>
                <BarChart data={hiringData} margin={{ top: 8, right: 8, left: -30, bottom: 0 }} barCategoryGap="45%">
                  <CartesianGrid vertical={false} stroke="#e9edf3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickMargin={10} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickCount={4} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px", boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }} />
                  <Bar dataKey="count" name="New employees" fill="#64748b" maxBarSize={36} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer></div> : <div className="grid h-[205px] place-items-center border-t border-slate-100 text-center text-sm text-slate-500">No employees were registered in this range.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Leave Request Status</CardTitle><CardDescription>Requests overlapping {chartRangeStartLabel} to {performanceDateLabel}</CardDescription></CardHeader>
            <CardContent>
              <p className="sr-only">Leave request status. {leaveStatusSummary}</p>
              <div className="mb-5 flex items-baseline gap-2 border-b border-slate-100 pb-4">
                <span className="text-3xl font-semibold tracking-tight text-slate-900">{totalLeaveRequests}</span>
                <span className="text-xs text-slate-500">total requests</span>
              </div>
              {totalLeaveRequests > 0 ? <div className="flex h-[205px] flex-col justify-center gap-6" role="img" aria-label={`Leave request status. ${leaveStatusSummary}`}>
                {leaveStatusData.map((item) => <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-slate-700">{item.label}</span><span className="tabular-nums font-semibold text-slate-900">{item.count}<span className="ml-2 text-xs font-normal text-slate-400">{Math.round(item.count / totalLeaveRequests * 100)}%</span></span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${item.count / totalLeaveRequests * 100}%`, backgroundColor: item.fill }} /></div>
                </div>)}
              </div> : <div className="grid h-[205px] place-items-center border-t border-slate-100 text-center text-sm text-slate-500">No leave requests are available.</div>}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Comparison Infrastructure & Secondary Widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Activity className="h-4 w-4 text-slate-700" />
                Attention Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {attendanceReviewCount > 0 && <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3">
                <div className="flex items-center gap-3"><div className="rounded-full bg-red-100 p-2 text-red-700"><AlertCircle className="h-4 w-4" /></div><div><h4 className="text-xs font-semibold text-red-950">Attendance records to review</h4><p className="text-[11px] leading-5 text-red-800">{attendanceReviewCount} expected {attendanceReviewCount === 1 ? "employee has" : "employees have"} no recorded attendance. This is not automatically a confirmed absence.</p></div></div>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.("attendance")} className="h-7 shrink-0 text-xs">Review</Button>
              </div>}
              {metrics.pendingPayrollCount > 0 && <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                    <ReceiptText className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-amber-900">Payroll periods to review</h4>
                    <p className="text-[11px] text-amber-700">{metrics.pendingPayrollCount} records still processing after their pay period ended</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => onNavigate?.("payroll")} className="h-7 border-0 bg-amber-500 text-xs text-white hover:bg-amber-600">View</Button>
              </div>}

              {failedAuditEvents > 0 && <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-200 p-2 text-slate-600">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">Recent Failed Actions</h4>
                    <p className="text-[11px] text-slate-500">{failedAuditEvents} failures in the loaded audit records</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => document.getElementById("overview-audit-trail")?.scrollIntoView({ behavior: "smooth" })}>Logs</Button>
              </div>}
              {attendanceReviewCount === 0 && metrics.pendingPayrollCount === 0 && failedAuditEvents === 0 && <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5 shrink-0" /><span>No attendance, payroll, or audit items currently require review.</span></div>}
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Admin Quick Actions</CardTitle><CardDescription>Open the areas administrators use most often</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <QuickAction icon={Clock} title="Review attendance" description="Check time-ins and attendance status" tone="emerald" onClick={() => onNavigate?.("attendance")} />
                <QuickAction icon={Users} title="Manage employees" description="Add or update employee records" tone="violet" onClick={() => onNavigate?.("employees")} />
                <QuickAction icon={Calendar} title="Review leave" description="Open employee leave requests" tone="sky" onClick={() => onNavigate?.("leave")} />
                <QuickAction icon={SettingsIcon} title="System settings" description="Update work and attendance rules" tone="amber" onClick={() => onNavigate?.("settings")} />
              </div>
            </CardContent>
          </Card>
      </div>

      {/* Global Audit Log */}
      <Card id="overview-audit-trail" data-guide="audit-trail">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-slate-600" />
                System Audit Trail & Recent Activity
              </CardTitle>
              <CardDescription>Sign-ins, fingerprint scans, and workforce changes for the selected date</CardDescription>
            </div>
            <DateNavigator label="Audit date" value={auditDate} onChange={onAuditDateChange} />
          </div>
        </CardHeader>
        <CardContent>
          <div className={`overflow-x-auto ${auditTrail.length >= 15 ? 'max-h-[42rem] overflow-y-auto' : ''}`}>
            <table className="w-full text-left text-sm text-slate-600">
              <caption className="sr-only">System audit events showing the screen, access level, action, timestamp, and outcome.</caption>
              <thead className={`border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 ${auditTrail.length >= 15 ? 'sticky top-0 z-10 shadow-sm' : ''}`}>
                <tr>
                  <th className="px-4 py-3 font-medium">Screen Name</th>
                  <th className="px-4 py-3 font-medium">Access Level</th>
                  <th className="px-4 py-3 font-medium">Executed Action</th>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Status Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditPage.pageItems.map((activity) => (
                  <tr key={activity.id} tabIndex={0} title={activity.detail} aria-label={activity.detail} className="group relative outline-none hover:bg-slate-50/70 focus:bg-violet-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{activity.user}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        activity.role === 'Admin' ? 'bg-violet-100 text-violet-700' :
                        activity.role === 'Manager' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{activity.role}</span>
                    </td>
                    <td className="min-w-64 px-4 py-3 text-slate-700"><p className="font-medium">{activity.action}</p>{activity.detail && <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer py-1 font-medium text-violet-700">View details</summary><p className="mt-1 max-w-md whitespace-normal leading-5">{activity.detail}</p></details>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500 text-xs">
                      {activity.time} <span className="text-slate-400">({activity.date})</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        activity.status === 'Success' || activity.status === 'On Time' 
                          ? 'text-emerald-700 bg-emerald-50' 
                          : activity.status === 'Failed'
                          ? 'text-rose-700 bg-rose-50'
                          : activity.status === 'Late'
                          ? 'text-amber-700 bg-amber-50' 
                          : 'text-slate-600 bg-slate-100'
                      }`}>{activity.status}</span>
                    </td>
                  </tr>
                ))}
                {auditTrail.length === 0 && <tr><td colSpan={5} className={`px-4 py-10 text-center text-sm ${auditError ? 'text-rose-600' : 'text-slate-400'}`}>{auditLoading ? 'Loading audit events…' : auditError || 'No activity recorded for this date.'}</td></tr>}
              </tbody>
            </table>
            <PaginationControls {...auditPage} onPageChange={auditPage.setPage} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuickAction({ icon: Icon, title, description, tone, onClick }: { icon: React.ElementType; title: string; description: string; tone: "emerald" | "violet" | "sky" | "amber"; onClick: () => void }) {
  const styles = { emerald: "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-300 hover:bg-emerald-100 focus-visible:ring-emerald-500", violet: "border-violet-200 bg-violet-50 text-violet-950 hover:border-violet-300 hover:bg-violet-100 focus-visible:ring-violet-500", sky: "border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-300 hover:bg-sky-100 focus-visible:ring-sky-500", amber: "border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300 hover:bg-amber-100 focus-visible:ring-amber-500" };
  return <button type="button" onClick={onClick} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 ${styles[tone]}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/80"><Icon className="h-4 w-4" /></span><span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs opacity-80">{description}</span></span></button>;
}

/* ========================================================================== 
   2. MANAGER OVERVIEW COMPONENT
   ========================================================================== */
interface OverviewViewProps {
  attendanceTrends: Record<ViewMode, TrendMetrics[]>;
  liveBreakdown: BreakdownItem[];
  recentActivities: AuditLogItem[];
  metrics: {
    totalActiveStaff: number;
    presentToday: number;
    lateClockIns: number;
    registeredBiometricKeys: number;
  };
}

export function OverviewView({ 
  attendanceTrends, 
  liveBreakdown = [], 
  recentActivities = [], 
  metrics 
}: OverviewViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const chartData = attendanceTrends?.[viewMode] || [];
  const activityPage = usePagination(recentActivities);

  const managerMetrics = [
    { label: "Total Active Staff", value: metrics.totalActiveStaff.toString(), change: "+2", trend: "up", icon: Users, ...cardColorStyles.purple },
    { label: "Present Today", value: metrics.presentToday.toString(), change: "+1", trend: "up", icon: UserCheck, ...cardColorStyles.emerald },
    { label: "Registered Biometric Keys", value: metrics.registeredBiometricKeys.toString(), change: "+3", trend: "up", icon: Fingerprint, ...cardColorStyles.violet },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Overview Dashboard</h2>
          <p className="text-sm text-slate-500">Attendance analytics and workforce insights</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <Input
              type="text"
              defaultValue="Jul 01 – Jul 13, 2026"
              className="text-sm font-medium text-slate-700 outline-none bg-transparent"
              readOnly
            />
          </div>
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
            items={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>
      </div>

      {/* Metric Information Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {managerMetrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} className="animate-fade-in">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${m.bg} shadow-sm`}>
                    <Icon className={`h-5 w-5 ${m.text}`} />
                  </div>
                  <Badge variant={m.trend === "up" ? "success" : "danger"}>
                    {m.trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {m.change}
                  </Badge>
                </div>
                <p className="mt-4 text-3xl font-bold text-slate-900">{m.value}</p>
                <p className="text-sm text-slate-500">{m.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Core Analytic Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attendance Trends</CardTitle>
            <CardDescription>Present vs Absent — {viewMode} view</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresentMgr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAbsentMgr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                <Area type="monotone" dataKey="present" name="Present" stroke="#10b981" strokeWidth={2} fill="url(#colorPresentMgr)" />
                <Area type="monotone" dataKey="absent" name="Absent" stroke="#ef4444" strokeWidth={2} fill="url(#colorAbsentMgr)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today's Breakdown</CardTitle>
            <CardDescription>Live attendance distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={liveBreakdown}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {liveBreakdown.map((entry, index) => (
                    <Cell key={`cell-mgr-${index}`} fill={entry.color || "#cbd5e1"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Operational Logs & Bar Comparison Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Comparison</CardTitle>
            <CardDescription>Bar chart comparison — {viewMode} view</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                <Bar dataKey="present" name="Present" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-slate-500" />
                  Recent Activities
                </CardTitle>
                <CardDescription>Latest actions from staff, managers, and admins</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50/50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activityPage.pageItems.map((activity) => (
                    <tr key={activity.id} className="hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{activity.user}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          activity.role === 'Admin' ? 'bg-violet-100 text-violet-700' :
                          activity.role === 'Manager' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>{activity.role}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{activity.action}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500 text-xs">
                        {activity.time} <span className="text-slate-400">({activity.date})</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          activity.status === 'Success' || activity.status === 'On Time' 
                            ? 'text-emerald-700 bg-emerald-50' 
                            : activity.status === 'Failed'
                          ? 'text-rose-700 bg-rose-50'
                          : activity.status === 'Late'
                            ? 'text-amber-700 bg-amber-50' 
                            : 'text-slate-600 bg-slate-100'
                        }`}>{activity.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls {...activityPage} onPageChange={activityPage.setPage} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
