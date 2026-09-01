import { useEffect, useState } from 'react';
import Login from './pages/Login';
import AdminOverviewRedirect from './pages/AdminOverviewRedirect';
import { clearSession, restoreSession, storeSession } from './lib/api';
import { EmployeePortal } from './views/EmployeePortal';
import { AttendanceKioskView } from './views/AttendanceKioskView';
import { InitialPasswordChangeView } from './views/InitialPasswordChangeView';

function ProtectedDashboard() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<string>('');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    restoreSession()
      .then(({ response, data }) => { if (response.ok && data) { storeSession(data); setRole(data.role ?? ''); setMustChangePassword(data.mustChangePassword === true); setExpiresAt(data.expiresAt ?? ''); } setAuthorized(response.ok); })
      .catch(() => setAuthorized(false));
  }, []);
  useSessionExpiry(expiresAt);

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Verifying secure session...</div>;
  if (!authorized) return <Login />;
  if ((role === 'regular' || role === 'extra') && mustChangePassword) return <InitialPasswordChangeView onComplete={() => setMustChangePassword(false)} />;
  if (role === 'regular' || role === 'extra') return <EmployeePortal />;
  return <AdminOverviewRedirect />;
}

function ProtectedKiosk() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    restoreSession()
      .then(({ response, data }) => {
        if (response.ok && data) { storeSession(data); setRole(data.role ?? ''); setExpiresAt(data.expiresAt ?? ''); }
        setAuthorized(response.ok);
      })
      .catch(() => setAuthorized(false));
  }, []);
  useSessionExpiry(expiresAt);

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Opening secure attendance kiosk...</div>;
  if (!authorized) return <Login />;
  if (role !== 'admin') return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white"><h1 className="text-xl font-bold">Administrator session required</h1><a className="text-violet-300 underline" href="/overview">Return to your workspace</a></div>;
  return <AttendanceKioskView />;
}

function useSessionExpiry(expiresAt: string) {
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    const expire = () => { clearSession(); window.location.replace('/'); };
    if (!Number.isFinite(remaining) || remaining <= 0) { expire(); return; }
    const timer = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
}

export default function App() {
  // Temporary routing without adding third-party dependencies.
  // If you visit /overview directly, show the admin overview shell.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  useEffect(() => {
    const restoreProtectedPage = (event: PageTransitionEvent) => {
      if (event.persisted && ['/overview', '/kiosk'].includes(window.location.pathname)) window.location.reload();
    };
    window.addEventListener('pageshow', restoreProtectedPage);
    return () => window.removeEventListener('pageshow', restoreProtectedPage);
  }, []);
  if (path === '/kiosk') return <ProtectedKiosk />;
  if (path === '/overview') return <ProtectedDashboard />;
  return <Login />;
}



