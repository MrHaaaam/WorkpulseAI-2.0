import { useState } from "react";
import { 
  Users, 
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
  Timer,
  WalletCards,
  ShieldCheck,
  BookOpen,
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

type ViewMode = "daily" | "weekly" | "monthly";

// Shared Interfaces for Data Hydration
export interface TrendMetrics {
  label: string;
  present: number;
  late: number;
  absent: number;
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
  liveBreakdown: BreakdownItem[];
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
    biometricCoverage: number;
    payrollCompletion: number;
  };
  latestAttendanceDate?: string;
  leaveRequests: { id: string; employeeId?: string; startDate: string; endDate: string; totalDays: number; status: string }[];
  attendanceRecords: { date?: string; status: string }[];
  onStartGuide?: () => void;
  auditLoading?: boolean;
  auditError?: string;
}

export function AdminOverviewView({ 
  attendanceTrends, 
  liveBreakdown = [], 
  auditTrail = [], 
  metrics,
  analytics,
  latestAttendanceDate,
  leaveRequests = [],
  attendanceRecords = [],
  onStartGuide,
  auditLoading = false,
  auditError = '',
}: AdminOverviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [workforceDate, setWorkforceDate] = useState(latestAttendanceDate || new Date().toISOString().slice(0, 10));
  const [performanceDate, setPerformanceDate] = useState(latestAttendanceDate || new Date().toISOString().slice(0, 10));
  const chartData = attendanceTrends?.[viewMode] || [];
  const approvedLeavesForDate = leaveRequests.filter((leave) => {
    if (leave.status !== "approved") return false;
    return leave.startDate <= workforceDate && leave.endDate >= workforceDate;
  });
  const employeesOnLeave = new Set(approvedLeavesForDate.map((leave) => leave.employeeId || leave.id)).size;
  const activeForDate = Math.max(0, metrics.workforceEligible - employeesOnLeave);
  const performanceRecords = attendanceRecords.filter((record) => record.date === performanceDate);
  const attendedForDate = performanceRecords.filter((record) => record.status === "Present" || record.status === "Late").length;
  const onTimeForDate = performanceRecords.filter((record) => record.status === "Present").length;
  const attendanceRateForDate = performanceRecords.length ? attendedForDate / performanceRecords.length * 100 : 0;
  const punctualityRateForDate = attendedForDate ? onTimeForDate / attendedForDate * 100 : 0;
  const performanceMetrics = [
    { label: "Attendance rate", value: attendanceRateForDate, icon: Gauge, color: "text-emerald-600", bar: "bg-emerald-500", hint: "Present and late on selected date" },
    { label: "On-time arrival", value: punctualityRateForDate, icon: Timer, color: "text-sky-600", bar: "bg-sky-500", hint: "On time among selected-day attendees" },
    { label: "Employees registered", value: analytics.biometricCoverage, icon: ShieldCheck, color: "text-violet-600", bar: "bg-violet-500", hint: "Staff with enrolled biometrics" },
    { label: "Payroll completion", value: analytics.payrollCompletion, icon: WalletCards, color: "text-amber-600", bar: "bg-amber-500", hint: "Requests marked as paid" },
  ];

  const adminMetrics = [
    { label: "Total Registered Staff", value: metrics.totalStaff, progress: metrics.totalStaff ? 100 : 0, hint: "Employee records in the system", icon: Users, color: "text-[#8642ED]", bar: "bg-[#8642ED]" },
    { label: "Active Workforce", value: activeForDate, progress: metrics.totalStaff ? activeForDate / metrics.totalStaff * 100 : 0, hint: "Available on selected date", icon: UserCheck, color: "text-emerald-600", bar: "bg-emerald-500" },
    { label: "Pending Payroll Sign-offs", value: metrics.pendingPayrollCount, progress: metrics.totalStaff ? metrics.pendingPayrollCount / metrics.totalStaff * 100 : 0, hint: "Records awaiting admin action", icon: Clock, color: "text-amber-600", bar: "bg-amber-500" },
    { label: "Biometric Keys Active", value: metrics.biometricKeysActive, progress: metrics.totalStaff ? metrics.biometricKeysActive / metrics.totalStaff * 100 : 0, hint: "Employees ready for biometric scans", icon: Fingerprint, color: "text-violet-600", bar: "bg-violet-500" },
    { label: "Employees on Leave", value: employeesOnLeave, progress: metrics.totalStaff ? employeesOnLeave / metrics.totalStaff * 100 : 0, hint: "Approved leave on selected date", icon: Calendar, color: "text-sky-600", bar: "bg-sky-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Admin Overview</h2>
          <p className="text-sm text-slate-500">Global system monitoring, attendance analytics, and operational tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <Button data-guide="overview-guide-button" variant="outline" onClick={onStartGuide} className="gap-2 whitespace-nowrap"><BookOpen className="h-4 w-4" /> Start guide again</Button>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={latestAttendanceDate ? `Through ${new Date(`${latestAttendanceDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No attendance period'}
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

      {/* Workforce inventory cards */}
      <Card data-guide="workforce-operations">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Workforce Operations</CardTitle>
              <CardDescription>Current staffing, payroll, and biometric readiness</CardDescription>
            </div>
            <DateNavigator label="Workforce date" value={workforceDate} onChange={setWorkforceDate} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {adminMetrics.map((m) => {
          const Icon = m.icon;
          const safeProgress = Math.max(0, Math.min(100, m.progress));
          return (
            <div key={m.label} className="animate-fade-in rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600">{m.label}</p>
                  <Icon className={`h-4 w-4 ${m.color}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{m.value}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${safeProgress}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-400">{m.hint}</span>
                  <span className={`shrink-0 font-semibold ${m.color}`}>{safeProgress.toFixed(0)}%</span>
                </div>
            </div>
          );
        })}
          </div>
        </CardContent>
      </Card>

      <Card data-guide="performance-snapshot">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Workforce Performance Snapshot</CardTitle>
              <CardDescription>Operational rates calculated from current system records</CardDescription>
            </div>
            <DateNavigator label="Performance date" value={performanceDate} onChange={setPerformanceDate} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {performanceMetrics.map((metric) => {
              const Icon = metric.icon;
              const safeValue = Math.max(0, Math.min(100, metric.value));
              return (
                <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">{metric.label}</p>
                    <Icon className={`h-4 w-4 ${metric.color}`} />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{safeValue.toFixed(1)}%</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${metric.bar}`} style={{ width: `${safeValue}%` }} />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">{metric.hint}</p>
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
            <CardDescription>Present vs Late vs Absent — {viewMode} view</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresentAdmin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLateAdmin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
                <Area type="monotone" dataKey="present" name="Present" stroke="#10b981" strokeWidth={2} fill="url(#colorPresentAdmin)" />
                <Area type="monotone" dataKey="late" name="Late" stroke="#f59e0b" strokeWidth={2} fill="url(#colorLateAdmin)" />
                <Area type="monotone" dataKey="absent" name="Absent" stroke="#ef4444" strokeWidth={2} fill="url(#colorAbsentAdmin)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card data-guide="today-breakdown">
          <CardHeader>
            <CardTitle>Today's Breakdown</CardTitle>
            <CardDescription>Live real-time distribution status</CardDescription>
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
                    <Cell key={`cell-adm-${index}`} fill={entry.color || "#cbd5e1"} />
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

      {/* Comparison Infrastructure & Secondary Widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Metrics Comparison</CardTitle>
            <CardDescription>Performance trends comparison — {viewMode} view</CardDescription>
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
                <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Activity className="h-4 w-4 text-slate-700" />
                Attention Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                    <ReceiptText className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-amber-900">Payroll Processing</h4>
                    <p className="text-[11px] text-amber-700">{metrics.pendingPayrollCount} payroll records currently processing</p>
                  </div>
                </div>
                <Button size="sm" className="h-7 bg-amber-500 hover:bg-amber-600 text-white border-0 text-xs">View</Button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-200 p-2 text-slate-600">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">System Logs</h4>
                    <p className="text-[11px] text-slate-500">2 core anomalies flagged past 24h</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs">Logs</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                System Infrastructure Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-1">
              <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                <span className="text-xs text-slate-600">Database Cluster Relay</span>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Operational
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                <span className="text-xs text-slate-600">Automated Payroll Gateway</span>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Operational
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-600">Secure Biometric Sync Hub</span>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Operational
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Global Audit Log */}
      <Card data-guide="audit-trail">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-slate-600" />
                System Audit Trail & Recent Activity
              </CardTitle>
              <CardDescription>Live actions tracked across employees, management accounts, and administrative keys</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={`overflow-x-auto ${auditTrail.length >= 15 ? 'max-h-[42rem] overflow-y-auto' : ''}`}>
            <table className="w-full text-left text-sm text-slate-600">
              <thead className={`border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 ${auditTrail.length >= 15 ? 'sticky top-0 z-10 shadow-sm' : ''}`}>
                <tr>
                  <th className="px-4 py-3 font-medium">Operator Name</th>
                  <th className="px-4 py-3 font-medium">Access Node</th>
                  <th className="px-4 py-3 font-medium">Executed Action</th>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Status Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditTrail.map((activity) => (
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
                          : activity.status === 'Late' 
                          ? 'text-amber-700 bg-amber-50' 
                          : 'text-slate-600 bg-slate-100'
                      }`}>{activity.status}</span>
                    </td>
                  </tr>
                ))}
                {auditTrail.length === 0 && <tr><td colSpan={5} className={`px-4 py-10 text-center text-sm ${auditError ? 'text-rose-600' : 'text-slate-400'}`}>{auditLoading ? 'Loading audit events…' : auditError || 'No audit events found in audit_events.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
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

  const managerMetrics = [
    { label: "Total Active Staff", value: metrics.totalActiveStaff.toString(), change: "+2", trend: "up", icon: Users, ...cardColorStyles.purple },
    { label: "Present Today", value: metrics.presentToday.toString(), change: "+1", trend: "up", icon: UserCheck, ...cardColorStyles.emerald },
    { label: "Late Clock-ins", value: metrics.lateClockIns.toString(), change: "+2", trend: "down", icon: Clock, ...cardColorStyles.amber },
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
            <input
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
            <CardDescription>Present vs Late vs Absent — {viewMode} view</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresentMgr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLateMgr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
                <Area type="monotone" dataKey="late" name="Late" stroke="#f59e0b" strokeWidth={2} fill="url(#colorLateMgr)" />
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
                <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[6, 6, 0, 0]} />
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
                  {recentActivities.map((activity) => (
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
                            : activity.status === 'Late' 
                            ? 'text-amber-700 bg-amber-50' 
                            : 'text-slate-600 bg-slate-100'
                        }`}>{activity.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
