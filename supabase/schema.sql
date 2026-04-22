-- here 실시간 위치 공유용 스키마
-- Supabase Dashboard → SQL Editor 에 붙여넣고 "Run" 실행.

-- ===== 1) 테이블 =====

CREATE TABLE IF NOT EXISTS public.sessions (
  short_code TEXT PRIMARY KEY,
  user_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.locations (
  id BIGSERIAL PRIMARY KEY,
  session_code TEXT NOT NULL REFERENCES public.sessions(short_code) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS locations_session_code_updated_at_idx
  ON public.locations (session_code, updated_at DESC);

-- ===== 2) Row Level Security =====
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- 익명 사용자가 세션을 생성/조회/종료할 수 있도록 허용.
-- (짧은 코드 자체가 비밀 역할을 함)
DROP POLICY IF EXISTS sessions_insert_anon ON public.sessions;
CREATE POLICY sessions_insert_anon ON public.sessions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS sessions_select_anon ON public.sessions;
CREATE POLICY sessions_select_anon ON public.sessions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS sessions_update_anon ON public.sessions;
CREATE POLICY sessions_update_anon ON public.sessions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS locations_insert_anon ON public.locations;
CREATE POLICY locations_insert_anon ON public.locations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS locations_select_anon ON public.locations;
CREATE POLICY locations_select_anon ON public.locations
  FOR SELECT TO anon, authenticated USING (true);

-- ===== 3) Realtime 발행 활성화 =====
-- (이미 publication 에 있으면 에러 나므로 DO 블록으로 감쌈)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== 4) 오래된 위치 정리 (선택) =====
-- 24시간 지난 위치 레코드 자동 삭제는 Supabase Cron 또는 수동 실행.
-- DELETE FROM public.locations WHERE updated_at < now() - INTERVAL '24 hours';
