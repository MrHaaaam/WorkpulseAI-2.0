import { useEffect, useState } from 'react';
import Login from './pages/Login';
import AdminOverviewRedirect from './pages/AdminOverviewRedirect';
import { apiFetch, storeSession } from './lib/api';
import { EmployeePortal } from './views/EmployeePortal';

function ProtectedDashboard() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<string>('');

  useEffect(() => {
    apiFetch('/api/auth/session')
      .then(async (response) => { if (response.ok) { const data = await response.json(); storeSession(data); setRole(data.role); } setAuthorized(response.ok); })
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Verifying secure session...</div>;
  if (!authorized) return <Login />;
  if (role === 'regular' || role === 'extra') return <EmployeePortal />;
  return <AdminOverviewRedirect />;
}

export default function App() {
  // Temporary routing without adding third-party dependencies.
  // If you visit /overview directly, show the admin overview shell.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path === '/overview') return <ProtectedDashboard />;
  return <Login />;
}



