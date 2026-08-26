-- here 스키마 v4 — 서버 워치독
--
-- schema.sql → schema-v3-links.sql 을 실행한 뒤 이 파일을 Run 하세요.
-- 여러 번 실행해도 안전합니다.
--
-- ── 왜 필요한가 ───────────────────────────────────────────────
-- 지금까지 폰이 꺼지거나 부서지거나 방전되면 그냥 데이터가 끊겼다. 침묵이다.
-- 그런데 이 앱이 다루는 상황에서 폰이 멈추는 것은 침묵이 아니라 가장 강한
-- 신호다. 서버가 심장박동을 지켜보면, 폰이 아무것도 못 하는 상태에서도
-- 알릴 수 있다. 가해자가 폰을 끄는 행위가 오히려 알림을 앞당긴다.
--
-- ── 두 반쪽 ───────────────────────────────────────────────────
-- 1) 표시  : "지연됨" 판정을 조회할 때 서버가 계산해 돌려준다.
--            지금까지 앱과 웹 뷰어가 각자 계산해서 서로 다르게 말할 수 있었다.
--            확장 기능이 필요 없고, 설정할 것도 없다.
-- 2) 발송  : 아무도 화면을 안 보고 있을 때 밖으로 밀어낸다.
--            pg_cron 과 pg_net 이 필요하고, 웹훅 주소를 한 번 넣어야 한다.
--            이 부분은 없어도 1)은 그대로 동작한다.

-- ===== 1) 세션 상태 =====

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS alert_state TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ;

-- 알림이 실제로 발생한 기록. 같은 세션에 같은 알림을 반복해 보내지 않기 위한
-- 근거이자, 나중에 "그때 무슨 일이 있었나"를 되짚는 자료가 된다.
CREATE TABLE IF NOT EXISTS public.alerts (
  id BIGSERIAL PRIMARY KEY,
  session_code TEXT NOT NULL REFERENCES public.sessions(short_code) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS alerts_session_idx ON public.alerts (session_code, created_at DESC);

-- 사용자별 발송 설정. 웹훅 주소는 비밀에 가까우므로 테이블 접근은 막고
-- owner_token 을 아는 본인만 RPC 로 읽고 쓴다.
CREATE TABLE IF NOT EXISTS public.watchdog_config (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  webhook_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchdog_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alerts FROM anon, authenticated;
REVOKE ALL ON public.watchdog_config FROM anon, authenticated;

-- ===== 2) 지연 판정 =====
--
-- 약속한 주기의 2배에 2분을 더한 만큼 새 위치가 없으면 "지연"으로 본다.
-- 한 주기만 넘겨서 경고하면 GPS 취득이 조금 늦는 흔한 상황마다 울리고,
-- 그렇게 길들여진 경고는 정작 필요할 때 무시된다.
CREATE OR REPLACE FUNCTION public.here_overdue_after(p_interval_minutes SMALLINT)
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (COALESCE(p_interval_minutes, 5) * 2 + 2) * INTERVAL '1 minute';
$$;

-- ===== 3) 조회 함수에 지연 상태를 얹는다 =====

-- 이 파일이 만드는 함수들의 기존 정의를 이름으로 찾아 지운다. (설명은 schema.sql 참고)
DO $drop$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY['here_get_session'])
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $drop$;

CREATE FUNCTION public.here_get_session(p_code TEXT)
RETURNS TABLE (
  user_name TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  active BOOLEAN,
  interval_minutes SMALLINT,
  last_location_at TIMESTAMPTZ,
  last_battery SMALLINT,
  overdue BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_loc AS (
    SELECT l.updated_at, l.battery
      FROM public.locations l
     WHERE l.session_code = p_code
     ORDER BY l.updated_at DESC
     LIMIT 1
  )
  SELECT s.user_name,
         s.started_at,
         s.ended_at,
         s.active,
         s.interval_minutes,
         ll.updated_at,
         ll.battery,
         -- 종료된 세션은 늦는 게 아니라 끝난 것이다.
         s.active
           AND ll.updated_at IS NOT NULL
           AND now() - ll.updated_at > public.here_overdue_after(s.interval_minutes)
    FROM public.sessions s
    LEFT JOIN last_loc ll ON TRUE
   WHERE s.short_code = p_code;
$$;

-- 이 파일이 만드는 함수들의 기존 정의를 이름으로 찾아 지운다. (설명은 schema.sql 참고)
DO $drop$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY['here_list_links'])
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $drop$;

CREATE FUNCTION public.here_list_links(p_user_id UUID, p_owner_token UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  emoji TEXT,
  relation TEXT,
  linked_at TIMESTAMPTZ,
  active_code TEXT,
  active_started_at TIMESTAMPTZ,
  last_location_at TIMESTAMPTZ,
  last_battery SMALLINT,
  overdue BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.here_assert_owner(p_user_id, p_owner_token);

  RETURN QUERY
  WITH peers AS (
    SELECT CASE WHEN l.user_a = p_user_id THEN l.user_b ELSE l.user_a END AS peer,
           l.relation, l.created_at
      FROM public.links l
     WHERE l.user_a = p_user_id OR l.user_b = p_user_id
  ),
  latest AS (
    SELECT DISTINCT ON (s.owner_user_id)
           s.owner_user_id, s.short_code, s.started_at, s.interval_minutes
      FROM public.sessions s
     WHERE s.active AND s.owner_user_id IS NOT NULL
     ORDER BY s.owner_user_id, s.started_at DESC
  ),
  loc AS (
    SELECT DISTINCT ON (l.session_code)
           l.session_code, l.updated_at, l.battery
      FROM public.locations l
     WHERE l.session_code IN (SELECT la.short_code FROM latest la)
     ORDER BY l.session_code, l.updated_at DESC
  )
  SELECT pr.user_id,
         pr.display_name,
         pr.emoji,
         pe.relation,
         pe.created_at,
         la.short_code,
         la.started_at,
         lo.updated_at,
         lo.battery,
         la.short_code IS NOT NULL
           AND lo.updated_at IS NOT NULL
           AND now() - lo.updated_at > public.here_overdue_after(la.interval_minutes)
    FROM peers pe
    JOIN public.profiles pr ON pr.user_id = pe.peer
    LEFT JOIN latest la ON la.owner_user_id = pe.peer
    LEFT JOIN loc lo ON lo.session_code = la.short_code
   ORDER BY la.short_code IS NULL, pe.created_at;
END;
$$;

-- ===== 4) 발송 설정 =====

-- 이 파일이 만드는 함수들의 기존 정의를 이름으로 찾아 지운다. (설명은 schema.sql 참고)
DO $drop$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY['here_set_webhook', 'here_get_webhook'])
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $drop$;

CREATE FUNCTION public.here_set_webhook(
  p_user_id UUID,
  p_owner_token UUID,
  p_webhook_url TEXT,
  p_enabled BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.here_assert_owner(p_user_id, p_owner_token);

  IF p_webhook_url IS NOT NULL AND p_webhook_url <> ''
     AND p_webhook_url !~* '^https://' THEN
    RAISE EXCEPTION 'webhook must be https';
  END IF;

  INSERT INTO public.watchdog_config (user_id, webhook_url, enabled, updated_at)
  VALUES (p_user_id, nullif(btrim(coalesce(p_webhook_url, '')), ''), p_enabled, now())
  ON CONFLICT (user_id) DO UPDATE
    SET webhook_url = EXCLUDED.webhook_url,
        enabled = EXCLUDED.enabled,
        updated_at = now();
END;
$$;

CREATE FUNCTION public.here_get_webhook(p_user_id UUID, p_owner_token UUID)
RETURNS TABLE (webhook_url TEXT, enabled BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.here_assert_owner(p_user_id, p_owner_token);
  RETURN QUERY
    SELECT w.webhook_url, w.enabled
      FROM public.watchdog_config w
     WHERE w.user_id = p_user_id;
END;
$$;

-- ===== 5) 워치독 =====
--
-- 활성 세션 중 지연된 것을 찾아 알림을 한 번만 기록한다. 신호가 돌아오면
-- 상태를 되돌려, 다시 끊겼을 때 또 알릴 수 있게 한다.
CREATE OR REPLACE FUNCTION public.here_run_watchdog()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fired INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    WITH loc AS (
      SELECT DISTINCT ON (l.session_code)
             l.session_code, l.updated_at, l.battery, l.latitude, l.longitude
        FROM public.locations l
       ORDER BY l.session_code, l.updated_at DESC
    )
    SELECT s.short_code, s.user_name, s.interval_minutes,
           lo.updated_at AS last_at, lo.battery, lo.latitude, lo.longitude
      FROM public.sessions s
      JOIN loc lo ON lo.session_code = s.short_code
     WHERE s.active
       AND s.alert_state IS DISTINCT FROM 'overdue'
       AND now() - lo.updated_at > public.here_overdue_after(s.interval_minutes)
  LOOP
    INSERT INTO public.alerts (session_code, kind, detail)
    VALUES (rec.short_code, 'overdue', jsonb_build_object(
      'user_name', rec.user_name,
      'last_at', rec.last_at,
      'battery', rec.battery,
      'latitude', rec.latitude,
      'longitude', rec.longitude,
      'interval_minutes', rec.interval_minutes
    ));

    UPDATE public.sessions
       SET alert_state = 'overdue', alerted_at = now()
     WHERE short_code = rec.short_code;

    fired := fired + 1;
  END LOOP;

  -- 신호가 돌아온 세션은 상태를 푼다.
  UPDATE public.sessions s
     SET alert_state = NULL
   WHERE s.alert_state = 'overdue'
     AND EXISTS (
       SELECT 1 FROM public.locations l
        WHERE l.session_code = s.short_code
          AND now() - l.updated_at <= public.here_overdue_after(s.interval_minutes)
     );

  RETURN fired;
END;
$$;

/*
 * 아직 못 보낸 알림을 웹훅으로 밀어낸다.
 *
 * pg_net 이 없으면 아무 일도 하지 않는다. 그래도 alerts 테이블에는 남으므로
 * 앱을 열었을 때 확인할 수 있다. 발송은 어디까지나 덤이다.
 */
CREATE OR REPLACE FUNCTION public.here_deliver_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  sent INTEGER := 0;
  rec RECORD;
  body TEXT;
BEGIN
  IF to_regproc('net.http_post') IS NULL THEN
    RETURN 0;   -- pg_net 미설치. 조용히 넘어간다.
  END IF;

  FOR rec IN
    SELECT a.id, a.session_code, a.detail, w.webhook_url
      FROM public.alerts a
      JOIN public.sessions s ON s.short_code = a.session_code
      JOIN public.watchdog_config w ON w.user_id = s.owner_user_id
     WHERE NOT a.delivered
       AND w.enabled
       AND w.webhook_url IS NOT NULL
       AND a.created_at > now() - INTERVAL '1 hour'
     LIMIT 20
  LOOP
    body := format(
      '[here] %s님의 위치 신호가 끊겼습니다. 마지막 수신 %s, 배터리 %s%%. 마지막 위치: https://maps.google.com/?q=%s,%s',
      COALESCE(rec.detail->>'user_name', '사용자'),
      to_char((rec.detail->>'last_at')::timestamptz AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI'),
      COALESCE(rec.detail->>'battery', '?'),
      rec.detail->>'latitude',
      rec.detail->>'longitude'
    );

    -- text 는 Slack·Telegram, content 는 Discord 가 읽는다. 둘 다 넣어두면
    -- 대부분의 웹훅이 별도 변환 없이 그대로 받는다.
    PERFORM net.http_post(
      url := rec.webhook_url,
      body := jsonb_build_object('text', body, 'content', body),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );

    UPDATE public.alerts SET delivered = TRUE WHERE id = rec.id;
    sent := sent + 1;
  END LOOP;

  RETURN sent;
END;
$$;

REVOKE ALL ON FUNCTION public.here_run_watchdog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.here_deliver_alerts() FROM PUBLIC;

-- ===== 6) 권한 =====

GRANT EXECUTE ON FUNCTION public.here_get_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_list_links(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_set_webhook(UUID, UUID, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_get_webhook(UUID, UUID) TO anon, authenticated;

-- ===== 7) 1분마다 실행 =====
--
-- pg_cron 이 켜져 있으면 자동으로 등록한다. 없으면 이 블록은 건너뛰고,
-- Dashboard → Database → Extensions 에서 pg_cron 을 켠 뒤 이 파일을 다시
-- 실행하면 그때 등록된다.
DO $$
BEGIN
  IF to_regproc('cron.schedule') IS NULL THEN
    RAISE NOTICE 'pg_cron 이 없어 자동 실행을 등록하지 않았습니다. 지연 "표시"는 그대로 동작합니다.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid)
    FROM cron.job WHERE jobname IN ('here-watchdog', 'here-deliver');

  PERFORM cron.schedule('here-watchdog', '* * * * *',
                        'SELECT public.here_run_watchdog()');
  PERFORM cron.schedule('here-deliver', '* * * * *',
                        'SELECT public.here_deliver_alerts()');
  RAISE NOTICE '워치독을 1분마다 실행하도록 등록했습니다.';
END $$;
