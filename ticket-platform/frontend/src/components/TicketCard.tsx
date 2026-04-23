import { Link } from 'react-router-dom';
import type { Ticket } from '../lib/api';

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TicketCard({ ticket }: { ticket: Ticket }) {
  const d = daysUntil(ticket.event.eventDate);
  const isToday = d === 0;
  const used = ticket.status === 'used';
  const badge =
    used ? { text: '사용 완료', className: 'bg-slate-200 text-slate-600' }
    : isToday ? { text: 'D-DAY', className: 'bg-red-100 text-red-700' }
    : d > 0 ? { text: `D-${d}`, className: 'bg-slate-100 text-slate-700' }
    : { text: '공연 종료', className: 'bg-slate-200 text-slate-500' };

  return (
    <Link
      to={`/ticket/${ticket.id}`}
      className="block rounded-xl bg-white border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">{ticket.event.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{ticket.event.venue}</p>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${badge.className}`}>
          {badge.text}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-slate-700">
          <span className="font-medium">{ticket.grade}</span>
          <span className="text-slate-400 mx-1">·</span>
          <span className="text-slate-500">{ticket.seatId}</span>
        </div>
        <div className="text-xs text-slate-500">{formatDate(ticket.event.eventDate)}</div>
      </div>

      {isToday && !used && (
        <div className="mt-3 -mb-1 rounded-md bg-red-50 text-red-700 text-sm font-medium py-2 text-center">
          QR 보기 →
        </div>
      )}
    </Link>
  );
}
