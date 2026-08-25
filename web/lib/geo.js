// Adapted from mahlernim/google-timeline-visualizer (MIT License, (c) 2025 mahlernim)
// https://github.com/mahlernim/google-timeline-visualizer — see web/lib/ATTRIBUTION.md
// Ported from TypeScript to plain ES modules for the `here` live-tracking viewer.

const EARTH_RADIUS_KM = 6371.0088;

/** 두 좌표 사이의 대권 거리(km). */
export function haversineKm(a, b) {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 각 지점까지의 누적 이동 거리 배열(km). */
export function cumulativeDistances(points) {
  const distances = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i += 1) {
    distances[i] = distances[i - 1] + haversineKm(points[i - 1], points[i]);
  }
  return distances;
}

/** 경로 전체 이동 거리(km). */
export function totalDistanceKm(points) {
  if (points.length < 2) return 0;
  return cumulativeDistances(points).at(-1);
}

/** 두 지점 사이의 평균 속도(km/h). 시간 간격이 없으면 null. */
export function speedKmh(from, to) {
  const millis = to.instant.getTime() - from.instant.getTime();
  if (millis <= 0) return null;
  return haversineKm(from, to) / (millis / 3_600_000);
}

/** 사람이 읽기 좋은 거리 문자열. */
export function formatDistance(km) {
  if (!Number.isFinite(km) || km <= 0) return '0 m';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

/**
 * 두 좌표 사이를 대권 경로로 보간한다.
 * 마커를 이전 위치에서 새 위치로 부드럽게 이동시킬 때 사용한다.
 */
export function interpolateGreatCircle(start, end, fraction) {
  const toVector = (point) => {
    const lat = (point.latitude * Math.PI) / 180;
    const lon = (point.longitude * Math.PI) / 180;
    const r = Math.cos(lat);
    return [r * Math.cos(lon), r * Math.sin(lon), Math.sin(lat)];
  };

  const from = toVector(start);
  const to = toVector(end);
  const dot = Math.max(
    -1,
    Math.min(1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2]),
  );
  const angle = Math.acos(dot);
  const sinAngle = Math.sin(angle);

  // 거의 같은 지점이면 단순 선형 보간으로 충분하다.
  if (sinAngle < 1e-9) {
    return {
      latitude: start.latitude + (end.latitude - start.latitude) * fraction,
      longitude: start.longitude + (end.longitude - start.longitude) * fraction,
    };
  }

  const fromWeight = Math.sin((1 - fraction) * angle) / sinAngle;
  const toWeight = Math.sin(fraction * angle) / sinAngle;
  const x = from[0] * fromWeight + to[0] * toWeight;
  const y = from[1] * fromWeight + to[1] * toWeight;
  const z = from[2] * fromWeight + to[2] * toWeight;

  return {
    latitude: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
    longitude: (Math.atan2(y, x) * 180) / Math.PI,
  };
}
