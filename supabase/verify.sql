-- 설치 상태 점검
--
-- schema.sql → schema-v3-links.sql → schema-v4-watchdog.sql 을 모두 실행한 뒤
-- 이 파일을 SQL Editor 에 붙여넣고 Run 하세요. 무엇이 되고 무엇이 빠졌는지
-- 한눈에 나옵니다.

SELECT
  '함수' AS 항목,
  count(*)::text || ' / 20' AS 결과,
  CASE WHEN count(*) = 20 THEN 'OK'
       ELSE '부족 — 아래 목록에서 빠진 것을 확인하세요' END AS 상태
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'here\_%'

UNION ALL SELECT
  '테이블',
  count(*)::text || ' / 5',
  CASE WHEN count(*) = 5 THEN 'OK' ELSE 'schema 파일을 다시 실행하세요' END
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('sessions', 'locations', 'profiles', 'invites', 'links')

UNION ALL SELECT
  '워치독 테이블',
  count(*)::text || ' / 2',
  CASE WHEN count(*) = 2 THEN 'OK' ELSE 'v4 파일을 실행하세요' END
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('alerts', 'watchdog_config')

UNION ALL SELECT
  'RLS 잠금',
  count(*)::text || ' / 7',
  CASE WHEN count(*) = 7 THEN 'OK — 테이블 직접 접근이 막혀 있습니다'
       ELSE '일부 테이블의 RLS 가 꺼져 있습니다' END
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity
  AND tablename IN ('sessions','locations','profiles','invites','links','alerts','watchdog_config')

UNION ALL SELECT
  'pg_cron (선택)',
  CASE WHEN to_regproc('cron.schedule') IS NULL THEN '없음' ELSE '있음' END,
  CASE WHEN to_regproc('cron.schedule') IS NULL
       THEN '없어도 됩니다 — 신호 끊김 "표시" 는 동작. 자동 발송을 원하면 Extensions 에서 켜세요'
       ELSE 'OK' END

UNION ALL SELECT
  'pg_net (선택)',
  CASE WHEN to_regproc('net.http_post') IS NULL THEN '없음' ELSE '있음' END,
  CASE WHEN to_regproc('net.http_post') IS NULL
       THEN '없어도 됩니다 — 웹훅 발송만 안 됩니다'
       ELSE 'OK' END;

-- 빠진 함수가 있으면 여기서 드러납니다 (20개 전부 나와야 정상)
SELECT p.proname AS 함수
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'here\_%'
ORDER BY p.proname;
