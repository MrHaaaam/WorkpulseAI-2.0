import { useState, useEffect, useMemo } from 'react';
import { type ViewKey } from '../components/Sidebar';

import { ManagerSidebar } from '../components/ManagerSidebar';
import { AdminSidebar } from '../components/AdminSidebar';
import { OverviewView } from '../views/OverviewView';
import { AdminOverviewView } from '../views/AdminOverviewView';
import { EmployeeDirectoryView } from '../views/EmployeeDirectoryView';

import { BiometricView } from '../views/BiometricView';
import { PayrollView } from '../views/PayrollView';
import { SettingsView } from '../views/SettingsView';
import { AnalyticsView } from '../views/AnalyticsView';
import { LeaveRequestsView } from '../views/LeaveRequestsView';
import { AdminView } from '../views/AdminView';
import { AdminPayrollApprovalsView } from '../views/AdminPayrollApprovalsView';
import { AttendanceView } from '../views/AttendanceView';

// Import your data stores to pass down to the decoupled overview views
import { employees, payrollRequestsStore, attendanceData } from '../lib/data';


// Fallback/Mock structures matching your original static configurations
const sharedPieData = [
  { name: "Present", value: 10, color: "#10b981" },
  { name: "Late", value: 4, color: "#f59e0b" },
  { name: "Absent", value: 1, color: "#ef4444" },
  { name: "On Leave", value: 1, color: "#6366f1" },
];

const sharedRecentActivities = [
  { id: 1, user: "Sarah Jenkins", role: "Staff", action: "Clocked In", time: "08:15 AM", date: "Today", status: "Late" },
  { id: 2, user: "Marcus Ray", role: "Manager", action: "Approved Leave Request", time: "09:30 AM", date: "Today", status: "Success" },
  { id: 3, user: "Elena Rodriguez", role: "Staff", action: "Clocked In", time: "07:55 AM", date: "Today", status: "On Time" },
  { id: 4, user: "David Chen", role: "Admin", action: "Updated Biometric Policy", time: "04:20 PM", date: "Yesterday", status: "Success" },
  { id: 5, user: "James Wilson", role: "Staff", action: "Biometric Registration", time: "11:00 AM", date: "Yesterday", status: "Pending" },
];

export function AppRoutes() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const paramView = params.get('view') as ViewKey;
  const initialRole: 'manager' | 'admin' = params.get('role') === 'admin' ? 'admin' : 'manager';

  const [role] = useState<'manager' | 'admin'>(initialRole);

  // 1. Compute state metrics for the Admin View
  const adminMetricsData = useMemo(() => {
    const totalStaff = employees.length;
    const activeWorkforce = employees.filter((e) => e.status === "active").length;
    const pendingPayrollCount = payrollRequestsStore.get().filter(p => p.status === "processing").length;
    
    return {
      totalStaff,
      activeWorkforce,
      pendingPayrollCount,
      biometricKeysActive: 18, // Matching your original layout static number
    };
  }, []);

  // 2. Compute state metrics tailored for the Manager View
  const managerMetricsData = useMemo(() => {
    const totalActiveStaff = employees.filter((e) => e.status === "active").length;
    
    return {
      totalActiveStaff,
      presentToday: 10, // Matching pie data fallbacks
      lateClockIns: 4,
      registeredBiometricKeys: 15,
    };
  }, []);

  // 3. Consolidate views and safely feed them their computed data properties
  const viewMap: Record<ViewKey, React.ReactNode> = {
    overview: role === 'admin' ? (
      <AdminOverviewView 
        attendanceTrends={attendanceData}
        liveBreakdown={sharedPieData}
        auditTrail={sharedRecentActivities}
        metrics={adminMetricsData}
      />
    ) : (
      <OverviewView 
        attendanceTrends={attendanceData}
        liveBreakdown={sharedPieData}
        recentActivities={sharedRecentActivities}
        metrics={managerMetricsData}
      />
    ),
    attendance: <AttendanceView role={role} records={[]} />,

    employees: <EmployeeDirectoryView employees={employees as any} />,

    biometric: <BiometricView />,
    leave: <LeaveRequestsView requests={[]} />,

    payroll:
      role === 'admin'
        ? <AdminPayrollApprovalsView payrollRequests={payrollRequestsStore.get()} />
        : <PayrollView employees={employees} requests={payrollRequestsStore.get()} />,



    analytics: <AnalyticsView />,
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
      newParams.set('role', role);
      
      const targetUrl = `${window.location.pathname}?${newParams.toString()}`;
      window.history.replaceState(null, '', targetUrl);
    }
  }, [active, role]);

  return (
    <div className="flex h-screen w-full">
      {role === 'admin' ? (
        <AdminSidebar active={active} onNavigate={setActive} />
      ) : (
        <ManagerSidebar active={active} onNavigate={setActive} />
      )}
      
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        {viewMap[active] || viewMap.overview}
      </main>
    </div>
  );
}