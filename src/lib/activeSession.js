// 진행 중인 추적의 상태를 기기에 계속 저장한다.
//
// 왜 필요한가
//   추적 상태를 화면 안 메모리(useRef)에만 두면, 앱이 강제 종료되거나 OS 가
//   메모리를 회수하는 순간 두 가지가 동시에 사라진다.
//     1) owner_token — 이게 없으면 추적을 끝낼 수 없다. 공유 링크가 서버
//        정리(24시간) 전까지 계속 살아있게 된다.
//     2) 그때까지 쌓인 위치 — 기록이 통째로 증발한다.
//
//   그래서 위치를 하나 찍을 때마다 통째로 다시 저장한다. 세션 하나가 수백
//   점 규모라 JSON 직렬화 비용은 무시할 만하고, 대신 어느 시점에 죽어도
//   최대 한 점만 잃는다.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@here:active-session:v1';

/**
 * 저장 형태
 * {
 *   shortCode, ownerToken, url,
 *   userName, startedAt, intervalMinutes,
 *   points: [{ latitude, longitude, accuracy, t, shake, battery }],
 *   queue:  [ ...아직 서버로 못 보낸 point ]
 * }
 */
export async function loadActive() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.shortCode || !parsed?.ownerToken) return null;
    return {
      points: [],
      queue: [],
      ...parsed,
    };
  } catch {
    return null;
  }
}

export async function saveActive(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장 실패는 추적 자체를 막을 이유가 못 된다. 다음 위치에서 다시 시도된다.
  }
}

export async function clearActive() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
