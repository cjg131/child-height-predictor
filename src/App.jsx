import React from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ChildrenListPage from './pages/ChildrenListPage.jsx';
import ChildDetailPage from './pages/ChildDetailPage.jsx';
import NewChildPage from './pages/NewChildPage.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Nav() {
  const { user, signOut } = useAuth();
  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold text-brand-700">Child Height Predictor</Link>
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{user.email}</span>
            <button
              onClick={signOut}
              className="text-sm text-brand-600 hover:text-brand-700 underline"
            >Sign out</button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><ChildrenListPage /></RequireAuth>} />
          <Route path="/children/new" element={<RequireAuth><NewChildPage /></RequireAuth>} />
          <Route path="/children/:childId" element={<RequireAuth><ChildDetailPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
