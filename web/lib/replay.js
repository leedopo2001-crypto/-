// 기록된 경로를 처음부터 다시 재생한다.
//
// 핵심은 진행률을 "점 개수"가 아니라 "누적 거리"에 매핑하는 것.
// points[floor(progress * n)] 방식으로 짜면 GPS 점이 촘촘한 곳(정지·체류)에서
// 마커가 기어가고 듬성한 곳(차량 이동)에서 순간이동한다. 데이터 밀도가 곧
// 재생 속도가 되기 때문이다. 누적 거리를 기준으로 잡으면 실제 이동 거리에
// 비례해 일정한 속도로 움직인다.
//
// 이 기법은 mahlernim/google-timeline-visualizer (MIT) 의 camera.ts
// worldPositionAtDistance 를 참고했다. web/lib/ATTRIBUTION.md 참고.

import { cumulativeDistances, interpolateGreatCircle } from '/lib/geo.js';
import { clamp } from '/lib/animation.js';

/** 좌표 배열을 재생 가능한 트랙으로 만든다 (누적 거리 미리 계산). */
export function buildTrack(points) {
  const cumulative = cumulativeDistances(points);
  return {
    points,
    cumulative,
    totalKm: cumulative.at(-1) ?? 0,
  };
}

/** 누적 거리 배열에서 target 이상인 첫 인덱스 (이진탐색). */
function lowerBound(values, target) {
  let low = 1;
  let high = values.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] >= target) high = mid;
    else low = mid + 1;
  }
  return low;
}

/**
 * 진행률(0~1) 에 해당하는 위치를 돌려준다.
 * segmentIndex 는 "이미 완전히 지나온" 마지막 점의 인덱스로, 꼬리 경로를
 * points.slice(0, segmentIndex + 1) 로 잘라 그릴 때 쓴다.
 */
export function positionAtProgress(track, progress) {
  const { points, cumulative, totalKm } = track;
  if (points.length === 0) return null;
  if (points.length === 1 || totalKm <= 0) {
    return { position: points[0], segmentIndex: 0, distanceKm: 0 };
  }

  const targetKm = clamp(progress) * totalKm;
  const to = lowerBound(cumulative, targetKm);
  const from = to - 1;
  const spanKm = cumulative[to] - cumulative[from];
  const fraction = spanKm <= 0 ? 0 : (targetKm - cumulative[from]) / spanKm;

  return {
    position: interpolateGreatCircle(points[from], points[to], fraction),
    segmentIndex: from,
    distanceKm: targetKm,
  };
}

/**
 * 재생을 시작한다. onFrame({ position, segmentIndex, distanceKm, progress }) 이
 * 매 프레임 호출된다. 반환한 함수를 부르면 중단된다.
 *
 * 재생은 실제 경과 시간(performance.now)을 기준으로 하므로, 프레임이 밀려도
 * 전체 길이는 durationMs 로 유지된다.
 */
export function startReplay({ track, durationMs, onFrame, onDone }) {
  let frame = null;
  let cancelled = false;
  const startedAt = performance.now();

  const step = (now) => {
    if (cancelled) return;
    const progress = durationMs <= 0 ? 1 : clamp((now - startedAt) / durationMs);
    const at = positionAtProgress(track, progress);
    if (at) onFrame({ ...at, progress });

    if (progress < 1) {
      frame = requestAnimationFrame(step);
    } else {
      frame = null;
      if (onDone) onDone();
    }
  };

  frame = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
