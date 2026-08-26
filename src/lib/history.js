// 끝난 추적 세션을 기기에 보관한다 (AsyncStorage).
//
// 서버(Supabase)의 위치 데이터는 정리될 수 있지만, 이 기록은 내 폰에 남는다.
// 세션 하나 = 경로 점 전체 + 요약 통계. 점 하나가 ~80바이트라 1분 간격
// 3시간을 돌려도 세션당 15KB 수준이므로 30개 보관해도 부담이 없다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { pathStats } from './geo';

const KEY = '@here:history:v1';
const MAX_SESSIONS = 30;

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(sessions) {
  await AsyncStorage.setItem(KEY, JSON.stringify(sessions));
}

/** 최신순 목록. */
export async function listSessions() {
  return readAll();
}

/**
 * 세션 저장. points 로 통계를 계산해 함께 저장한다.
 * record: { shortCode, url, userName, startedAt, endedAt, intervalMinutes,
 *           points: [{ latitude, longitude, accuracy, t, shake }] }
 */
export async function saveSession(record) {
  const stats = pathStats(record.points || []);
  const session = {
    id: `${record.startedAt}-${record.shortCode || 'local'}`,
    ...record,
    stats,
  };
  const sessions = await readAll();
  sessions.unshift(session);
  await writeAll(sessions.slice(0, MAX_SESSIONS));
  return session;
}

export async function deleteSession(id) {
  const sessions = await readAll();
  await writeAll(sessions.filter((s) => s.id !== id));
}
