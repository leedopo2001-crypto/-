// 경로에서 "머물렀던 구간"을 뽑아낸다.
//
// 선만 보면 어디서 시간을 썼는지 안 보인다. 술집에 40분 앉아 있었어도
// 점이 한자리에 겹칠 뿐이라 지나간 길과 구분이 안 된다. 반경 안에 일정
// 시간 이상 머문 구간을 따로 표시하면 동선이 이야기로 읽힌다.

import { haversineKm } from './geo';

export const DEFAULT_STAY = {
  radiusMeters: 60,
  minMinutes: 5,
};

function centroid(points) {
  const lat = points.reduce((a, p) => a + p.latitude, 0) / points.length;
  const lon = points.reduce((a, p) => a + p.longitude, 0) / points.length;
  return { latitude: lat, longitude: lon };
}

/**
 * points: [{ latitude, longitude, t }] — 시간순 정렬 가정
 * 반환: [{ startIndex, endIndex, latitude, longitude, startT, endT, durationMs, pointCount }]
 */
export function detectStays(points, options = {}) {
  const { radiusMeters, minMinutes } = { ...DEFAULT_STAY, ...options };
  const minMs = minMinutes * 60_000;
  const stays = [];
  if (!points || points.length < 2) return stays;

  let start = 0;
  while (start < points.length - 1) {
    let end = start;
    let center = points[start];

    // 무게중심에서 반경을 벗어나지 않는 한 계속 구간을 늘린다.
    // 무게중심을 쓰는 이유: 첫 점만 기준으로 하면 GPS 가 한쪽으로 조금씩
    // 밀릴 때 실제로는 같은 자리인데도 구간이 일찍 끊긴다.
    for (let next = start + 1; next < points.length; next += 1) {
      const candidate = points.slice(start, next + 1);
      const candidateCenter = centroid(candidate);
      const withinRadius = candidate.every(
        (p) => haversineKm(candidateCenter, p) * 1000 <= radiusMeters,
      );
      if (!withinRadius) break;
      end = next;
      center = candidateCenter;
    }

    const durationMs =
      new Date(points[end].t).getTime() - new Date(points[start].t).getTime();

    if (end > start && durationMs >= minMs) {
      stays.push({
        startIndex: start,
        endIndex: end,
        latitude: center.latitude,
        longitude: center.longitude,
        startT: points[start].t,
        endT: points[end].t,
        durationMs,
        pointCount: end - start + 1,
      });
      start = end + 1;
    } else {
      start += 1;
    }
  }

  return stays;
}

/** 머문 시간 합계 (ms). */
export function totalStayMs(stays) {
  return stays.reduce((a, s) => a + s.durationMs, 0);
}
