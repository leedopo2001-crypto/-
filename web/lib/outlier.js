// Adapted from mahlernim/google-timeline-visualizer (MIT License, (c) 2025 mahlernim)
// https://github.com/mahlernim/google-timeline-visualizer — see web/lib/ATTRIBUTION.md
//
// 원본은 Google Timeline 내보내기(수 개월치, 항공편 포함)를 대상으로 하기 때문에
// 500km 도약 / 1300km/h 같은 상수를 쓴다. 여기서는 1~15분 간격의 실시간 추적을
// 대상으로 하므로 임계값을 지상 이동 규모로 다시 맞췄고, GPS accuracy 게이트를 추가했다.

import { haversineKm } from '/lib/geo.js';

/** 이 값보다 오차 반경이 큰 GPS 신호는 신뢰하지 않는다 (미터). */
export const DEFAULT_ACCURACY_LIMIT_M = 100;

const MAX_OUTLIER_RUN_POINTS = 2;
const MIN_OUTLIER_HOP_KM = 1;
const MAX_REJOIN_DISTANCE_KM = 5;
const MAX_OUTLIER_CLUSTER_SPAN_KM = 5;
const MAX_PLAUSIBLE_SPEED_KMH = 400;
const MAX_EXCURSION_MS = 2 * 60 * 60 * 1000;

function speedKmPerHour(from, to, distanceKm) {
  const millis = to.instant.getTime() - from.instant.getTime();
  if (millis <= 0) return Number.POSITIVE_INFINITY;
  return distanceKm / (millis / 3_600_000);
}

/**
 * before → (points[start..end]) → after 구간이 "멀리 튀었다가 제자리로 돌아온"
 * 모양인지 판단한다. 실제 이동은 순간이동 후 복귀를 하지 않으므로,
 * 이 패턴이면 가운데 점들은 GPS 오류로 본다.
 */
function isSuspiciousExcursion(before, points, start, end, after) {
  const windowMs = after.instant.getTime() - before.instant.getTime();
  if (windowMs < 0 || windowMs > MAX_EXCURSION_MS) return false;
  if (haversineKm(before, after) > MAX_REJOIN_DISTANCE_KM) return false;

  const first = points[start];
  const last = points[end];
  const ingressKm = haversineKm(before, first);
  const egressKm = haversineKm(last, after);
  if (ingressKm < MIN_OUTLIER_HOP_KM || egressKm < MIN_OUTLIER_HOP_KM) return false;
  if (speedKmPerHour(before, first, ingressKm) <= MAX_PLAUSIBLE_SPEED_KMH) return false;
  if (speedKmPerHour(last, after, egressKm) <= MAX_PLAUSIBLE_SPEED_KMH) return false;

  for (let i = start; i <= end; i += 1) {
    const candidate = points[i];
    if (haversineKm(first, candidate) > MAX_OUTLIER_CLUSTER_SPAN_KM) return false;
    if (
      haversineKm(before, candidate) < MIN_OUTLIER_HOP_KM ||
      haversineKm(candidate, after) < MIN_OUTLIER_HOP_KM
    ) return false;
  }
  return true;
}

function suspiciousRunEnd(points, before, start) {
  const latestEnd = Math.min(start + MAX_OUTLIER_RUN_POINTS - 1, points.length - 2);
  for (let end = latestEnd; end >= start; end -= 1) {
    if (isSuspiciousExcursion(before, points, start, end, points[end + 1])) return end;
  }
  return null;
}

/** 오차 반경이 지나치게 큰 신호를 먼저 걸러낸다. */
export function filterByAccuracy(points, limitMeters = DEFAULT_ACCURACY_LIMIT_M) {
  const kept = points.filter(
    (p) => p.accuracy == null || p.accuracy <= limitMeters,
  );
  // 전부 걸러지면 필터를 적용하지 않는다 — 위치가 하나도 없는 것보다는 낫다.
  if (kept.length === 0) return { points, removedCount: 0 };
  return { points: kept, removedCount: points.length - kept.length };
}

/** 튀는 GPS 신호를 제거한다. 첫 점과 마지막 점은 항상 보존한다. */
export function filterLocationOutliers(points) {
  if (points.length < 3) return { points, removedCount: 0 };

  const kept = [points[0]];
  let removedCount = 0;
  let index = 1;
  while (index < points.length - 1) {
    const runEnd = suspiciousRunEnd(points, kept[kept.length - 1], index);
    if (runEnd === null) {
      kept.push(points[index]);
      index += 1;
    } else {
      removedCount += runEnd - index + 1;
      index = runEnd + 1;
    }
  }
  kept.push(points[points.length - 1]);
  return { points: kept, removedCount };
}

/** accuracy 게이트 + 이상치 제거를 한 번에 적용한다. */
export function cleanLocations(points, accuracyLimitM = DEFAULT_ACCURACY_LIMIT_M) {
  const byAccuracy = filterByAccuracy(points, accuracyLimitM);
  const byOutlier = filterLocationOutliers(byAccuracy.points);
  return {
    points: byOutlier.points,
    removedCount: byAccuracy.removedCount + byOutlier.removedCount,
  };
}
