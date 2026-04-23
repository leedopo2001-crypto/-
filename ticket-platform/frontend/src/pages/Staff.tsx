import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import { qrApi, type VerifyFail, type VerifyOk } from '../lib/api';

type State =
  | { kind: 'idle' }
  | { kind: 'ok'; data: VerifyOk }
  | { kind: 'bad'; data: VerifyFail };

const reasonText: Record<string, string> = {
  malformed: '잘못된 QR 입니다',
  bad_signature: '위조된 QR 입니다',
  expired: 'QR이 만료되었습니다',
  not_found: '존재하지 않는 티켓',
  already_used: '이미 사용된 티켓',
  invalid_status: '사용할 수 없는 상태',
};

function vibrate(pattern: number | number[]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

export default function Staff() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const busyRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          loop();
        }
      } catch (e) {
        console.error(e);
        setErr('카메라 권한이 필요합니다.');
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loop() {
    rafRef.current = requestAnimationFrame(loop);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;
    if (busyRef.current) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (!code) return;

    busyRef.current = true;
    qrApi
      .verify(code.data)
      .then((r) => {
        if (r.ok) {
          vibrate(200);
          setState({ kind: 'ok', data: r });
        } else {
          vibrate([100, 50, 100]);
          setState({ kind: 'bad', data: r });
        }
      })
      .catch(() => setState({ kind: 'bad', data: { ok: false, reason: 'malformed' } }))
      .finally(() => {
        // Cooldown 1.5s before the next scan so a single QR is not verified twice.
        setTimeout(() => {
          busyRef.current = false;
        }, 1500);
      });
  }

  if (err) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-600">{err}</p>
        <Link to="/home" className="mt-4 text-sm text-brand">← 홈</Link>
      </div>
    );
  }

  const overlay =
    state.kind === 'ok' ? (
      <div className="absolute inset-0 bg-emerald-500/95 flex flex-col items-center justify-center text-white p-6">
        <div className="text-5xl mb-3">✓</div>
        <h2 className="text-xl font-bold">입장 승인</h2>
        <p className="mt-2 text-lg">{state.data.ticket.event.name}</p>
        <p className="mt-1 text-2xl font-semibold">
          {state.data.ticket.grade} · {state.data.ticket.seatId}
        </p>
        <p className="mt-2 opacity-90">{state.data.ticket.holderNameMasked}</p>
        <button
          onClick={() => setState({ kind: 'idle' })}
          className="mt-6 rounded-md bg-white/20 border border-white/40 px-6 py-2"
        >
          다음 스캔
        </button>
      </div>
    ) : state.kind === 'bad' ? (
      <div className="absolute inset-0 bg-red-600/95 flex flex-col items-center justify-center text-white p-6">
        <div className="text-5xl mb-3">✕</div>
        <h2 className="text-xl font-bold">입장 불가</h2>
        <p className="mt-2 text-lg">{reasonText[state.data.reason] ?? state.data.reason}</p>
        <button
          onClick={() => setState({ kind: 'idle' })}
          className="mt-6 rounded-md bg-white/20 border border-white/40 px-6 py-2"
        >
          다시 스캔
        </button>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900">
        <Link to="/home" className="text-sm text-slate-300">← 홈</Link>
        <span className="text-sm">스태프 QR 스캐너</span>
        <span className="w-12" />
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-64 h-64 border-2 border-white/70 rounded-2xl" />
        </div>
        {overlay}
      </div>
    </div>
  );
}
