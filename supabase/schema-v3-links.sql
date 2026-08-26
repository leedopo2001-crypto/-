-- here 스키마 v3 — 프로필과 사람 연결
--
-- schema.sql 을 먼저 실행한 뒤, 이 파일을 SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
--
-- ── 왜 필요한가 ───────────────────────────────────────────────
-- v2 까지는 추적할 때마다 새 링크를 만들어 문자로 보내야 했다. 정작 위험한
-- 순간에 문자를 보낼 수 있는 사람은 많지 않다. 미리 연결해 두면, 추적을
-- 시작하는 순간 상대 앱에 바로 뜬다.
--
-- ── 신원 모델 ─────────────────────────────────────────────────
-- 가입도 비밀번호도 없다. 앱을 처음 켤 때 (user_id, owner_token) 한 쌍을
-- 발급받아 기기에 저장하는 것이 곧 계정이다. 안전 앱에서 가입 절차는
-- 그 자체로 이탈 요인이고, 우리가 이메일이나 비밀번호로 할 일도 없다.
--   * user_id     : 공개 식별자. 연결된 상대에게 보인다.
--   * owner_token : 비밀. 오직 그 기기만 가진다. 모든 쓰기에 필요하다.
--
-- ── 연결은 상호적이다 ─────────────────────────────────────────
-- 연결을 수락하면 서로의 공유를 볼 수 있다. 한쪽만 보는 구조는 감시에
-- 가까워지고, 가족·연인 관계에서 비대칭은 오히려 불신을 만든다.
-- 앱 화면에서도 이 점을 수락 전에 명시한다.

-- ===== 1) 테이블 =====

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_token UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name TEXT,
  emoji TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invites (
  code TEXT PRIMARY KEY,
  from_user UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS invites_from_user_idx ON public.invites (from_user);

-- 같은 쌍이 두 줄로 생기지 않도록 (작은 uuid, 큰 uuid) 순서로 정규화해 저장한다.
CREATE TABLE IF NOT EXISTS public.links (
  user_a UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  relation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CONSTRAINT links_ordered CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS links_user_b_idx ON public.links (user_b);

-- 세션의 주인. v2 세션은 NULL 로 남아 그대로 동작한다.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sessions_owner_active_idx
  ON public.sessions (owner_user_id, active);

-- ===== 2) 잠그기 =====

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.invites  FROM anon, authenticated;
REVOKE ALL ON public.links    FROM anon, authenticated;

-- ===== 3) 함수 =====

DROP FUNCTION IF EXISTS public.here_create_profile(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.here_update_profile(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.here_create_invite(UUID, UUID);
DROP FUNCTION IF EXISTS public.here_accept_invite(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.here_list_links(UUID, UUID);
DROP FUNCTION IF EXISTS public.here_unlink(UUID, UUID, UUID);

/* 호출자가 정말 그 기기인지 확인한다. 모든 쓰기의 첫 줄. */
CREATE OR REPLACE FUNCTION public.here_assert_owner(p_user_id UUID, p_owner_token UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.profiles
   WHERE user_id = p_user_id AND owner_token = p_owner_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found or token mismatch';
  END IF;

  UPDATE public.profiles SET last_seen_at = now() WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.here_assert_owner(UUID, UUID) FROM PUBLIC;

/* 앱 첫 실행. 기기가 이 한 쌍을 저장하면 그게 계정이다. */
CREATE FUNCTION public.here_create_profile(
  p_display_name TEXT DEFAULT NULL,
  p_emoji TEXT DEFAULT NULL
)
RETURNS TABLE (user_id UUID, owner_token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_display_name IS NOT NULL AND length(p_display_name) > 40 THEN
    RAISE EXCEPTION 'display_name too long';
  END IF;

  RETURN QUERY
    INSERT INTO public.profiles (display_name, emoji)
    VALUES (nullif(btrim(coalesce(p_display_name, '')), ''),
            nullif(btrim(coalesce(p_emoji, '')), ''))
    RETURNING profiles.user_id, profiles.owner_token;
END;
$$;

CREATE FUNCTION public.here_update_profile(
  p_user_id UUID,
  p_owner_token UUID,
  p_display_name TEXT DEFAULT NULL,
  p_emoji TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.here_assert_owner(p_user_id, p_owner_token);
  IF p_display_name IS NOT NULL AND length(p_display_name) > 40 THEN
    RAISE EXCEPTION 'display_name too long';
  END IF;

  UPDATE public.profiles
     SET display_name = COALESCE(nullif(btrim(coalesce(p_display_name, '')), ''), display_name),
         emoji        = COALESCE(nullif(btrim(coalesce(p_emoji, '')), ''), emoji)
   WHERE user_id = p_user_id;
END;
$$;

/* 초대 코드. 10분만 유효하고, 새로 만들면 이전 미사용 코드는 즉시 무효화한다. */
CREATE FUNCTION public.here_create_invite(p_user_id UUID, p_owner_token UUID)
RETURNS TABLE (code TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  PERFORM public.here_assert_owner(p_user_id, p_owner_token);

  -- 코드가 여러 개 살아 있으면 어느 것이 유효한지 사용자가 알 수 없다.
  DELETE FROM public.invites WHERE from_user = p_user_id AND used_by IS NULL;

  FOR _ IN 1..10 LOOP
    candidate := upper(substr(public.here_generate_code(), 1, 6));
    BEGIN
      RETURN QUERY
        INSERT INTO public.invites (code, from_user, expires_at)
        VALUES (candidate, p_user_id, now() + INTERVAL '10 minutes')
        RETURNING invites.code, invites.expires_at;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- 겹쳤다. 다시 뽑는다.
    END;
  END LOOP;

  RAISE EXCEPTION 'could not allocate an invite code';
END;
$$;

/* 코드를 입력해 연결한다. 연결은 상호적이다. */
CREATE FUNCTION public.here_accept_invite(
  p_user_id UUID,
  p_owner_token UUID,
  p_code TEXT,
  p_relation TEXT DEFAULT NULL
)
RETURNS TABLE (user_id UUID, display_name TEXT, emoji TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter UUID;
  lo UUID;
  hi UUID;
BEGIN
  PERFORM public.here_assert_owner(p_user_id, p_owner_token);

  SELECT i.from_user INTO inviter
    FROM public.invites i
   WHERE i.code = upper(btrim(p_code))
     AND i.used_by IS NULL
     AND i.expires_at > now();

  IF inviter IS NULL THEN
    RAISE EXCEPTION 'invite code is invalid or expired';
  END IF;
  IF inviter = p_user_id THEN
    RAISE EXCEPTION 'cannot link to yourself';
  END IF;

  lo := LEAST(inviter, p_user_id);
  hi := GREATEST(inviter, p_user_id);

  INSERT INTO public.links (user_a, user_b, relation)
  VALUES (lo, hi, nullif(btrim(coalesce(p_relation, '')), ''))
  ON CONFLICT (user_a, user_b)
  DO UPDATE SET relation = COALESCE(EXCLUDED.relation, public.links.relation);

  UPDATE public.invites
     SET used_by = p_user_id, used_at = now()
   WHERE invites.code = upper(btrim(p_code));

  RETURN QUERY
    SELECT pr.user_id, pr.display_name, pr.emoji
      FROM public.profiles pr
     WHERE pr.user_id = inviter;
END;
$$;

/*
 * 연결된 사람들과, 각자 지금 공유 중인 세션.
 *
 * active_code 가 있으면 상대가 지금 위치를 공유하고 있다는 뜻이고,
 * 그 코드로 기존 조회 함수를 그대로 쓰면 된다. 이 한 번의 호출이
 * "링크를 문자로 주고받는" 절차를 통째로 없앤다.
 */
CREATE FUNCTION public.here_list_links(p_user_id UUID, p_owner_token UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  emoji TEXT,
  relation TEXT,
  linked_at TIMESTAMPTZ,
  active_code TEXT,
  active_started_at TIMESTAMPTZ,
  last_location_at TIMESTAMPTZ
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
           s.owner_user_id, s.short_code, s.started_at
      FROM public.sessions s
     WHERE s.active AND s.owner_user_id IS NOT NULL
     ORDER BY s.owner_user_id, s.started_at DESC
  )
  SELECT pr.user_id,
         pr.display_name,
         pr.emoji,
         pe.relation,
         pe.created_at,
         la.short_code,
         la.started_at,
         (SELECT max(lo.updated_at) FROM public.locations lo
           WHERE lo.session_code = la.short_code)
    FROM peers pe
    JOIN public.profiles pr ON pr.user_id = pe.peer
    LEFT JOIN latest la ON la.owner_user_id = pe.peer
   ORDER BY la.short_code IS NULL, pe.created_at;
END;
$$;

/* 연결 해제. 어느 쪽에서 끊어도 양쪽 다 끊긴다. */
CREATE FUNCTION public.here_unlink(
  p_user_id UUID,
  p_owner_token UUID,
  p_other_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.here_assert_owner(p_user_id, p_owner_token);

  DELETE FROM public.links
   WHERE (user_a = LEAST(p_user_id, p_other_user_id)
          AND user_b = GREATEST(p_user_id, p_other_user_id));
END;
$$;

-- ===== 4) 세션에 주인을 붙인다 =====
-- v2 시그니처를 대체한다. p_user_id 를 주면 그 사람의 세션으로 기록되어
-- 연결된 사람들이 코드 없이도 찾을 수 있다.

DROP FUNCTION IF EXISTS public.here_create_session(TEXT, SMALLINT);
DROP FUNCTION IF EXISTS public.here_create_session(TEXT, SMALLINT, UUID, UUID);

CREATE FUNCTION public.here_create_session(
  p_user_name TEXT DEFAULT NULL,
  p_interval_minutes SMALLINT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_owner_token UUID DEFAULT NULL
)
RETURNS TABLE (short_code TEXT, owner_token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
  owner UUID := NULL;
BEGIN
  IF p_user_name IS NOT NULL AND length(p_user_name) > 40 THEN
    RAISE EXCEPTION 'user_name too long';
  END IF;

  -- 프로필을 주장했다면 반드시 증명해야 한다. 아니면 남의 이름으로 세션을
  -- 만들어 그 사람의 연결 목록에 끼어들 수 있다.
  IF p_user_id IS NOT NULL THEN
    PERFORM public.here_assert_owner(p_user_id, p_owner_token);
    owner := p_user_id;
  END IF;

  FOR _ IN 1..10 LOOP
    candidate := public.here_generate_code();
    BEGIN
      RETURN QUERY
        INSERT INTO public.sessions
          (short_code, user_name, interval_minutes, owner_user_id)
        VALUES (candidate,
                nullif(btrim(coalesce(p_user_name, '')), ''),
                p_interval_minutes,
                owner)
        RETURNING sessions.short_code, sessions.owner_token;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- 코드가 겹쳤다. 다시 뽑는다.
    END;
  END LOOP;

  RAISE EXCEPTION 'could not allocate a unique short code';
END;
$$;

-- ===== 5) 권한 =====

GRANT EXECUTE ON FUNCTION public.here_create_profile(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_update_profile(UUID, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_create_invite(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_accept_invite(UUID, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_list_links(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_unlink(UUID, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.here_create_session(TEXT, SMALLINT, UUID, UUID) TO anon, authenticated;

-- ===== 6) 정리 =====
-- 만료된 초대는 쌓일 이유가 없다. schema.sql 의 here_purge_old 와 함께 돌리면 된다.
CREATE OR REPLACE FUNCTION public.here_purge_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.invites WHERE expires_at < now() - INTERVAL '1 day';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.here_purge_invites() FROM PUBLIC;
