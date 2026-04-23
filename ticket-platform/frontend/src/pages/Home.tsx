import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ticketsApi, type Ticket } from '../lib/api';
import TicketCard from '../components/TicketCard';

export default function Home() {
  const { user, logout } = useAuth();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ticketsApi
      .my()
      .then((r) => !cancelled && setTickets(r.tickets))
      .catch(() => !cancelled && setError('티켓 목록을 불러오지 못했습니다.'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen px-5 py-6 max-w-md mx-auto pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">내 티켓</h1>
          <p className="text-sm text-slate-500">{user.name}님</p>
        </div>
        <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-700">
          로그아웃
        </button>
      </div>

      <div className="mt-4 rounded-lg bg-white border border-slate-200 p-3">
        <div className="text-[11px] text-slate-500">내 지갑 주소</div>
        <code className="text-[11px] break-all text-slate-800">{user.walletAddress}</code>
      </div>

      <div className="mt-6 space-y-3">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {tickets === null && !error && (
          <div className="text-center text-slate-400 py-12 text-sm">로딩 중…</div>
        )}
        {tickets && tickets.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-400">
            아직 보유한 티켓이 없습니다.
          </div>
        )}
        {tickets?.map((t) => (
          <TicketCard key={t.id} ticket={t} />
        ))}
      </div>

      <nav className="fixed bottom-0 inset-x-0 border-t bg-white">
        <div className="max-w-md mx-auto grid grid-cols-3 text-xs">
          <Link to="/home" className="py-3 text-center text-brand font-medium">홈</Link>
          <Link to="/market" className="py-3 text-center text-slate-500">마켓</Link>
          <Link to="/admin" className="py-3 text-center text-slate-500">프로필/어드민</Link>
        </div>
      </nav>
    </div>
  );
}
