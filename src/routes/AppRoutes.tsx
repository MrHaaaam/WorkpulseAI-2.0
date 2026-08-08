import { useState, useEffect, useMemo } from 'react';
import { Menu } from 'lucide-react';
import { AdminSidebar, type ViewKey } from '../components/AdminSidebar';
import { AdminGuide } from '../components/AdminGuide';
import { AdminOverviewView } from '../views/AdminOverviewView';
import { EmployeeDirectoryView } from '../views/EmployeeDirectoryView';

import { PayrollView } from '../views/PayrollView';
import { SettingsView } from '../views/SettingsView';
import { AIInsightsView } from '../views/AIInsightsView';
import { LeaveRequestsView } from '../views/LeaveRequestsView';
import { AdminView } from '../views/AdminView';
import { AttendanceView } from '../views/AttendanceView';
import { apiFetch } from '../lib/api';

type OverviewEmployee = { status: string; biometricStatus: string };
type OverviewPayroll = { status: string };
type OverviewAttendance = { employeeId?: string; name?: string; role?: string; date?: string; checkIn?: string; checkOut?: string; status: string };
type OverviewLeave = { id: string; employeeId?: string; startDate: string; endDate: string; totalDays: number; status: string };
type OverviewAuditEvent = { id: string; occurredAt?: string; actorEmail?: string | null; actorRole?: string; action?: string; targetType?: string; outcome?: string };

function readableAuditAction(action = 'unknown', targetType = 'system') {
  const labels: Record<string, string> = {
    'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.otp_sent': 'Verification code sent',
    'auth.otp_verify': 'Verification code checked', 'auth.password_verify': 'Admin password checked',
    'security.rate_limit': 'Request limit reached',
  };
  if (labels[action]) return labels[action];
  const apiMatch = action.match(/^api\.(post|put|patch|delete)$/);
  if (apiMatch) {
    const verbs: Record<string, string> = { post: 'Created', put: 'Updated', patch: 'Updated', delete: 'Deleted' };
    return `${verbs[apiMatch[1]]} ${targetType.replace(/[-_]/g, ' ')}`;
  }
  return action.replace(/[._-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function attendanceTrend(records: OverviewAttendance[], mode: 'daily' | 'weekly' | 'monthly') {
  const parsed = records
    .map((record) => ({ ...record, parsedDate: new Date(`${record.date}T00:00:00`) }))
    .filter((record) => !Number.isNaN(record.parsedDate.getTime()))
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  const buckets = new Map<string, { label: string; present: number; late: number; absent: number; order: number }>();

  parsed.forEach((record) => {
    const date = record.parsedDate;
    let key: string;
    let label: string;
    let order: number;
    if (mode === 'daily') {
      key = record.date!;
      label = date.toLocaleDateString('en-US', { weekday: 'short' });
      order = date.getTime();
    } else if (mode === 'weekly') {
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
      label = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      order = monday.getTime();
    } else {
      key = `${date.getFullYear()}-${date.getMonth()}`;
      label = date.toLocaleDateString('en-US', { month: 'short' });
      order = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    }
    const bucket = buckets.get(key) ?? { label, present: 0, late: 0, absent: 0, order };
    if (record.status === 'Present') bucket.present += 1;
    if (record.status === 'Late') bucket.late += 1;
    if (record.status === 'Absent') bucket.absent += 1;
    buckets.set(key, bucket);
  });

  const limit = mode === 'daily' ? 7 : mode === 'weekly' ? 6 : 6;
  return [...buckets.values()].sort((a, b) => a.order - b.order).slice(-limit).map(({ order: _order, ...bucket }) => bucket);
}

export function AppRoutes() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const paramView = params.get('view') as ViewKey;
  const validViews: ViewKey[] = ['overview', 'attendance', 'employees', 'leave', 'payroll', 'insights', 'settings', 'admin'];
  const initialView: ViewKey = validViews.includes(paramView) ? paramView : 'overview';
  const [active, setActive] = useState<ViewKey>(initialView);
  const [guideOpen, setGuideOpen] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const [overviewEmployees, setOverviewEmployees] = useState<OverviewEmployee[]>([]);
  const [overviewPayroll, setOverviewPayroll] = useState<OverviewPayroll[]>([]);
  const [overviewAttendance, setOverviewAttendance] = useState<OverviewAttendance[]>([]);
  const [overviewLeaves, setOverviewLeaves] = useState<OverviewLeave[]>([]);
  const [overviewAuditEvents, setOverviewAuditEvents] = useState<OverviewAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch('/api/employees'),
      apiFetch('/api/payroll-requests'),
      apiFetch('/api/attendance'),
      apiFetch('/api/leave-requests'),
    ]).then(async ([employeesResponse, payrollResponse, attendanceResponse, leaveResponse]) => {
      setOverviewEmployees(employeesResponse.ok ? await employeesResponse.json() : []);
      setOverviewPayroll(payrollResponse.ok ? await payrollResponse.json() : []);
      setOverviewAttendance(attendanceResponse.ok ? await attendanceResponse.json() : []);
      setOverviewLeaves(leaveResponse.ok ? await leaveResponse.json() : []);
    }).catch(() => {
      setOverviewEmployees([]); setOverviewPayroll([]); setOverviewAttendance([]); setOverviewLeaves([]);
    });

    let cancelled = false;
    async function loadAuditEvents(attempt = 0) {
      try {
        const response = await apiFetch('/api/audit-events?limit=20');
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `Audit request failed (${response.status})`);
        if (!Array.isArray(data)) throw new Error('Audit server returned an invalid response');
        if (!cancelled) { setOverviewAuditEvents(data); setAuditError(''); setAuditLoading(false); }
      } catch (reason) {
        if (cancelled) return;
        if (attempt < 2) {
          window.setTimeout(() => { void loadAuditEvents(attempt + 1); }, 1200);
          return;
        }
        setOverviewAuditEvents([]);
        setAuditError(reason instanceof Error ? reason.message : 'Unable to load audit events');
        setAuditLoading(false);
      }
    }
    void loadAuditEvents();
    return () => { cancelled = true; };
  }, []);

  const adminMetricsData = useMemo(() => {
    const totalStaff = overviewEmployees.length;
    const activeWorkforce = overviewEmployees.filter((employee) => employee.status === "active").length;
    const workforceEligible = overviewEmployees.filter((employee) => employee.status === "active" || employee.status === "on-leave").length;
    const pendingPayrollCount = overviewPayroll.filter((payroll) => payroll.status === "processing").length;
    
    return {
      totalStaff,
      activeWorkforce,
      workforceEligible,
      pendingPayrollCount,
      biometricKeysActive: overviewEmployees.filter((employee) => employee.biometricStatus === "enrolled").length,
    };
  }, [overviewEmployees, overviewPayroll]);

  const attendanceTrends = useMemo(() => ({
    daily: attendanceTrend(overviewAttendance, 'daily'),
    weekly: attendanceTrend(overviewAttendance, 'weekly'),
    monthly: attendanceTrend(overviewAttendance, 'monthly'),
  }), [overviewAttendance]);

  const latestAttendanceDate = useMemo(() => overviewAttendance.reduce((latest, record) =>
    record.date && record.date > latest ? record.date : latest, ''), [overviewAttendance]);

  const latestAttendance = useMemo(() => latestAttendanceDate
    ? overviewAttendance.filter((record) => record.date === latestAttendanceDate)
    : overviewAttendance, [overviewAttendance, latestAttendanceDate]);

  const liveBreakdown = useMemo(() => [
    { name: "Present", value: latestAttendance.filter((record) => record.status === "Present").length, color: "#10b981" },
    { name: "Late", value: latestAttendance.filter((record) => record.status === "Late").length, color: "#f59e0b" },
    { name: "Absent", value: latestAttendance.filter((record) => record.status === "Absent").length, color: "#ef4444" },
    { name: "On Leave", value: latestAttendance.filter((record) => record.status === "On Leave").length, color: "#6366f1" },
  ].filter((item) => item.value > 0), [latestAttendance]);

  const attendanceAnalytics = useMemo(() => {
    const total = overviewAttendance.length;
    const attended = overviewAttendance.filter((record) => record.status === 'Present' || record.status === 'Late').length;
    const onTime = overviewAttendance.filter((record) => record.status === 'Present').length;
    const biometricCoverage = overviewEmployees.length
      ? overviewEmployees.filter((employee) => employee.biometricStatus === 'enrolled').length / overviewEmployees.length * 100 : 0;
    return {
      attendanceRate: total ? attended / total * 100 : 0,
      punctualityRate: attended ? onTime / attended * 100 : 0,
      biometricCoverage,
      payrollCompletion: overviewPayroll.length
        ? overviewPayroll.filter((payroll) => payroll.status === 'paid').length / overviewPayroll.length * 100 : 0,
    };
  }, [overviewAttendance, overviewEmployees, overviewPayroll]);

  const auditTrail = useMemo(() => overviewAuditEvents.map((event) => {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : null;
    const validDate = occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null;
    return {
      id: event.id,
      user: event.actorEmail || 'System',
      role: event.actorRole === 'admin' ? 'Admin' : event.actorRole === 'manager' ? 'Manager' : event.actorRole === 'anonymous' ? 'System' : 'Staff',
      action: readableAuditAction(event.action, event.targetType),
      time: validDate ? validDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—',
      date: validDate ? validDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
      status: event.outcome === 'success' ? 'Success' : event.outcome === 'failure' ? 'Failed' : 'Unknown',
    };
  }), [overviewAuditEvents]);

  // One unified workspace: administrators also have all manager capabilities.
  const viewMap: Record<ViewKey, React.ReactNode> = {
    overview: (
      <AdminOverviewView 
        attendanceTrends={attendanceTrends}
        liveBreakdown={liveBreakdown}
        auditTrail={auditTrail}
        metrics={adminMetricsData}
        analytics={attendanceAnalytics}
        latestAttendanceDate={latestAttendanceDate}
        leaveRequests={overviewLeaves}
        attendanceRecords={overviewAttendance}
        auditLoading={auditLoading}
        auditError={auditError}
        onStartGuide={() => { setActive('overview'); setGuideOpen(true); }}
      />
    ),
    attendance: <AttendanceView role="admin" records={[]} />,

    employees: <EmployeeDirectoryView employees={[]} />,

    leave: <LeaveRequestsView requests={[]} onApprove={(id) => {
      setOverviewLeaves((current) => current.map((leave) => leave.id === id ? { ...leave, status: 'approved' } : leave));
      apiFetch('/api/employees').then((response) => response.ok ? response.json() : Promise.reject()).then(setOverviewEmployees).catch(() => undefined);
    }} onReject={(id) => setOverviewLeaves((current) => current.map((leave) => leave.id === id ? { ...leave, status: 'rejected' } : leave))} />,

    payroll: <PayrollView employees={[]} requests={[]} />,

    insights: <AIInsightsView />,
    admin: <AdminView />,
    settings: <SettingsView />,
  };

  const viewLabels: Record<ViewKey, string> = {
    overview: 'Overview', attendance: 'Attendance', employees: 'Employee Directory', leave: 'Leave Requests',
    payroll: 'Payroll', insights: 'AI Insights', settings: 'System Settings', admin: 'Admin Controls',
  };

  // Sync state transitions back to URL queries
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const newParams = new URLSearchParams(window.location.search);
      newParams.set('view', active);
      newParams.delete('role');
      
      const targetUrl = `${window.location.pathname}?${newParams.toString()}`;
      window.history.replaceState(null, '', targetUrl);
    }
  }, [active]);

  return (
    <div className="flex min-h-screen w-full bg-slate-100/70">
      <AdminSidebar active={active} onNavigate={setActive} mobileOpen={mobileNavigationOpen} onMobileClose={() => setMobileNavigationOpen(false)} onOpenGuide={() => { setActive('overview'); setGuideOpen(true); }} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button onClick={() => setMobileNavigationOpen(true)} aria-label="Open navigation" className="mr-3 rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600">Admin workspace</p><h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">{viewLabels[active]}</h1></div>
          <div className="ml-auto hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />System online</div>
        </header>
        <main className="min-w-0 overflow-x-hidden px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1600px]">{viewMap[active] || viewMap.overview}</div>
        </main>
      </div>
      <AdminGuide key={guideOpen ? 'guide-open' : 'guide-closed'} open={guideOpen} onClose={() => setGuideOpen(false)} onNavigate={setActive} />
    </div>
  );
}
