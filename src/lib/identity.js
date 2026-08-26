// 이 기기의 신원.
//
// 가입도 비밀번호도 없다. 앱을 처음 켤 때 서버에서 (user_id, owner_token)
// 한 쌍을 받아 기기에 저장하는 것이 곧 계정이다. 안전 앱에서 가입 절차는
// 그 자체로 이탈 요인이고, 우리가 이메일이나 비밀번호로 할 일도 없다.
//
//   user_id     — 공개 식별자. 연결된 상대에게 보인다.
//   owner_token — 비밀. 이 기기만 가진다. 모든 쓰기에 필요하다.
//
// 한계: 기기를 바꾸거나 앱을 지우면 신원이 사라지고 연결도 끊긴다.
// 계정 이전을 지원하려면 별도의 복구 수단이 필요한데, 지금은 그 복잡도를
// 지지 않고 "연결을 다시 맺는다"로 처리한다.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { createProfile, isSupabaseConfigured } from '../api/supabase';

const KEY = '@here:identity:v1';

let cached = null;

export async function loadIdentity() {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.userId || !parsed?.ownerToken) return null;
    cached = parsed;
    return cached;
  } catch {
    return null;
  }
}

async function persist(identity) {
  cached = identity;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(identity));
  } catch {}
  return identity;
}

/**
 * 신원을 확보한다. 이미 있으면 그대로, 없으면 서버에 만들어 저장한다.
 * Supabase 가 설정되지 않았거나 통신에 실패하면 null 을 돌려주고,
 * 호출부는 연결 기능만 비활성화한 채 나머지를 그대로 쓴다.
 */
export async function ensureIdentity({ displayName, emoji } = {}) {
  const existing = await loadIdentity();
  if (existing) return existing;
  if (!isSupabaseConfigured) return null;

  try {
    const created = await createProfile({ displayName, emoji });
    return persist({
      userId: created.user_id,
      ownerToken: created.owner_token,
    });
  } catch {
    return null;
  }
}

/** 로컬에 캐시된 표시 이름/이모지를 갱신한다 (서버 반영은 호출부에서). */
export async function updateLocalIdentity(patch) {
  const current = (await loadIdentity()) || {};
  return persist({ ...current, ...patch });
}

export async function clearIdentity() {
  cached = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
