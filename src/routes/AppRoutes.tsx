import { useState } from 'react';
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
import AttendanceView from '../views/AttendanceView';



export function AppRoutes() {
  // Parse `?view=` and `?role=` from the URL and keep them in component state.
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const paramView = (params.get('view') || 'overview') as ViewKey;
  const allowedViews = ['overview','employees','biometric','payroll','analytics','settings','leave','admin'];
  const initialView: ViewKey = allowedViews.includes(paramView) ? (paramView as ViewKey) : 'overview';
  const initialRole: 'manager' | 'admin' = params.get('role') === 'admin' ? 'admin' : 'manager';

  const [active, setActive] = useState<ViewKey>(initialView);
  const [role] = useState<'manager' | 'admin'>(initialRole);

  const viewMap: Record<ViewKey, React.ReactNode> = {
    overview: role === 'admin' ? <AdminOverviewView /> : <OverviewView />,
    attendance: <AttendanceView role={role} />,
    employees: <EmployeeDirectoryView />,

    biometric: <BiometricView />,
    leave: <LeaveRequestsView />,
    payroll: <PayrollView />,
    analytics: <AnalyticsView />,
    admin: <AdminView />,
    settings: <SettingsView />,
  };


  // For admin, only replace the `payroll` view with the approvals page.
  // Other tabs should still render their own admin pages.
  const effectiveViewMap: Record<ViewKey, React.ReactNode> = {
    ...viewMap,
    payroll: role === 'admin' ? <AdminPayrollApprovalsView /> : <PayrollView />,
  };



  return (
    <div className="flex h-screen w-full">
      {role === 'admin' ? (
        <AdminSidebar active={active} onNavigate={setActive} />
      ) : (
        <ManagerSidebar active={active} onNavigate={setActive} />
      )}
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{effectiveViewMap[active]}</main>

    </div>
  );
}

