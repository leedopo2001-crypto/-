import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { adminApi, ticketsApi, type Ticket } from '../lib/api';
import BottomNav from '../components/BottomNav';

export default function Profile() {
  const { user, logout } = useAuth();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    ticketsApi.my().then((r) => setTickets(r.tickets)).catch(() => setTickets([]));
    // Probe admin: the admin list endpoint returns 403 for non-admins.
    adminApi.listEvents().then(() => setIsAdmin(true)).catch(() => setIsAdmin(false));
  }, []);

  if (!user) return null;

  const issued = tickets?.filter((t) => t.status === 'issued').length ?? 0;
  const used = tickets?.filter((t) => t.status === 'used').length ?? 0;

  return (
    <div className="min-h-screen px-5 py-6 max-w-md mx-auto pb-24">
      <h1 className="text-xl font-bold text-slate-900">프로필</h1>

      <div className="mt-4 rounded-xl bg-white border border-slate-200 p-4">
        <div className="text-sm text-slate-500">이름</div>
        <div className="text-lg font-semibold text-slate-900">{user.name}</div>
        <div className="mt-3 text-sm text-slate-500">전화번호</div>
        <div className="text-slate-700">{formatPhone(user.phone)}</div>
        <div className="mt-3 text-sm text-slate-500">내 지갑 주소</div>
        <code className="text-xs break-all text-slate-700">{user.walletAddress}</code>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="보유 티켓" value={issued} />
        <Stat label="입장 완료" value={used} />
      </div>

      <div className="mt-6 space-y-2">
        {isAdmin && (
          <Link
            to="/admin"
            className="block text-center rounded-md border border-slate-300 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            기획사 어드민 →
          </Link>
        )}
        <Link
          to="/staff"
          className="block text-center rounded-md border border-slate-300 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          스태프 QR 스캐너 →
        </Link>
        <button
          onClick={logout}
          className="block w-full text-center rounded-md border border-slate-300 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
        >
          로그아웃
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function formatPhone(d: string): string {
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
