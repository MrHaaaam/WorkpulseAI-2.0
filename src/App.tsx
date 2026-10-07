import { useCallback, useEffect, useRef, useState } from 'react';
import Login from './pages/Login';
import AdminOverviewRedirect from './pages/AdminOverviewRedirect';
import { apiFetch, clearSession, restoreSession, storeSession } from './lib/api';
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
  if (['regular', 'extra', 'manager', 'supervisor'].includes(role) && mustChangePassword) return <InitialPasswordChangeView onComplete={() => setMustChangePassword(false)} />;
  if (['regular', 'extra', 'manager', 'supervisor'].includes(role)) return <EmployeePortal />;
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

function arrivedThroughHistory() {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type === 'back_forward';
}

export default function App() {
  const path = window.location.pathname;
  const isLoginPage = !['/overview', '/kiosk'].includes(path);
  const [endingSession, setEndingSession] = useState(() => isLoginPage && Boolean(sessionStorage.getItem('workpulse_session_expires')));
  const [logoutError, setLogoutError] = useState('');
  const logoutPending = useRef(false);
  const endSession = useCallback(async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setEndingSession(true);
    setLogoutError('');
    try {
      // Finish any initial session check before revoking the session and its CSRF token.
      const { response, data } = await restoreSession();
      if (response.ok && data) storeSession(data);
      const result = await apiFetch('/api/auth/logout', { method: 'POST' });
      if (!result.ok && result.status !== 401) throw new Error('Logout failed');
      clearSession();
      window.location.replace('/');
    } catch {
      setLogoutError('Unable to end your session. Check your connection and try again.');
      logoutPending.current = false;
    }
  }, []);
  // Temporary routing without adding third-party dependencies.
  // If you visit /overview directly, show the admin overview shell.
  useEffect(() => {
    // Only crossing back to sign-in ends the session. Sidebar history stays
    // authenticated and is handled by each portal's navigation hook.
    if (!isLoginPage || (!arrivedThroughHistory() && !sessionStorage.getItem('workpulse_session_expires'))) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void endSession(); });
    return () => { cancelled = true; };
  }, [isLoginPage, endSession]);
  useEffect(() => {
    const restoreProtectedPage = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (isLoginPage) void endSession();
      // Forward may restore a cached workspace after logout. Reload it so the
      // server session check runs before any protected content is shown again.
      else window.location.reload();
    };
    window.addEventListener('pageshow', restoreProtectedPage);
    return () => window.removeEventListener('pageshow', restoreProtectedPage);
  }, [isLoginPage, endSession]);
  if (endingSession) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center text-sm text-slate-600">{logoutError ? <><p role="alert">{logoutError}</p><button type="button" onClick={() => void endSession()} className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white">Retry logout</button></> : <p role="status">Ending your session...</p>}</div>;
  if (path === '/kiosk') return <ProtectedKiosk />;
  if (path === '/overview') return <ProtectedDashboard />;
  return <Login />;
}



