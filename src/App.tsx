import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Brand } from './components/Brand';
import { useApp } from './context/AppContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { PracticePage } from './pages/PracticePage';
import { ResultsPage } from './pages/ResultsPage';
import { SettingsPage } from './pages/SettingsPage';

function ProtectedLayout() {
  const { user } = useApp();
  if (!user) return <Navigate to="/auth" replace />;
  return <AppShell><Outlet /></AppShell>;
}

function AuthRoute() {
  const { user } = useApp();
  return user ? <Navigate to="/dashboard" replace /> : <AuthPage />;
}

function NotFound() {
  return (
    <div className="page error-page">
      <span className="error-code">404</span>
      <h1>That page missed the point.</h1>
      <p>Head back to your dashboard and start from a topic.</p>
      <Link className="button primary" to="/dashboard">Dashboard</Link>
    </div>
  );
}

export function App() {
  const { ready, bootError, retryBootstrap, user } = useApp();

  if (!ready) {
    return (
      <div className="boot-screen">
        <Brand compact />
        <div className="boot-pulse"><span /><LoaderCircle size={25} /></div>
        <p>Preparing your private speaking space…</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="boot-screen boot-error">
        <span className="dialog-icon danger"><AlertTriangle size={23} /></span>
        <h1>VoxLab could not start</h1>
        <p>{bootError}</p>
        <button className="button secondary" type="button" onClick={retryBootstrap}><RefreshCw size={16} /> Try again</button>
        <small>If database mode is selected, check the server endpoint and credentials in the configuration files.</small>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={<AuthRoute />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/results/:id" element={<ResultsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/auth'} replace />} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/auth'} replace />} />
    </Routes>
  );
}
