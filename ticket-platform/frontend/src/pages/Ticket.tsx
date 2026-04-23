import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ticketsApi, type Ticket } from '../lib/api';
import QRDisplay from '../components/QRDisplay';

export default function TicketPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ticketsApi
      .one(id)
      .then((r) => !cancelled && setTicket(r.ticket))
      .catch(() => !cancelled && setError('티켓을 찾을 수 없습니다.'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
        <Link to="/home" className="mt-4 inline-block text-sm text-brand">← 홈</Link>
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">로딩 중…</div>
    );
  }

  const lockPassed = new Date(ticket.event.lockDate).getTime() < Date.now();
  const used = ticket.status === 'used';

  return (
    <div className="min-h-screen px-5 py-6 max-w-md mx-auto">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-slate-700">
        ←
      </button>

      <div className="mt-2">
        <h1 className="text-xl font-bold text-slate-900">{ticket.event.name}</h1>
        <p className="text-sm text-slate-500">{ticket.event.venue}</p>
        <p className="text-sm text-slate-500">
          {new Date(ticket.event.eventDate).toLocaleString('ko-KR')}
        </p>
      </div>

      <div className="mt-4 flex gap-2 text-xs">
        <span className="bg-slate-100 px-2 py-1 rounded">등급 {ticket.grade}</span>
        <span className="bg-slate-100 px-2 py-1 rounded">좌석 {ticket.seatId}</span>
        <span className="bg-slate-100 px-2 py-1 rounded">
          {ticket.price.toLocaleString('ko-KR')}원
        </span>
      </div>

      <div className="mt-8">
        {used ? (
          <div className="rounded-lg bg-slate-100 text-slate-500 text-center py-12">
            이미 사용된 티켓입니다.
          </div>
        ) : (
          <QRDisplay ticketId={ticket.id} />
        )}
      </div>

      <div className="mt-10 border-t pt-4 text-xs text-slate-400 space-y-1">
        <div>토큰 ID: <code className="text-slate-500">{ticket.tokenId}</code></div>
        <div>계약: <code className="text-slate-500 break-all">{ticket.event.contractAddr}</code></div>
        <div>양도 잠금: {new Date(ticket.event.lockDate).toLocaleString('ko-KR')}</div>
      </div>

      <div className="mt-6">
        {!used && !lockPassed && (
          <Link
            to={`/market?list=${ticket.id}`}
            className="block w-full text-center rounded-md border border-slate-300 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            양도하기 (마켓에 등록)
          </Link>
        )}
        {lockPassed && !used && (
          <p className="text-center text-xs text-slate-400">공연 일정에 따라 양도가 잠겼습니다.</p>
        )}
      </div>
    </div>
  );
}
