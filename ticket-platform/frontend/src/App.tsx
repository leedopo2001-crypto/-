import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Admin from './pages/Admin';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="mt-2 text-slate-500">이 화면은 다음 단계에서 구현됩니다.</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        로딩 중…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function Public({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route
          path="/onboarding"
          element={
            <Public>
              <Onboarding />
            </Public>
          }
        />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route path="/ticket/:id" element={<Placeholder title="티켓 상세 (5단계)" />} />
        <Route path="/market" element={<Placeholder title="마켓 (7단계)" />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Admin />
            </RequireAuth>
          }
        />
        <Route path="/staff" element={<Placeholder title="스태프 스캐너 (5단계)" />} />
        <Route path="*" element={<Placeholder title="404" />} />
      </Routes>
    </AuthProvider>
  );
}
