import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { paymentApi, ApiError } from '../lib/api';

type Status =
  | { kind: 'loading' }
  | { kind: 'success'; fee: number; price: number; txHash: string; mocked: boolean }
  | { kind: 'error'; message: string };

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    const paymentKey = params.get('paymentKey') ?? '';
    const orderId = params.get('orderId') ?? '';
    const amount = Number(params.get('amount') ?? '0');
    if (!paymentKey || !orderId || !amount) {
      setStatus({ kind: 'error', message: '결제 정보가 부족합니다.' });
      return;
    }
    paymentApi
      .confirm(paymentKey, orderId, amount)
      .then((r) => {
        if (!r.settle) {
          setStatus({
            kind: 'success',
            price: amount,
            fee: 0,
            txHash: r.toss.paymentKey,
            mocked: r.toss.mocked,
          });
          return;
        }
        setStatus({
          kind: 'success',
          price: r.settle.price,
          fee: r.settle.fee,
          txHash: r.settle.txHash,
          mocked: r.settle.mocked,
        });
      })
      .catch((e: unknown) => {
        const msg =
          e instanceof ApiError ? `${e.code}` : '결제 승인 중 오류가 발생했습니다.';
        setStatus({ kind: 'error', message: msg });
      });
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        {status.kind === 'loading' && (
          <p className="text-slate-500">결제 승인 중…</p>
        )}
        {status.kind === 'success' && (
          <div>
            <div className="text-5xl">✅</div>
            <h1 className="mt-3 text-xl font-bold text-slate-900">결제 완료</h1>
            <p className="mt-1 text-sm text-slate-500">티켓 소유권이 이전되었습니다.</p>
            <div className="mt-4 rounded-lg bg-white border border-slate-200 p-4 text-left text-sm text-slate-700">
              <div className="flex justify-between"><span>결제 금액</span><span>{status.price.toLocaleString('ko-KR')}원</span></div>
              <div className="flex justify-between"><span>플랫폼 수수료 (5%)</span><span className="text-slate-500">{status.fee.toLocaleString('ko-KR')}원</span></div>
              <div className="mt-2 pt-2 border-t text-[11px] text-slate-400 break-all">
                tx {status.txHash}{status.mocked ? ' (mock)' : ''}
              </div>
            </div>
            <Link to="/home" className="mt-6 inline-block rounded-md bg-brand text-white px-5 py-2 text-sm">내 티켓으로</Link>
          </div>
        )}
        {status.kind === 'error' && (
          <div>
            <div className="text-5xl">⚠️</div>
            <h1 className="mt-3 text-xl font-bold text-slate-900">결제 승인 실패</h1>
            <p className="mt-1 text-sm text-red-600">{status.message}</p>
            <Link to="/market" className="mt-6 inline-block rounded-md border border-slate-300 px-5 py-2 text-sm">마켓으로</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function PaymentFail() {
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const message = params.get('message') ?? '결제가 취소되었습니다.';
  const orderId = params.get('orderId') ?? '';

  useEffect(() => {
    if (orderId) paymentApi.fail(orderId, code, message).catch(() => {});
  }, [orderId, code, message]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl">❌</div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">결제 실패</h1>
        <p className="mt-1 text-sm text-red-600">{message}</p>
        {code && <p className="text-xs text-slate-400">code: {code}</p>}
        <Link to="/market" className="mt-6 inline-block rounded-md border border-slate-300 px-5 py-2 text-sm">
          마켓으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
