import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, ApiError, type Event } from '../lib/api';
import { useAuth } from '../lib/auth';

interface GradeRow {
  grade: string;
  price: string;
  totalCount: string;
}

const EMPTY_ROW: GradeRow = { grade: '', price: '', totalCount: '' };

export default function Admin() {
  const { user, logout } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [lockDate, setLockDate] = useState('');
  const [grades, setGrades] = useState<GradeRow[]>([{ ...EMPTY_ROW }]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi
      .listEvents()
      .then((r) => {
        if (!cancelled) setEvents(r.events);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 403) {
          setLoadError('관리자 계정이 아닙니다. .env 의 ADMIN_PHONE 값과 로그인한 번호가 같아야 합니다.');
        } else {
          setLoadError('이벤트 목록을 불러오지 못했습니다.');
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (name.trim().length < 2) return setCreateError('공연명을 입력해주세요.');
    if (venue.trim().length < 1) return setCreateError('공연장을 입력해주세요.');
    if (!eventDate) return setCreateError('공연 일시를 선택해주세요.');
    if (!lockDate) return setCreateError('양도 잠금 일시를 선택해주세요.');

    const rows = grades.map((g, i) => {
      const price = Number(g.price);
      const totalCount = Number(g.totalCount);
      if (!g.grade.trim()) throw new RowError(`${i + 1}번 좌석등급 이름을 입력해주세요.`);
      if (!Number.isFinite(price) || price <= 0) throw new RowError(`${i + 1}번 등급의 가격이 올바르지 않습니다.`);
      if (!Number.isInteger(totalCount) || totalCount <= 0)
        throw new RowError(`${i + 1}번 등급의 수량이 올바르지 않습니다.`);
      return { grade: g.grade.trim(), price, totalCount };
    });

    setSubmitting(true);
    try {
      await adminApi.createEvent({
        name: name.trim(),
        venue: venue.trim(),
        eventDate: new Date(eventDate).toISOString(),
        lockDate: new Date(lockDate).toISOString(),
        seatGrades: rows,
      });
      setName('');
      setVenue('');
      setEventDate('');
      setLockDate('');
      setGrades([{ ...EMPTY_ROW }]);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      if (err instanceof RowError) setCreateError(err.message);
      else if (err instanceof ApiError) setCreateError(`등록 실패: ${err.code}`);
      else setCreateError('등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">로딩 중…</div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
        <div className="mt-4 flex gap-3 text-sm">
          <Link to="/home" className="text-brand hover:text-brand-dark">← 홈으로</Link>
          <button onClick={logout} className="text-slate-500 hover:text-slate-700">로그아웃</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">어드민 — 공연 관리</h1>
          <p className="text-xs text-slate-500">{user?.name} · {user?.phone}</p>
        </div>
        <Link to="/home" className="text-sm text-slate-500 hover:text-slate-700">← 홈</Link>
      </div>

      <section className="mt-6 rounded-lg bg-white border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">새 공연 등록</h2>
        <form onSubmit={createEvent} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-700">공연명</span>
              <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-700">공연장</span>
              <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={venue} onChange={(e) => setVenue(e.target.value)} disabled={submitting} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-700">공연 일시</span>
              <input type="datetime-local" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={eventDate} onChange={(e) => setEventDate(e.target.value)} disabled={submitting} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-700">양도 잠금 일시</span>
              <input type="datetime-local" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={lockDate} onChange={(e) => setLockDate(e.target.value)} disabled={submitting} />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">좌석 등급</span>
              <button type="button"
                onClick={() => setGrades((g) => [...g, { ...EMPTY_ROW }])}
                className="text-sm text-brand hover:text-brand-dark" disabled={submitting}>
                + 등급 추가
              </button>
            </div>
            <div className="space-y-2">
              {grades.map((g, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input className="col-span-4 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="등급 (예: VIP)"
                    value={g.grade}
                    onChange={(e) => setGrades((arr) => arr.map((x, j) => j === i ? { ...x, grade: e.target.value } : x))}
                    disabled={submitting} />
                  <input className="col-span-4 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="가격 (원)"
                    inputMode="numeric"
                    value={g.price}
                    onChange={(e) => setGrades((arr) => arr.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                    disabled={submitting} />
                  <input className="col-span-3 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="수량"
                    inputMode="numeric"
                    value={g.totalCount}
                    onChange={(e) => setGrades((arr) => arr.map((x, j) => j === i ? { ...x, totalCount: e.target.value } : x))}
                    disabled={submitting} />
                  <button type="button"
                    onClick={() => setGrades((arr) => arr.length > 1 ? arr.filter((_, j) => j !== i) : arr)}
                    className="col-span-1 text-slate-400 hover:text-red-500 text-lg"
                    disabled={submitting}>×</button>
                </div>
              ))}
            </div>
          </div>

          {createError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="rounded-md bg-brand text-white px-5 py-2 font-medium hover:bg-brand-dark disabled:opacity-50">
            {submitting ? '등록 중… (컨트랙트 배포)' : '공연 등록 + 컨트랙트 배포'}
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-slate-800 mb-3">등록된 공연</h2>
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
            아직 등록된 공연이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((ev) => (
              <EventCard key={ev.id} event={ev} onMinted={() => setRefreshKey((k) => k + 1)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EventCard({ event, onMinted }: { event: Event; onMinted: () => void }) {
  const [selectedGrade, setSelectedGrade] = useState(event.seatGrades[0]?.grade ?? '');
  const [walletsText, setWalletsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalCap = event.seatGrades.reduce((s, g) => s + g.totalCount, 0);
  const issued = event._count?.tickets ?? 0;

  async function mint() {
    setError(null);
    setResult(null);
    const addresses = walletsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (addresses.length === 0) return setError('지갑 주소를 한 줄에 하나씩 입력해주세요.');
    for (const a of addresses) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return setError(`잘못된 주소 형식: ${a}`);
    }
    setSubmitting(true);
    try {
      const assignments = addresses.map((walletAddress) => ({ grade: selectedGrade, walletAddress }));
      const r = await adminApi.mint(event.id, assignments);
      setResult(`${r.tickets.length}건 민팅 완료`);
      setWalletsText('');
      onMinted();
    } catch (err) {
      if (err instanceof ApiError) setError(`민팅 실패: ${err.code}`);
      else setError('민팅 중 오류');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg bg-white border border-slate-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">{event.name}</h3>
          <p className="text-sm text-slate-500">{event.venue} · {new Date(event.eventDate).toLocaleString('ko-KR')}</p>
          <p className="text-xs text-slate-400 mt-1">
            발권 {issued} / {totalCap} · 양도 잠금 {new Date(event.lockDate).toLocaleString('ko-KR')}
          </p>
          <code className="text-[10px] text-slate-400 break-all">계약 {event.contractAddr}</code>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {event.seatGrades.map((g) => (
          <span key={g.id} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
            {g.grade} · {g.price.toLocaleString('ko-KR')}원 · {g.totalCount}석
          </span>
        ))}
      </div>

      <div className="mt-4 border-t pt-4">
        <h4 className="text-sm font-medium text-slate-700 mb-2">당첨자 지갑 민팅</h4>
        <div className="flex gap-2 items-start">
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            {event.seatGrades.map((g) => (
              <option key={g.id} value={g.grade}>{g.grade}</option>
            ))}
          </select>
          <textarea
            rows={3}
            placeholder={'0x...\n0x...\n(한 줄에 하나씩, 콤마/공백 구분도 가능)'}
            value={walletsText}
            onChange={(e) => setWalletsText(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
          />
        </div>
        {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
        {result && <div className="mt-2 text-sm text-emerald-700">{result}</div>}
        <button
          onClick={mint}
          disabled={submitting || !selectedGrade}
          className="mt-2 rounded-md bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? '민팅 중…' : `${selectedGrade} 등급 일괄 민팅`}
        </button>
      </div>
    </div>
  );
}

class RowError extends Error {}
