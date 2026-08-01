import { useEffect, useState } from 'react';
import Login from './pages/Login';
import AdminOverviewRedirect from './pages/AdminOverviewRedirect';

function ProtectedDashboard() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('workpulse_token');
    if (!token) { setAuthorized(false); return; }
    fetch('http://localhost:5000/api/auth/session', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => setAuthorized(response.ok))
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Verifying secure session...</div>;
  if (!authorized) return <Login />;
  return <AdminOverviewRedirect />;
}

export default function App() {
  // Temporary routing without adding third-party dependencies.
  // If you visit /overview directly, show the admin overview shell.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path === '/overview') return <ProtectedDashboard />;
  return <Login />;
}



