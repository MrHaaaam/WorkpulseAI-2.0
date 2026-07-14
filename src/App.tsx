import Login from './pages/Login';
import AdminOverviewRedirect from './pages/AdminOverviewRedirect';

export default function App() {
  // Temporary routing without adding third-party dependencies.
  // If you visit /overview directly, show the admin overview shell.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path === '/overview') return <AdminOverviewRedirect />;
  return <Login />;
}



