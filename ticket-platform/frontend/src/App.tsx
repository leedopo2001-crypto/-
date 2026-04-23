import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Admin from './pages/Admin';
import Ticket from './pages/Ticket';
import Staff from './pages/Staff';
import Market from './pages/Market';
import Profile from './pages/Profile';
import { PaymentSuccess, PaymentFail } from './pages/PaymentResult';

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-5xl">🙈</div>
        <h1 className="mt-4 text-xl font-bold text-slate-800">페이지를 찾을 수 없습니다</h1>
        <Link to="/home" className="mt-4 inline-block text-sm text-brand">홈으로 돌아가기</Link>
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
        <Route
          path="/ticket/:id"
          element={
            <RequireAuth>
              <Ticket />
            </RequireAuth>
          }
        />
        <Route
          path="/market"
          element={
            <RequireAuth>
              <Market />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Admin />
            </RequireAuth>
          }
        />
        <Route
          path="/staff"
          element={
            <RequireAuth>
              <Staff />
            </RequireAuth>
          }
        />
        <Route
          path="/payment/success"
          element={
            <RequireAuth>
              <PaymentSuccess />
            </RequireAuth>
          }
        />
        <Route
          path="/payment/fail"
          element={
            <RequireAuth>
              <PaymentFail />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
