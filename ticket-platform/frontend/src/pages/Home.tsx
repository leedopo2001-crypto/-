import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Home() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">내 티켓</h1>
          <p className="text-sm text-slate-500">환영합니다, {user.name}님</p>
        </div>
        <button
          onClick={logout}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          로그아웃
        </button>
      </div>

      <div className="mt-6 rounded-lg bg-white border border-slate-200 p-4">
        <div className="text-xs text-slate-500 mb-1">내 지갑 주소</div>
        <code className="text-xs break-all text-slate-800">{user.walletAddress}</code>
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-400">
        아직 보유한 티켓이 없습니다.
        <br />
        <span className="text-xs">5단계에서 티켓 카드가 렌더링됩니다.</span>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link to="/admin" className="text-slate-500 hover:text-slate-700">기획사 어드민 →</Link>
        <Link to="/market" className="text-slate-500 hover:text-slate-700">재판매 마켓 →</Link>
        <Link to="/staff" className="text-slate-500 hover:text-slate-700">스태프 스캐너 →</Link>
      </div>
    </div>
  );
}
