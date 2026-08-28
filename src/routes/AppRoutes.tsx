import { useState, useEffect, useMemo } from 'react';
import { Menu } from 'lucide-react';
import { AdminSidebar, type ViewKey } from '../components/AdminSidebar';
import { AdminOverviewView } from '../views/AdminOverviewView';
import { EmployeeDirectoryView } from '../views/EmployeeDirectoryView';

import { PayrollView } from '../views/PayrollView';
import { SettingsView } from '../views/SettingsView';
import { AIInsightsView } from '../views/AIInsightsView';
import { LeaveRequestsView } from '../views/LeaveRequestsView';
import { AdminView } from '../views/AdminView';
import { AttendanceView } from '../views/AttendanceView';
import { apiFetch } from '../lib/api';

type OverviewEmployee = { status: string; biometricStatus: string; createdAt?: string };
type OverviewPayroll = { status: string; periodStart?: string };
type OverviewAttendance = { employeeId?: string; name?: string; role?: string; date?: string; checkIn?: string; checkOut?: string; status: string };
type OverviewLeave = { id: string; employeeId?: string; startDate: string; endDate: string; approvedDates?: string[]; totalDays: number; status: string };
type OverviewAuditEvent = { id: string; occurredAt?: string; actorEmail?: string | null; actorRole?: string; screenName?: string; action?: string; targetType?: string; targetId?: string | null; outcome?: string; metadata?: Record<string, unknown> };

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

function auditActionLabel(event: OverviewAuditEvent) {
  const path = String(event.metadata?.path || '');
  if (path.includes('/admin/') || event.action === 'auth.admin_credentials_changed' || event.action === 'admin.backup_created') {
    const adminAction = String(event.metadata?.adminAction || '');
    if (adminAction === 'credentials-updated' || path.endsWith('/account-security')) {
      const emailChanged = event.metadata?.emailChanged === true;
      const passwordChanged = event.metadata?.passwordChanged === true;
      return emailChanged && passwordChanged ? 'Changed Admin Email and Password' : passwordChanged ? 'Changed Admin Password' : emailChanged ? 'Changed Admin Email' : 'Updated Admin Credentials';
    }
    if (adminAction === 'system-control-updated' || path.endsWith('/system-controls')) {
      const fields = Array.isArray(event.metadata?.changedFields) ? event.metadata.changedFields : [];
      if (fields.includes('maintenanceMode')) return 'Changed Maintenance Mode';
      if (fields.includes('registrationOpen')) return 'Changed Employee Registration Access';
      return 'Changed System Controls';
    }
    if (adminAction === 'employee-access-blocked') return 'Blocked Employee Account';
    if (adminAction === 'employee-access-restored') return 'Restored Employee Account';
    if (path.includes('/employees/') && path.endsWith('/access')) return 'Changed Employee Account Access';
    if (adminAction === 'force-clock-out' || path.endsWith('/force-clock-out')) return 'Forced Employee Clock-Out';
    if (event.action === 'admin.backup_created') return 'Downloaded System Backup';
  }
  if (!path.includes('payroll')) return readableAuditAction(event.action, event.targetType);
  const payrollAction = String(event.metadata?.payrollAction || '');
  const labels: Record<string, string> = {
    'bonus-added': 'Bonus Added',
    'bulk-paid': 'Multiple Employees Paid',
    'individual-paid': 'Individual Payment Completed',
    'payment-held': 'Payment Held',
    'hold-removed': 'Payment Hold Removed',
    printed: 'Payroll Printed',
    'payslip-emailed': 'Payslip Emailed',
    'summary-emailed': 'Payroll Summary Emailed',
  };
  if (labels[payrollAction]) return labels[payrollAction];
  if (path.includes('/undo-last-payment')) return 'Payment Undone';
  if (path.includes('/prepare-bulk')) return 'Payroll Prepared';
  return readableAuditAction(event.action, event.targetType);
}

function auditEventDetail(event: OverviewAuditEvent, time: string) {
  const actor = event.actorEmail || String(event.metadata?.attemptedEmail || '') || (event.actorRole === 'anonymous' ? 'Unknown user' : 'System');
  const path = String(event.metadata?.path || '');
  const targetName = String(event.metadata?.targetName || event.targetId || '').trim();
  const result = event.outcome === 'success' ? 'succeeded' : event.outcome === 'failure' ? 'failed' : 'finished with an unknown result';
  if (event.action === 'auth.login') return `${actor} login ${result} at ${time}.`;
  if (event.action === 'auth.logout') return `${actor} logged out at ${time}.`;
  if (path === '/attendance/kiosk') return event.outcome === 'success' ? `${targetName || 'An employee'} completed a kiosk ${String(event.metadata?.kioskAction || 'attendance scan')} at ${time}.` : `A kiosk attendance attempt ${result} at ${time}${targetName ? ` for ${targetName}` : ''}.`;
  if (/^\/employees(?:\/|$)/.test(path)) {
    const operation = path.endsWith('/archive') ? 'archived' : path.endsWith('/unarchive') ? 'unarchived' : event.action === 'api.post' ? 'created' : event.action === 'api.delete' ? 'permanently deleted' : 'edited';
    return `${actor} ${operation} ${targetName || 'an employee record'} at ${time}; the action ${result}.`;
  }
  if (path.includes('leave-requests')) {
    const requestedStatus = String(event.metadata?.requestedStatus || '');
    const operation = path.includes('/employee/me/') ? path.endsWith('/cancel') ? 'cancelled a leave request' : 'submitted a leave request' : requestedStatus ? `${requestedStatus} a leave request` : 'updated a leave request';
    return `${actor} ${operation}${targetName ? ` for ${targetName}` : ''} at ${time}; the action ${result}.`;
  }
  if (path.includes('payroll')) {
    const payrollAction = String(event.metadata?.payrollAction || '');
    const recordCount = Number(event.metadata?.recordCount || 0);
    const amount = Number(event.metadata?.amount ?? event.metadata?.total ?? 0);
    const money = amount > 0 ? ` worth ${amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}` : '';
    const people = recordCount > 0 ? `${recordCount} employee${recordCount === 1 ? '' : 's'}` : 'the selected employees';
    const descriptions: Record<string, string> = {
      'bonus-added': `${actor} added a bonus${money} to ${targetName || people}`,
      'bulk-paid': `${actor} completed payroll for ${people}${money}`,
      'individual-paid': `${actor} marked ${targetName || 'an employee'} as paid${money}`,
      'payment-held': `${actor} placed ${targetName || "an employee's"} payment on hold`,
      'hold-removed': `${actor} removed the payment hold for ${targetName || 'an employee'}`,
      printed: event.metadata?.printScope === 'individual-payslip' ? `${actor} printed the payslip for ${targetName || 'an employee'}` : `${actor} printed the paid payroll list${recordCount ? ` containing ${recordCount} records` : ''}`,
      'payslip-emailed': `${actor} emailed a payslip to ${targetName || 'an employee'}`,
      'summary-emailed': `${actor} emailed a payroll summary to ${targetName || 'an employee'}`,
    };
    const description = descriptions[payrollAction] || (path.includes('/undo-last-payment') ? `${actor} undid the most recent payroll payment` : path.includes('/prepare-bulk') ? `${actor} prepared payroll for ${people}` : `${actor} performed a payroll action${targetName ? ` for ${targetName}` : ''}`);
    return `${description} at ${time}; the action ${result}.`;
  }
  if (path === '/settings') {
    const values = event.metadata?.settingsValues && typeof event.metadata.settingsValues === 'object' ? Object.entries(event.metadata.settingsValues).filter(([, value]) => value != null).map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${value}`).join(', ') : '';
    return `${actor} updated system settings${values ? ` (${values})` : ''} at ${time}; the action ${result}.`;
  }
  if (path.includes('/admin/') || event.action === 'auth.admin_credentials_changed' || event.action === 'admin.backup_created') {
    const label = auditActionLabel(event).toLowerCase();
    const controls = event.metadata?.controlChanges && typeof event.metadata.controlChanges === 'object'
      ? Object.entries(event.metadata.controlChanges).map(([key, value]) => `${key === 'maintenanceMode' ? 'maintenance mode' : key === 'registrationOpen' ? 'employee registration' : key} was turned ${value ? 'on' : 'off'}`).join(' and ')
      : '';
    const count = Number(event.metadata?.recordCount || 0);
    const extra = controls ? `: ${controls}` : targetName ? ` for ${targetName}` : path.endsWith('/force-clock-out') ? `; ${count} open attendance session${count === 1 ? '' : 's'} closed` : '';
    return `${actor} ${label}${extra} at ${time}; the action ${result}.`;
  }
  return `${actor} ${readableAuditAction(event.action, event.targetType)} at ${time}; the action ${result}.`;
}

function attendanceTrend(records: OverviewAttendance[], mode: 'daily' | 'weekly' | 'monthly', anchorDate: string) {
  const anchor = new Date(`${anchorDate}T00:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return [];

  const buckets = new Map<string, { label: string; present: number; late: number; absent: number }>();
  const dateKey = (date: Date) => date.toISOString().slice(0, 10);
  const mondayFor = (date: Date) => {
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return monday;
  };
  const bucketKey = (date: Date) => {
    if (mode === 'daily') return dateKey(date);
    if (mode === 'weekly') return dateKey(mondayFor(date));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  const bucketDates: Date[] = [];
  const bucketCount = mode === 'daily' ? 7 : 6;
  for (let index = bucketCount - 1; index >= 0; index -= 1) {
    const date = mode === 'weekly' ? mondayFor(anchor) : new Date(anchor);
    if (mode === 'daily') date.setUTCDate(anchor.getUTCDate() - index);
    if (mode === 'weekly') date.setUTCDate(date.getUTCDate() - index * 7);
    if (mode === 'monthly') {
      date.setUTCDate(1);
      date.setUTCMonth(anchor.getUTCMonth() - index);
    }
    bucketDates.push(date);
  }

  bucketDates.forEach((date) => {
    const label = mode === 'daily'
      ? date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' })
      : date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', ...(mode === 'weekly' ? { day: 'numeric' } : {}) });
    buckets.set(bucketKey(date), { label, present: 0, late: 0, absent: 0 });
  });

  records.forEach((record) => {
    if (!record.date) return;
    const date = new Date(`${record.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return;
    if (date.getTime() > anchor.getTime()) return;
    const bucket = buckets.get(bucketKey(date));
    if (!bucket) return;
    if (record.status === 'Present') bucket.present += 1;
    if (record.status === 'Late') bucket.late += 1;
    if (record.status === 'Absent') bucket.absent += 1;
  });

  return [...buckets.values()];
}

function currentPayrollPeriodKey() {
  const now = new Date();
  const day = now.getDate() <= 15 ? 1 : 16;
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function manilaDateToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function AppRoutes() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const paramView = params.get('view') as ViewKey;
  const validViews: ViewKey[] = ['overview', 'attendance', 'employees', 'leave', 'payroll', 'insights', 'settings', 'admin'];
  const initialView: ViewKey = validViews.includes(paramView) ? paramView : 'overview';
  const [active, setActive] = useState<ViewKey>(initialView);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [overviewPerformanceDate, setOverviewPerformanceDate] = useState(manilaDateToday);
  const [overviewViewMode, setOverviewViewMode] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const [overviewEmployees, setOverviewEmployees] = useState<OverviewEmployee[]>([]);
  const [overviewPayroll, setOverviewPayroll] = useState<OverviewPayroll[]>([]);
  const [overviewAttendance, setOverviewAttendance] = useState<OverviewAttendance[]>([]);
  const [overviewLeaves, setOverviewLeaves] = useState<OverviewLeave[]>([]);
  const [overviewAuditEvents, setOverviewAuditEvents] = useState<OverviewAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState('');
  const [auditDate, setAuditDate] = useState(manilaDateToday);

  useEffect(() => {
    if (active !== 'overview') return;
    let cancelled = false;
    let loading = false;
    async function loadOverview() {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      try {
        const query = new URLSearchParams({ performanceDate: overviewPerformanceDate, auditDate });
        const response = await apiFetch(`/api/overview?${query.toString()}`);
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `Overview request failed (${response.status})`);
        if (!data || !Array.isArray(data.employees) || !Array.isArray(data.payroll) || !Array.isArray(data.attendance) || !Array.isArray(data.leaveRequests) || !Array.isArray(data.auditEvents)) {
          throw new Error('Overview server returned an invalid response');
        }
        if (cancelled) return;
        setOverviewEmployees(data.employees);
        setOverviewPayroll(data.payroll);
        setOverviewAttendance(data.attendance);
        setOverviewLeaves(data.leaveRequests);
        setOverviewAuditEvents(data.auditEvents);
        setAuditError('');
        setAuditLoading(false);
      } catch (reason) {
        if (!cancelled) {
          setAuditError(reason instanceof Error ? reason.message : 'Unable to load overview data');
          setAuditLoading(false);
        }
      } finally {
        loading = false;
      }
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void loadOverview(); };
    void loadOverview();
    const overviewInterval = window.setInterval(() => void loadOverview(), 60_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(overviewInterval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [active, auditDate, overviewPerformanceDate]);

  const adminMetricsData = useMemo(() => {
    const totalStaff = overviewEmployees.length;
    const activeWorkforce = overviewEmployees.filter((employee) => employee.status === "active").length;
    const workforceEligible = overviewEmployees.filter((employee) => employee.status === "active" || employee.status === "on-leave").length;
    const currentPayroll = overviewPayroll.filter((payroll) => payroll.periodStart === currentPayrollPeriodKey());
    const pendingPayrollCount = currentPayroll.filter((payroll) => payroll.status === "processing").length;
    
    return {
      totalStaff,
      activeWorkforce,
      workforceEligible,
      pendingPayrollCount,
      biometricKeysActive: overviewEmployees.filter((employee) => employee.biometricStatus === "enrolled").length,
    };
  }, [overviewEmployees, overviewPayroll]);

  const attendanceTrends = useMemo(() => ({
    daily: attendanceTrend(overviewAttendance, 'daily', overviewPerformanceDate),
    weekly: attendanceTrend(overviewAttendance, 'weekly', overviewPerformanceDate),
    monthly: attendanceTrend(overviewAttendance, 'monthly', overviewPerformanceDate),
  }), [overviewAttendance, overviewPerformanceDate]);

  const latestAttendanceDate = useMemo(() => overviewAttendance.reduce((latest, record) =>
    record.date && record.date > latest ? record.date : latest, ''), [overviewAttendance]);

  const attendanceAnalytics = useMemo(() => {
    const total = overviewAttendance.length;
    const attended = overviewAttendance.filter((record) => record.status === 'Present' || record.status === 'Late').length;
    const onTime = overviewAttendance.filter((record) => record.status === 'Present').length;
    return {
      attendanceRate: total ? attended / total * 100 : 0,
      punctualityRate: attended ? onTime / attended * 100 : 0,
      payrollCompletion: overviewPayroll.filter((payroll) => payroll.periodStart === currentPayrollPeriodKey()).length
        ? overviewPayroll.filter((payroll) => payroll.periodStart === currentPayrollPeriodKey() && payroll.status === 'paid').length
          / overviewPayroll.filter((payroll) => payroll.periodStart === currentPayrollPeriodKey()).length * 100 : 0,
    };
  }, [overviewAttendance, overviewPayroll]);

  const auditTrail = useMemo(() => overviewAuditEvents.map((event) => {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : null;
    const validDate = occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null;
    const time = validDate ? validDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';
    return {
      id: event.id,
      user: event.screenName || 'System',
      role: event.actorRole === 'admin' ? 'Admin' : event.actorRole === 'manager' ? 'Manager' : event.actorRole === 'anonymous' ? 'System' : 'Staff',
      action: auditActionLabel(event),
      time,
      date: validDate ? validDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
      status: event.outcome === 'success' ? 'Success' : event.outcome === 'failure' ? 'Failed' : 'Unknown',
      detail: auditEventDetail(event, time),
    };
  }), [overviewAuditEvents]);

  // One unified workspace: administrators also have all manager capabilities.
  const viewMap: Record<ViewKey, React.ReactNode> = {
    overview: (
      <AdminOverviewView 
        attendanceTrends={attendanceTrends}
        viewMode={overviewViewMode}
        onViewModeChange={setOverviewViewMode}
        auditTrail={auditTrail}
        metrics={adminMetricsData}
        analytics={attendanceAnalytics}
        latestAttendanceDate={latestAttendanceDate}
        performanceDate={overviewPerformanceDate}
        onPerformanceDateChange={setOverviewPerformanceDate}
        employees={overviewEmployees}
        leaveRequests={overviewLeaves}
        attendanceRecords={overviewAttendance}
        auditLoading={auditLoading}
        auditError={auditError}
        auditDate={auditDate}
        onAuditDateChange={setAuditDate}
        onNavigate={setActive}
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
      <AdminSidebar active={active} onNavigate={setActive} mobileOpen={mobileNavigationOpen} onMobileClose={() => setMobileNavigationOpen(false)} />
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
    </div>
  );
}
