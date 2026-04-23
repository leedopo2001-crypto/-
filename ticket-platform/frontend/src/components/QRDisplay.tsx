import { useEffect, useState } from 'react';
import { ticketsApi, type QrResponse } from '../lib/api';

/**
 * QRDisplay re-issues the QR token from the server before expiry.
 * The server signs each token with HMAC-SHA256 over ticketId+iat+exp (30s TTL),
 * so a screenshotted QR becomes invalid within at most 30 seconds.
 */
export default function QRDisplay({ ticketId }: { ticketId: string }) {
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [remaining, setRemaining] = useState(30);

  async function refresh() {
    try {
      const r = await ticketsApi.qr(ticketId);
      setQr(r);
      setError(null);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
    } catch {
      setError('QR을 불러오지 못했습니다.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (!qr) return;
    const tick = setInterval(() => {
      const left = Math.max(0, qr.expiresAt - Math.floor(Date.now() / 1000));
      setRemaining(left);
      if (left === 0) refresh();
    }, 250);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr]);

  return (
    <div className="flex flex-col items-center">
      <div
        className={`rounded-2xl p-4 bg-white border transition-opacity duration-150 ${
          flash ? 'opacity-40' : 'opacity-100'
        }`}
      >
        {qr ? (
          <img src={qr.qrDataUrl} alt="ticket qr" className="w-64 h-64" />
        ) : (
          <div className="w-64 h-64 flex items-center justify-center text-slate-400">
            {error ?? 'QR 생성 중…'}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <div className="h-1 w-48 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand transition-[width] duration-300"
            style={{ width: `${(remaining / 30) * 100}%` }}
          />
        </div>
        <span className="text-sm text-slate-500 tabular-nums w-8 text-right">{remaining}s</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">QR은 30초마다 자동 갱신됩니다.</p>
    </div>
  );
}
