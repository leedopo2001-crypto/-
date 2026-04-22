import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

type Mode = 'register' | 'login';

const PHONE_RE = /^01[0-9]-?\d{3,4}-?\d{4}$/;

export default function Onboarding() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('register');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPhone = (v: string) => {
    const d = v.replace(/[^\d]/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  function validate(): string | null {
    if (name.trim().length < 2) return '이름을 2자 이상 입력해주세요.';
    if (!PHONE_RE.test(phone)) return '전화번호 형식이 올바르지 않습니다. 예) 010-1234-5678';
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'register') await register(name.trim(), phone);
      else await login(name.trim(), phone);
      navigate('/home', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(messageFor(err.code, mode));
      } else {
        setError('알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-slate-50">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">NFT 티켓 플랫폼</h1>
        <p className="text-slate-500 text-sm mb-8">
          {mode === 'register' ? '실명인증 후 지갑이 자동 생성됩니다.' : '이름과 전화번호로 로그인합니다.'}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">이름</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              autoComplete="name"
              disabled={submitting}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">전화번호</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="010-1234-5678"
              inputMode="numeric"
              autoComplete="tel"
              disabled={submitting}
            />
          </label>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand text-white py-2.5 font-medium hover:bg-brand-dark disabled:opacity-50"
          >
            {submitting ? '처리 중…' : mode === 'register' ? '인증하기' : '로그인'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'register' ? 'login' : 'register');
            setError(null);
          }}
          className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700"
        >
          {mode === 'register' ? '이미 가입하셨나요? 로그인' : '처음이신가요? 가입하기'}
        </button>
      </div>
    </div>
  );
}

function messageFor(code: string, mode: Mode): string {
  switch (code) {
    case 'invalid_name':
      return '이름이 올바르지 않습니다.';
    case 'invalid_phone':
      return '전화번호 형식이 올바르지 않습니다.';
    case 'phone_already_registered':
      return '이미 가입된 번호입니다. 로그인해주세요.';
    case 'user_not_found':
      return mode === 'login' ? '등록된 사용자를 찾을 수 없습니다.' : '인증에 실패했습니다.';
    default:
      return '요청 처리 중 오류가 발생했습니다.';
  }
}
