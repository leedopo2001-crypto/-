// 자동 체크인(데드맨 스위치) 상태를 기기에 보관한다.
//
// 앱이 닫혔다 열려도, 심지어 마감을 넘긴 뒤에 열려도 그 사실을 알 수 있어야
// 하므로 화면 상태가 아니라 저장소에 둔다.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@here:checkin:v1';

export const DURATION_PRESETS = [15, 30, 60, 120];

/**
 * { deadlineMs, label, startedAtMs, notificationIds: [] }
 */
export async function loadCheckIn() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number.isFinite(parsed?.deadlineMs) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveCheckIn(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export async function clearCheckIn() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

export function remainingMs(checkIn, nowMs = Date.now()) {
  if (!checkIn) return 0;
  return checkIn.deadlineMs - nowMs;
}

export function isExpired(checkIn, nowMs = Date.now()) {
  return Boolean(checkIn) && checkIn.deadlineMs <= nowMs;
}

export function formatRemaining(ms) {
  if (ms <= 0) return '시간 초과';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}시간 ${String(m).padStart(2, '0')}분`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
