import { useEffect, useState } from 'react';
import Login from './pages/Login';
import AdminOverviewRedirect from './pages/AdminOverviewRedirect';
import { restoreSession, storeSession } from './lib/api';
import { EmployeePortal } from './views/EmployeePortal';
import { AttendanceKioskView } from './views/AttendanceKioskView';
import { InitialPasswordChangeView } from './views/InitialPasswordChangeView';

function ProtectedDashboard() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<string>('');
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    restoreSession()
      .then(({ response, data }) => { if (response.ok && data) { storeSession(data); setRole(data.role ?? ''); setMustChangePassword(data.mustChangePassword === true); } setAuthorized(response.ok); })
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Verifying secure session...</div>;
  if (!authorized) return <Login />;
  if ((role === 'regular' || role === 'extra') && mustChangePassword) return <InitialPasswordChangeView onComplete={() => setMustChangePassword(false)} />;
  if (role === 'regular' || role === 'extra') return <EmployeePortal />;
  return <AdminOverviewRedirect />;
}

function ProtectedKiosk() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState('');

  useEffect(() => {
    restoreSession()
      .then(({ response, data }) => {
        if (response.ok && data) { storeSession(data); setRole(data.role ?? ''); }
        setAuthorized(response.ok);
      })
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Opening secure attendance kiosk...</div>;
  if (!authorized) return <Login />;
  if (role !== 'admin') return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white"><h1 className="text-xl font-bold">Administrator session required</h1><a className="text-violet-300 underline" href="/overview">Return to your workspace</a></div>;
  return <AttendanceKioskView />;
}

export default function App() {
  // Temporary routing without adding third-party dependencies.
  // If you visit /overview directly, show the admin overview shell.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path === '/kiosk') return <ProtectedKiosk />;
  if (path === '/overview') return <ProtectedDashboard />;
  return <Login />;
}



