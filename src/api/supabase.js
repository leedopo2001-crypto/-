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
export async function createSession({
  userName,
  intervalMinutes,
  identity,
}) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_create_session', {
    p_user_name: userName || null,
    p_interval_minutes: intervalMinutes ?? null,
    // 신원을 붙이면 연결된 사람들이 링크 없이도 이 세션을 찾을 수 있다.
    p_user_id: identity?.userId ?? null,
    p_owner_token: identity?.ownerToken ?? null,
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

/**
 * 위치 하나를 서버에 올린다.
 *
 * recordedAt 은 오프라인 큐 때문에 필요하다. 터널에서 못 보낸 위치를 나중에
 * 몰아서 올릴 때 실제 측정 시각을 같이 보내야 경로와 속도가 맞는다.
 */
export async function pushLocation({
  shortCode,
  ownerToken,
  latitude,
  longitude,
  accuracy,
  battery,
  shake,
  recordedAt,
}) {
  requireConfigured();

  const { error } = await supabase.rpc('here_push_location', {
    p_code: shortCode,
    p_owner_token: ownerToken,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy: accuracy ?? null,
    p_battery: Number.isFinite(battery) ? Math.round(battery) : null,
    p_shake: Number.isFinite(shake) ? Math.round(shake) : null,
    p_recorded_at: recordedAt ?? null,
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

// ===== 프로필과 연결 =====

export async function createProfile({ displayName, emoji } = {}) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_create_profile', {
    p_display_name: displayName || null,
    p_emoji: emoji || null,
  });
  if (error) throw error;

  const row = firstRow(data);
  if (!row?.user_id) throw new Error('프로필 생성에 실패했습니다.');
  return row;
}

export async function updateProfile(identity, { displayName, emoji } = {}) {
  requireConfigured();

  const { error } = await supabase.rpc('here_update_profile', {
    p_user_id: identity.userId,
    p_owner_token: identity.ownerToken,
    p_display_name: displayName ?? null,
    p_emoji: emoji ?? null,
  });
  if (error) throw error;
}

/** 초대 코드를 새로 만든다. 이전에 만든 미사용 코드는 서버에서 무효화된다. */
export async function createInvite(identity) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_create_invite', {
    p_user_id: identity.userId,
    p_owner_token: identity.ownerToken,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function acceptInvite(identity, code, relation) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_accept_invite', {
    p_user_id: identity.userId,
    p_owner_token: identity.ownerToken,
    p_code: code,
    p_relation: relation || null,
  });
  if (error) throw error;
  return firstRow(data);
}

/**
 * 연결된 사람들과 각자의 현재 공유 상태.
 * active_code 가 있으면 지금 위치를 공유 중이라는 뜻이고, 그 코드로
 * 기존 조회 함수를 그대로 쓰면 된다.
 */
export async function listLinks(identity) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_list_links', {
    p_user_id: identity.userId,
    p_owner_token: identity.ownerToken,
  });
  if (error) throw error;
  return data || [];
}

/** 워치독 알림을 밀어낼 웹훅 주소. 없으면 null. */
export async function getWebhook(identity) {
  requireConfigured();

  const { data, error } = await supabase.rpc('here_get_webhook', {
    p_user_id: identity.userId,
    p_owner_token: identity.ownerToken,
  });
  if (error) throw error;
  return firstRow(data) || null;
}

export async function setWebhook(identity, { url, enabled = true }) {
  requireConfigured();

  const { error } = await supabase.rpc('here_set_webhook', {
    p_user_id: identity.userId,
    p_owner_token: identity.ownerToken,
    p_webhook_url: url || null,
    p_enabled: enabled,
  });
  if (error) throw error;
}

export async function unlink(identity, otherUserId) {
  requireConfigured();

  const { error } = await supabase.rpc('here_unlink', {
    p_user_id: identity.userId,
    p_owner_token: identity.ownerToken,
    p_other_user_id: otherUserId,
  });
  if (error) throw error;
}
