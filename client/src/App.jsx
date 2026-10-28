import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Shell from './components/Shell.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ContentList from './pages/ContentList.jsx';
import ContentEditor from './pages/ContentEditor.jsx';
import BrandRules from './pages/BrandRules.jsx';
import Insights from './pages/Insights.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Help from './pages/Help.jsx';
import History from './pages/History.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10 text-center text-sm text-slate-500">Loading your workspace…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/content" element={<ContentList />} />
        <Route path="/content/new" element={<ContentEditor />} />
        <Route path="/content/:id" element={<ContentEditor />} />
        <Route path="/content/:id/history" element={<History />} />
        <Route path="/brand" element={<BrandRules />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/help" element={<Help />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
