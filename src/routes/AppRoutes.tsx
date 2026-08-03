import { useState, useEffect, useMemo } from 'react';
import { AdminSidebar, type ViewKey } from '../components/AdminSidebar';
import { AdminOverviewView } from '../views/AdminOverviewView';
import { EmployeeDirectoryView } from '../views/EmployeeDirectoryView';

import { PayrollView } from '../views/PayrollView';
import { SettingsView } from '../views/SettingsView';
import { AIInsightsView } from '../views/AIInsightsView';
import { LeaveRequestsView } from '../views/LeaveRequestsView';
import { AdminView } from '../views/AdminView';
import { AttendanceView } from '../views/AttendanceView';

type OverviewEmployee = { status: string; biometricStatus: string };
type OverviewPayroll = { status: string };
type OverviewAttendance = { employeeId?: string; name?: string; role?: string; date?: string; checkIn?: string; checkOut?: string; status: string };
type OverviewLeave = { id: string; employeeId?: string; startDate: string; endDate: string; totalDays: number; status: string };

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

  const [overviewEmployees, setOverviewEmployees] = useState<OverviewEmployee[]>([]);
  const [overviewPayroll, setOverviewPayroll] = useState<OverviewPayroll[]>([]);
  const [overviewAttendance, setOverviewAttendance] = useState<OverviewAttendance[]>([]);
  const [overviewLeaves, setOverviewLeaves] = useState<OverviewLeave[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:5000/api/employees'),
      fetch('http://localhost:5000/api/payroll-requests'),
      fetch('http://localhost:5000/api/attendance'),
      fetch('http://localhost:5000/api/leave-requests'),
    ]).then(async ([employeesResponse, payrollResponse, attendanceResponse, leaveResponse]) => {
      setOverviewEmployees(employeesResponse.ok ? await employeesResponse.json() : []);
      setOverviewPayroll(payrollResponse.ok ? await payrollResponse.json() : []);
      setOverviewAttendance(attendanceResponse.ok ? await attendanceResponse.json() : []);
      setOverviewLeaves(leaveResponse.ok ? await leaveResponse.json() : []);
    }).catch(() => {
      setOverviewEmployees([]); setOverviewPayroll([]); setOverviewAttendance([]); setOverviewLeaves([]);
    });
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

  const auditTrail = useMemo(() => [...overviewAttendance].filter((record) => record.name).slice(-5).reverse().map((record, index) => ({
    id: `${record.employeeId ?? index}-${record.date ?? index}`,
    user: record.name ?? 'Employee',
    role: record.role ?? 'Staff',
    action: record.status === 'Absent' ? 'Attendance marked absent' : `Clock-in recorded${record.checkIn ? ` at ${record.checkIn}` : ''}`,
    time: record.checkIn ?? '—',
    date: record.date ?? '—',
    status: record.status === 'Present' ? 'On Time' : record.status,
  })), [overviewAttendance]);

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
      />
    ),
    attendance: <AttendanceView role="admin" records={[]} />,

    employees: <EmployeeDirectoryView employees={[]} />,

    leave: <LeaveRequestsView requests={[]} onApprove={(id) => {
      setOverviewLeaves((current) => current.map((leave) => leave.id === id ? { ...leave, status: 'approved' } : leave));
      fetch('http://localhost:5000/api/employees').then((response) => response.ok ? response.json() : Promise.reject()).then(setOverviewEmployees).catch(() => undefined);
    }} onReject={(id) => setOverviewLeaves((current) => current.map((leave) => leave.id === id ? { ...leave, status: 'rejected' } : leave))} />,

    payroll: <PayrollView employees={[]} requests={[]} />,

    insights: <AIInsightsView />,
    admin: <AdminView />,
    settings: <SettingsView />,
  };

  const initialView: ViewKey = (paramView in viewMap) ? paramView : 'overview';
  const [active, setActive] = useState<ViewKey>(initialView);

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
    <div className="flex h-screen w-full">
      <AdminSidebar active={active} onNavigate={setActive} />
      
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        {viewMap[active] || viewMap.overview}
      </main>
    </div>
  );
}
