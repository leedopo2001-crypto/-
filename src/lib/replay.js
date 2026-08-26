// 기록된 경로를 앱 안에서 되돌려 본다.
//
// 웹 뷰어(web/lib/replay.js)와 같은 방식이다. 핵심은 진행률을 "점 번호"가
// 아니라 "누적 거리"에 매핑하는 것. 점 번호로 재생하면 술집에 앉아 있던
// 구간(점이 몰려 있음)에서 재생이 기어가고, 택시 구간(점이 듬성함)에서
// 순간이동한다. 데이터 밀도가 곧 재생 속도가 돼버린다.
//
// web/lib/replay.js 를 그대로 import 하지 않는 이유: 그쪽은 브라우저 전용
// 경로(/lib/...)로 import 하고 requestAnimationFrame 을 직접 쓴다.

import { cumulativeDistances, interpolate } from './geo';

export function buildTrack(points) {
  const cumulative = cumulativeDistances(points);
  return { points, cumulative, totalKm: cumulative.at(-1) ?? 0 };
}

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
 * 진행률(0~1) 위치.
 * segmentIndex 는 "이미 완전히 지나온" 마지막 점의 인덱스로,
 * points.slice(0, segmentIndex + 1) 이 지나온 경로가 된다.
 */
export function positionAtProgress(track, progress) {
  const { points, cumulative, totalKm } = track;
  if (!points || points.length === 0) return null;
  if (points.length === 1 || totalKm <= 0) {
    return { position: points[0], segmentIndex: 0, distanceKm: 0 };
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const targetKm = clamped * totalKm;
  const to = lowerBound(cumulative, targetKm);
  const from = to - 1;
  const spanKm = cumulative[to] - cumulative[from];
  const fraction = spanKm <= 0 ? 0 : (targetKm - cumulative[from]) / spanKm;

  return {
    position: interpolate(points[from], points[to], fraction),
    segmentIndex: from,
    distanceKm: targetKm,
  };
}
