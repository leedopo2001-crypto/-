import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const WEB_VIEWER_URL =
  process.env.EXPO_PUBLIC_WEB_VIEWER_URL || 'https://here-sos.vercel.app';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('your-project-ref'),
);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function buildTrackingUrl(shortCode) {
  return `${WEB_VIEWER_URL.replace(/\/$/, '')}/t/${shortCode}`;
}

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase가 아직 설정되지 않았습니다. .env 파일을 확인해주세요.');
  }
}

/** TABLE 을 반환하는 함수는 배열로 온다. */
function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

/**
 * 세션을 만든다.
 *
 * owner_token 은 이 기기에만 반환되고 공유 링크에는 들어가지 않는다.
 * 위치를 올리거나 추적을 끝내려면 이 토큰이 필요하므로, 링크를 받은 사람은
 * 남의 위치를 조작하거나 추적을 중단시킬 수 없다.
 */
export async function createSession({ userName }) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_create_session', {
    p_user_name: userName || null,
  });
  if (error) throw error;

  const row = firstRow(data);
  if (!row?.short_code) throw new Error('세션 생성에 실패했습니다.');

  return {
    shortCode: row.short_code,
    ownerToken: row.owner_token,
    url: buildTrackingUrl(row.short_code),
  };
}

export async function pushLocation({
  shortCode,
  ownerToken,
  latitude,
  longitude,
  accuracy,
}) {
  requireConfigured();

  const { error } = await supabase.rpc('here_push_location', {
    p_code: shortCode,
    p_owner_token: ownerToken,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy: accuracy ?? null,
  });
  if (error) throw error;
}

export async function endSession(shortCode, ownerToken) {
  requireConfigured();

  const { error } = await supabase.rpc('here_end_session', {
    p_code: shortCode,
    p_owner_token: ownerToken,
  });
  if (error) throw error;
}

/** 지켜보기용: 코드로 세션 정보 조회. 없으면 null. */
export async function getSession(shortCode) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_get_session', {
    p_code: shortCode,
  });
  if (error) throw error;
  return firstRow(data) || null;
}

/** 지켜보기용: 코드로 위치 목록 조회. since(ISO) 이후 것만 받을 수 있다. */
export async function getLocations(shortCode, since = null) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_get_locations', {
    p_code: shortCode,
    p_since: since,
  });
  if (error) throw error;
  return data || [];
}
