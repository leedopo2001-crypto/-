import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, marketApi, type Listing } from '../lib/api';
import { requestTossPayment } from '../lib/toss';
import { useAuth } from '../lib/auth';

type Tab = 'all' | 'mine';

const errorText: Record<string, string> = {
  buyer_is_seller: '본인의 판매글은 구매할 수 없습니다.',
  listing_not_active: '이미 종료된 판매입니다.',
  lock_passed: '공연 일정에 따라 거래가 잠겼습니다.',
};

export default function Market() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [mineListings, setMineListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      const [a, m] = await Promise.all([marketApi.list(), marketApi.myListings()]);
      setListings(a.listings);
      setMineListings(m.listings);
    } catch {
      setError('마켓을 불러오지 못했습니다.');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onBuy(listingId: string, priceSnapshot: number) {
    setBusy(listingId);
    setError(null);
    try {
      const prep = await marketApi.buy(listingId);
      if (prep.amount !== priceSnapshot) {
        setError('판매 가격이 변경되었습니다. 새로고침 해주세요.');
        return;
      }
      await requestTossPayment({
        clientKey: prep.clientKey,
        amount: prep.amount,
        orderId: prep.orderId,
        orderName: prep.orderName,
        customerName: prep.customerName,
        successUrl: prep.successUrl,
        failUrl: prep.failUrl,
      });
      // requestPayment navigates away on success/fail.
    } catch (e) {
      if (e instanceof ApiError) {
        setError(errorText[e.code] ?? `구매 요청 실패: ${e.code}`);
      } else {
        setError('결제창을 열지 못했습니다.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function onCancel(listingId: string) {
    setBusy(listingId);
    try {
      await marketApi.cancel(listingId);
      refresh();
    } catch {
      setError('판매 취소에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  }

  const visible = tab === 'all' ? listings : mineListings;

  return (
    <div className="min-h-screen px-5 py-6 max-w-md mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">재판매 마켓</h1>
        <Link to="/home" className="text-sm text-slate-500">←</Link>
      </div>

      <div className="mt-3 flex gap-2 text-sm">
        <button
          className={`px-3 py-1 rounded-full ${tab === 'all' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setTab('all')}
        >
          전체
        </button>
        <button
          className={`px-3 py-1 rounded-full ${tab === 'mine' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setTab('mine')}
        >
          내 판매
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {visible === null && <div className="text-slate-400 text-sm text-center py-12">로딩 중…</div>}
        {visible && visible.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-400 text-sm">
            {tab === 'all' ? '판매중인 티켓이 없습니다.' : '내가 등록한 판매가 없습니다.'}
          </div>
        )}
        {visible?.map((l) => {
          const isMine = l.sellerId === user?.id;
          return (
            <div key={l.id} className="rounded-xl bg-white border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{l.ticket.event.name}</div>
                  <div className="text-xs text-slate-500">{l.ticket.event.venue}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(l.ticket.event.eventDate).toLocaleString('ko-KR')}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-[10px] text-slate-400">정가</div>
                  <div className="font-semibold text-slate-900">{l.price.toLocaleString('ko-KR')}원</div>
                </div>
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {l.ticket.grade} · {l.ticket.seatId}
              </div>

              <div className="mt-4">
                {isMine ? (
                  <button
                    onClick={() => onCancel(l.id)}
                    disabled={busy === l.id}
                    className="w-full rounded-md border border-slate-300 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busy === l.id ? '취소 중…' : '판매 취소'}
                  </button>
                ) : (
                  <button
                    onClick={() => onBuy(l.id, l.price)}
                    disabled={busy === l.id}
                    className="w-full rounded-md bg-brand text-white py-2 text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
                  >
                    {busy === l.id ? '결제창 여는 중…' : `${l.price.toLocaleString('ko-KR')}원에 구매하기`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <nav className="fixed bottom-0 inset-x-0 border-t bg-white">
        <div className="max-w-md mx-auto grid grid-cols-3 text-xs">
          <Link to="/home" className="py-3 text-center text-slate-500">홈</Link>
          <Link to="/market" className="py-3 text-center text-brand font-medium">마켓</Link>
          <Link to="/admin" className="py-3 text-center text-slate-500">프로필/어드민</Link>
        </div>
      </nav>
    </div>
  );
}
