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
type OverviewAttendance = { status: string };
const emptyAttendanceTrends = { daily: [], weekly: [], monthly: [] };

export function AppRoutes() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const paramView = params.get('view') as ViewKey;

  const [overviewEmployees, setOverviewEmployees] = useState<OverviewEmployee[]>([]);
  const [overviewPayroll, setOverviewPayroll] = useState<OverviewPayroll[]>([]);
  const [overviewAttendance, setOverviewAttendance] = useState<OverviewAttendance[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:5000/api/employees'),
      fetch('http://localhost:5000/api/payroll-requests'),
      fetch('http://localhost:5000/api/attendance'),
    ]).then(async ([employeesResponse, payrollResponse, attendanceResponse]) => {
      setOverviewEmployees(employeesResponse.ok ? await employeesResponse.json() : []);
      setOverviewPayroll(payrollResponse.ok ? await payrollResponse.json() : []);
      setOverviewAttendance(attendanceResponse.ok ? await attendanceResponse.json() : []);
    }).catch(() => {
      setOverviewEmployees([]); setOverviewPayroll([]); setOverviewAttendance([]);
    });
  }, []);

  const adminMetricsData = useMemo(() => {
    const totalStaff = overviewEmployees.length;
    const activeWorkforce = overviewEmployees.filter((employee) => employee.status === "active").length;
    const pendingPayrollCount = overviewPayroll.filter((payroll) => payroll.status === "processing").length;
    
    return {
      totalStaff,
      activeWorkforce,
      pendingPayrollCount,
      biometricKeysActive: overviewEmployees.filter((employee) => employee.biometricStatus === "enrolled").length,
    };
  }, [overviewEmployees, overviewPayroll]);

  const liveBreakdown = useMemo(() => [
    { name: "Present", value: overviewAttendance.filter((record) => record.status === "Present").length, color: "#10b981" },
    { name: "Late", value: overviewAttendance.filter((record) => record.status === "Late").length, color: "#f59e0b" },
    { name: "Absent", value: overviewAttendance.filter((record) => record.status === "Absent").length, color: "#ef4444" },
    { name: "On Leave", value: overviewAttendance.filter((record) => record.status === "On Leave").length, color: "#6366f1" },
  ].filter((item) => item.value > 0), [overviewAttendance]);

  // One unified workspace: administrators also have all manager capabilities.
  const viewMap: Record<ViewKey, React.ReactNode> = {
    overview: (
      <AdminOverviewView 
        attendanceTrends={emptyAttendanceTrends}
        liveBreakdown={liveBreakdown}
        auditTrail={[]}
        metrics={adminMetricsData}
      />
    ),
    attendance: <AttendanceView role="admin" records={[]} />,

    employees: <EmployeeDirectoryView employees={[]} />,

    leave: <LeaveRequestsView requests={[]} />,

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
