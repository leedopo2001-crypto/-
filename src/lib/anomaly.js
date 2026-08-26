// "위치도 안 바뀌고 폰도 전혀 안 움직인다"를 감지한다.
//
// 왜 둘 다 봐야 하는가
//   위치만 보면 지하철·실내·GPS 음영에서 계속 오탐한다. 흔들림만 보면
//   책상에 올려둔 폰과 쓰러진 폰을 구분 못 한다. 둘이 동시에 죽어 있을 때만
//   의심하면 오탐이 크게 줄어든다.
//
// 그래도 확신할 수는 없다 — 카페에 앉아 폰을 테이블에 두면 똑같이 보인다.
// 그래서 이 판정은 "바로 신고"가 아니라 "확인 질문"의 방아쇠로만 쓴다.

import { haversineKm } from './geo';

export const DEFAULT_ANOMALY = {
  enabled: false,
  windowMinutes: 10,
  maxMoveMeters: 30,
  maxShake: 4,
};

export const SENSITIVITY_PRESETS = [
  { key: 'low', label: '둔감', windowMinutes: 20, maxMoveMeters: 30, maxShake: 3 },
  { key: 'medium', label: '보통', windowMinutes: 10, maxMoveMeters: 30, maxShake: 4 },
  { key: 'high', label: '민감', windowMinutes: 5, maxMoveMeters: 50, maxShake: 6 },
];

/**
 * points       : [{ latitude, longitude, t }]  — 기록된 위치
 * shakeSamples : [{ t, index }]                — 흔들림 지수 표본 (위치보다 촘촘함)
 * config       : { windowMinutes, maxMoveMeters, maxShake }
 * nowMs        : 판정 기준 시각
 *
 * 반환: { still, reason, moveMeters?, maxShake? }
 *   still=true 는 "확인이 필요하다"는 뜻이지 "사고"라는 뜻이 아니다.
 */
export function checkStillness({ points, shakeSamples, config, nowMs }) {
  const windowMs = config.windowMinutes * 60_000;
  const from = nowMs - windowMs;

  const sorted = [...(points || [])].sort(
    (a, b) => new Date(a.t) - new Date(b.t),
  );
  const firstInWindow = sorted.findIndex((p) => new Date(p.t).getTime() >= from);

  if (firstInWindow === -1) {
    return { still: false, reason: 'not-enough-points' };
  }

  // 창 경계 바로 앞의 점을 기준점으로 같이 쓴다.
  //
  // 이게 없으면 전송 주기와 창 길이의 위상에 따라 판정이 오락가락한다.
  // 예를 들어 5분 주기 · 10분 창에서 마지막 위치가 1분 전이면 창 안에는
  // 1분·6분 전 두 점뿐이라 "6분치 근거"밖에 없다고 보고 판정을 거부하는데,
  // 실제로는 11분 전 점까지 있어서 근거는 충분하다.
  const anchorIndex = firstInWindow > 0 ? firstInWindow - 1 : -1;
  const hasAnchor = anchorIndex >= 0;

  const inWindow = sorted.slice(firstInWindow);
  const considered = hasAnchor ? sorted.slice(anchorIndex) : inWindow;

  if (considered.length < 2) {
    return { still: false, reason: 'not-enough-points' };
  }

  // 창 밖에 아무 기록도 없다면, 창을 채울 만큼 오래 켜져 있었는지 직접 본다.
  if (!hasAnchor) {
    const spanMs = nowMs - new Date(inWindow[0].t).getTime();
    if (spanMs < windowMs * 0.8) {
      return { still: false, reason: 'window-not-full' };
    }
  }

  const recentShakes = (shakeSamples || []).filter((s) => s.t >= from);
  // 흔들림 표본이 없으면 (센서 미지원 등) 위치만으로 단정하지 않는다.
  if (recentShakes.length === 0) {
    return { still: false, reason: 'no-shake-data' };
  }

  // 기준점을 포함해 재는 쪽이 보수적이다. 경계 직전에 움직인 흔적이 있으면
  // "아직 움직이는 중"으로 보고 확인 질문을 띄우지 않는다.
  const origin = considered[0];
  const moveMeters =
    Math.max(...considered.map((p) => haversineKm(origin, p))) * 1000;
  if (moveMeters > config.maxMoveMeters) {
    return { still: false, reason: 'moving', moveMeters };
  }

  const peakShake = Math.max(...recentShakes.map((s) => s.index));
  if (peakShake > config.maxShake) {
    return { still: false, reason: 'shaking', maxShake: peakShake };
  }

  return { still: true, reason: 'still', moveMeters, maxShake: peakShake };
}

/** 오래된 흔들림 표본을 잘라낸다. 메모리가 무한정 늘지 않게. */
export function pruneShakeSamples(samples, nowMs, keepMinutes = 30) {
  const from = nowMs - keepMinutes * 60_000;
  return samples.filter((s) => s.t >= from);
}
