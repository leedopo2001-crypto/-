-- here 실시간 위치 공유용 스키마 (v2)
-- Supabase Dashboard → SQL Editor 에 붙여넣고 "Run" 실행.
--
-- 이 스크립트는 몇 번을 다시 실행해도 안전하다. 새 프로젝트에도, v1 이
-- 이미 깔린 프로젝트에도 그대로 붙여넣으면 된다.
--
-- 보안 모델
--   anon 키는 웹페이지에 그대로 노출된다. 따라서 anon 에게 테이블 직접 접근을
--   전혀 주지 않고, 모든 동작을 SECURITY DEFINER 함수로만 열어둔다.
--
--   * 읽기   : short_code 를 알아야만 가능 (링크를 받은 사람)
--   * 쓰기   : owner_token 까지 알아야 가능 (추적 중인 본인 기기만)
--
--   owner_token 은 세션을 만든 기기에만 반환되고 링크에는 포함되지 않는다.
--   그래서 링크를 받은 사람이 남의 위치를 조작하거나 추적을 끝낼 수 없다.
--
-- v2 에서 추가된 것
--   locations.battery  : 그 시점 배터리 %(0~100). 추적이 멈췄을 때
--                        방전 때문인지 사고인지 구분하는 단서가 된다.
--   locations.shake    : 흔들림 지수. 위치가 안 변해도 움직이는 중인지 알 수 있다.
--   sessions.interval_minutes : 예상 전송 주기. 보는 쪽이 "지금 신호가 늦은
--                        것인가"를 판단하려면 기준 간격을 알아야 한다.

-- ===== 1) 테이블 =====

CREATE TABLE IF NOT EXISTS public.sessions (
  short_code TEXT PRIMARY KEY,
  owner_token UUID NOT NULL DEFAULT gen_random_uuid(),
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

-- v1 이 이미 깔린 프로젝트를 위한 컬럼 추가 (새 설치에는 아무 영향 없음)
ALTER TABLE public.sessions  ADD COLUMN IF NOT EXISTS interval_minutes SMALLINT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS battery SMALLINT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS shake SMALLINT;

CREATE INDEX IF NOT EXISTS locations_session_code_updated_at_idx
  ON public.locations (session_code, updated_at);

-- ===== 2) 잠그기 =====
-- RLS 를 켜고 정책을 하나도 만들지 않는다. 정책이 없으면 anon 은 아무것도 못 한다.
-- 아래 함수들만 SECURITY DEFINER 로 우회한다.

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- 이전 버전에서 만들었을 수 있는 개방형 정책 제거
DROP POLICY IF EXISTS sessions_insert_anon ON public.sessions;
DROP POLICY IF EXISTS sessions_select_anon ON public.sessions;
DROP POLICY IF EXISTS sessions_update_anon ON public.sessions;
DROP POLICY IF EXISTS locations_insert_anon ON public.locations;
DROP POLICY IF EXISTS locations_select_anon ON public.locations;

REVOKE ALL ON public.sessions FROM anon, authenticated;
REVOKE ALL ON public.locations FROM anon, authenticated;

-- ===== 3) 함수 =====
--
-- 인자나 반환 타입이 바뀐 함수는 CREATE OR REPLACE 로 못 고친다. 그냥 두면
-- v1 시그니처가 오버로드로 남아 호출이 모호해지므로, 먼저 확실히 지운다.

-- 이 파일이 새로 만드는 함수들의 기존 정의를 이름으로 찾아 모두 지운다.
--
-- 예전에는 시그니처를 손으로 나열했는데, 인자가 하나 늘어나면 목록에서
-- 빠뜨리기 쉽고 그러면 두 번째 실행이 "already exists" 로 막힌다.
-- 실제로 here_push_location 에 p_recorded_at 을 추가했을 때 그렇게 됐다.
-- 이름으로 찾아 지우면 시그니처가 어떻게 바뀌어도 어긋나지 않는다.
--
-- 대신 이름으로 지우니 뒤 파일이 덮어쓴 정의까지 같이 없어진다. 예를 들어
-- here_create_session 은 v3 에서 인자 4개짜리로 바뀌는데, 이 파일을 다시
-- 돌리면 그게 2개짜리로 되돌아간다. 그래서 이 파일을 다시 실행할 때는
-- v3, v4 도 순서대로 같이 실행해야 한다.
DO $drop$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY['here_create_session', 'here_push_location', 'here_get_session', 'here_get_locations'])
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $drop$;

-- 헷갈리는 글자(0/o, 1/l, i)를 뺀 알파벳으로 8자리 코드를 만든다.
-- 31^8 ≈ 8.5e11 이라 추측으로 남의 세션을 찾기는 사실상 불가능하다.
CREATE OR REPLACE FUNCTION public.here_generate_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
  result TEXT := '';
BEGIN
  FOR _ IN 1..8 LOOP
    result := result || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 세션 생성. short_code 와 owner_token 을 함께 돌려준다.
CREATE FUNCTION public.here_create_session(
  p_user_name TEXT DEFAULT NULL,
  p_interval_minutes SMALLINT DEFAULT NULL
)
RETURNS TABLE (short_code TEXT, owner_token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  IF p_user_name IS NOT NULL AND length(p_user_name) > 40 THEN
    RAISE EXCEPTION 'user_name too long';
  END IF;

  FOR _ IN 1..10 LOOP
    candidate := public.here_generate_code();
    BEGIN
      RETURN QUERY
        INSERT INTO public.sessions (short_code, user_name, interval_minutes)
        VALUES (
          candidate,
          nullif(btrim(coalesce(p_user_name, '')), ''),
          p_interval_minutes
        )
        RETURNING sessions.short_code, sessions.owner_token;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- 코드가 겹쳤다. 다시 뽑는다.
    END;
  END LOOP;

  RAISE EXCEPTION 'could not allocate a unique short code';
END;
$$;

-- 위치 추가. owner_token 이 맞아야 하고, 이미 종료된 세션에는 쓸 수 없다.
--
-- p_recorded_at 은 오프라인 큐 때문에 필요하다. 터널에서 못 보낸 위치를
-- 나중에 몰아서 올릴 때, 서버 도착 시각이 아니라 실제로 측정한 시각이
-- 남아야 경로와 속도가 맞는다. 비워두면 지금 시각을 쓴다.
CREATE FUNCTION public.here_push_location(
  p_code TEXT,
  p_owner_token UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_accuracy DOUBLE PRECISION DEFAULT NULL,
  p_battery SMALLINT DEFAULT NULL,
  p_shake SMALLINT DEFAULT NULL,
  p_recorded_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_owner BOOLEAN;
BEGIN
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude < -90 OR p_latitude > 90
     OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'invalid coordinates';
  END IF;

  SELECT TRUE INTO is_owner
  FROM public.sessions
  WHERE sessions.short_code = p_code
    AND sessions.owner_token = p_owner_token
    AND sessions.active;

  IF is_owner IS NULL THEN
    RAISE EXCEPTION 'session not found, already ended, or token mismatch';
  END IF;

  INSERT INTO public.locations
    (session_code, latitude, longitude, accuracy, battery, shake, updated_at)
  VALUES (
    p_code, p_latitude, p_longitude, p_accuracy,
    -- 값이 이상하면 저장하지 않는다. 통계가 조용히 망가지는 것보다 낫다.
    CASE WHEN p_battery BETWEEN 0 AND 100 THEN p_battery END,
    CASE WHEN p_shake >= 0 THEN p_shake END,
    -- 미래 시각이나 30일보다 오래된 시각은 신뢰하지 않는다.
    CASE
      WHEN p_recorded_at IS NULL THEN now()
      WHEN p_recorded_at > now() + INTERVAL '5 minutes' THEN now()
      WHEN p_recorded_at < now() - INTERVAL '30 days' THEN now()
      ELSE p_recorded_at
    END
  );
END;
$$;

-- 추적 종료. 본인만 가능.
CREATE OR REPLACE FUNCTION public.here_end_session(p_code TEXT, p_owner_token UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET active = FALSE, ended_at = now()
  WHERE short_code = p_code AND owner_token = p_owner_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or token mismatch';
  END IF;
END;
$$;

-- 링크를 받은 사람이 보는 세션 정보. owner_token 은 절대 내보내지 않는다.
CREATE FUNCTION public.here_get_session(p_code TEXT)
RETURNS TABLE (
  user_name TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  active BOOLEAN,
  interval_minutes SMALLINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_name, s.started_at, s.ended_at, s.active, s.interval_minutes
  FROM public.sessions s
  WHERE s.short_code = p_code;
$$;

-- 위치 목록. p_since 이후 것만 받아오면 폴링이 가벼워진다.
CREATE FUNCTION public.here_get_locations(
  p_code TEXT,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  battery SMALLINT,
  shake SMALLINT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.latitude, l.longitude, l.accuracy, l.battery, l.shake, l.updated_at
  FROM public.locations l
  WHERE l.session_code = p_code
    AND (p_since IS NULL OR l.updated_at > p_since)
  ORDER BY l.updated_at
  LIMIT 1000;
$$;

-- ===== 4) 권한 =====
-- anon 은 이 함수들만 실행할 수 있다. 테이블에는 손댈 수 없다.

REVOKE ALL ON FUNCTION public.here_generate_code() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.here_create_session(TEXT, SMALLINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_push_location(TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, SMALLINT, SMALLINT, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_end_session(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_get_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_get_locations(TEXT, TIMESTAMPTZ) TO anon, authenticated;

-- ===== 5) 오래된 데이터 정리 (선택) =====
-- 24시간 지난 세션과 위치를 지운다. Dashboard → Integrations → Cron 에 걸어두거나
-- 가끔 수동으로 실행하면 된다.
CREATE OR REPLACE FUNCTION public.here_purge_old(p_older_than INTERVAL DEFAULT '24 hours')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.sessions
  WHERE started_at < now() - p_older_than;   -- locations 는 ON DELETE CASCADE 로 함께 삭제
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.here_purge_old(INTERVAL) FROM PUBLIC;
