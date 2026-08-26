// 앱(React Native)에서 쓰는 거리/속도 계산.
// web/lib/geo.js 와 같은 공식을 쓰지만, 네이티브 번들에는 web/ 폴더를
// 끌어오지 않도록 별도 사본으로 둔다.

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

/**
 * 두 좌표 사이를 비율만큼 보간한다.
 * 재생 중 점과 점 사이를 마커가 부드럽게 지나가게 할 때 쓴다.
 * 도보~차량 규모에서는 선형 보간과 대권 보간의 차이가 무시할 수준이라
 * 단순한 쪽을 쓴다.
 */
export function interpolate(from, to, fraction) {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: from.longitude + (to.longitude - from.longitude) * fraction,
  };
}

/** 사람이 읽기 좋은 거리 문자열. */
export function formatDistance(km) {
  if (!Number.isFinite(km) || km <= 0) return '0 m';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

/** ms 를 "1시간 23분" / "12분" / "45초" 로. */
export function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}초`;
  const mins = Math.floor(totalSec / 60);
  if (mins < 60) return `${mins}분`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}시간 ${mins % 60}분`;
}

/**
 * 기록된 경로의 요약 통계.
 * points: [{ latitude, longitude, t(ISO 문자열 또는 ms), shake? }]
 */
export function pathStats(points) {
  const empty = {
    distanceKm: 0,
    durationMs: 0,
    avgSpeedKmh: null,
    maxSpeedKmh: null,
    avgShake: null,
    maxShake: null,
  };
  if (!points || points.length === 0) return empty;

  let distanceKm = 0;
  let maxSpeedKmh = null;

  for (let i = 1; i < points.length; i += 1) {
    const legKm = haversineKm(points[i - 1], points[i]);
    distanceKm += legKm;

    const dtMs = new Date(points[i].t) - new Date(points[i - 1].t);
    if (dtMs > 0) {
      const kmh = legKm / (dtMs / 3_600_000);
      if (maxSpeedKmh === null || kmh > maxSpeedKmh) maxSpeedKmh = kmh;
    }
  }

  const durationMs = Math.max(
    0,
    new Date(points.at(-1).t) - new Date(points[0].t),
  );
  const avgSpeedKmh =
    durationMs > 0 ? distanceKm / (durationMs / 3_600_000) : null;

  const shakes = points.map((p) => p.shake).filter((s) => Number.isFinite(s));
  const avgShake = shakes.length
    ? Math.round(shakes.reduce((a, b) => a + b, 0) / shakes.length)
    : null;
  const maxShake = shakes.length ? Math.max(...shakes) : null;

  return { distanceKm, durationMs, avgSpeedKmh, maxSpeedKmh, avgShake, maxShake };
}
