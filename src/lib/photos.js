// 그날 찍은 사진을 동선에 얹는다.
//
// 왜 필요한가
//   좌표는 기억을 되살리지 못한다. "37.5632, 126.9851 에 40분 머무름"은
//   아무 말도 안 해주지만, "1:40에 여기서 사진 3장"은 그 자리를 떠올리게
//   한다. 술 취한 밤을 되짚는 데는 후자가 훨씬 강한 단서다.
//
// 프라이버시
//   사진을 복사하지도, 서버로 올리지도 않는다. 기기 안에서 촬영 시각과
//   (있으면) GPS 좌표, 그리고 미리보기용 URI 만 읽는다. 서버에 저장되는
//   것은 아무것도 없다.

import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { haversineKm } from './geo';

export const PHOTO_UNSUPPORTED = 'unsupported';
export const PHOTO_DENIED = 'denied';

/**
 * 사진 접근 권한을 확인한다.
 * iOS 는 "일부만 선택" 을 허용하므로, 접근 범위도 함께 알려준다.
 */
export async function ensurePhotoPermission() {
  if (Platform.OS === 'web') return { ok: false, reason: PHOTO_UNSUPPORTED };

  try {
    const available = await MediaLibrary.isAvailableAsync();
    if (!available) return { ok: false, reason: PHOTO_UNSUPPORTED };

    let perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) {
      perm = await MediaLibrary.requestPermissionsAsync();
    }
    if (!perm.granted) return { ok: false, reason: PHOTO_DENIED };

    return { ok: true, limited: perm.accessPrivileges === 'limited' };
  } catch {
    return { ok: false, reason: PHOTO_UNSUPPORTED };
  }
}

/**
 * 세션 시간대에 찍힌 사진을 모은다.
 *
 * points 를 주면 사진에 GPS 가 없어도 촬영 시각으로 동선의 어느 지점인지
 * 추정한다. 실내에서 찍은 사진은 위치가 비어 있는 경우가 흔하다.
 */
export async function loadSessionPhotos({ startedAt, endedAt, points = [] }) {
  const permission = await ensurePhotoPermission();
  if (!permission.ok) return { photos: [], ...permission };

  const from = new Date(startedAt).getTime();
  // 끝나고 잠깐 사이에 찍은 것도 그 밤의 일부다.
  const to = new Date(endedAt || Date.now()).getTime() + 10 * 60_000;

  try {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      createdAfter: from,
      createdBefore: to,
      sortBy: [MediaLibrary.SortBy.creationTime],
      first: 100,
    });

    const photos = [];
    for (const asset of page.assets) {
      let location = null;
      try {
        // 위치는 자산 정보를 따로 읽어야 나온다. 실패해도 시각만으로 쓸 수 있다.
        const info = await MediaLibrary.getAssetInfoAsync(asset, {
          shouldDownloadFromNetwork: false,
        });
        if (info?.location?.latitude != null) location = info.location;
      } catch {
        // iCloud 에만 있는 사진 등. 시각만 쓴다.
      }

      photos.push({
        id: asset.id,
        uri: asset.uri,
        t: new Date(asset.creationTime).toISOString(),
        isVideo: asset.mediaType === MediaLibrary.MediaType.video,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        // 사진에 GPS 가 없으면 촬영 시각과 가장 가까운 위치 기록으로 추정한다.
        nearest: location ? null : nearestPointByTime(points, asset.creationTime),
      });
    }

    return { photos, ...permission };
  } catch {
    return { photos: [], ok: false, reason: PHOTO_UNSUPPORTED };
  }
}

/** 촬영 시각에 가장 가까운 위치 기록. 30분 넘게 떨어져 있으면 포기한다. */
function nearestPointByTime(points, timeMs) {
  if (!points?.length) return null;
  let best = null;
  let bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(new Date(p.t).getTime() - timeMs);
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  if (!best || bestGap > 30 * 60_000) return null;
  return { latitude: best.latitude, longitude: best.longitude, gapMs: bestGap };
}

/**
 * 체류 구간과 사진을 하나의 시간순 타임라인으로 합친다.
 * "여기 40분 머무름 · 사진 3장" 이 되어야 비로소 이야기로 읽힌다.
 */
export function buildTimeline({ stays = [], photos = [] }) {
  const items = [];

  for (const stay of stays) {
    const startMs = new Date(stay.startT).getTime();
    const endMs = new Date(stay.endT).getTime();
    items.push({
      kind: 'stay',
      t: stay.startT,
      endT: stay.endT,
      latitude: stay.latitude,
      longitude: stay.longitude,
      durationMs: stay.durationMs,
      pointCount: stay.pointCount,
      // 그 자리에 머무는 동안 찍은 사진
      photos: photos.filter((ph) => {
        const pt = new Date(ph.t).getTime();
        return pt >= startMs && pt <= endMs;
      }),
    });
  }

  // 어느 체류에도 속하지 않는 사진은 이동 중에 찍은 것이다.
  const claimed = new Set(items.flatMap((i) => i.photos.map((p) => p.id)));
  for (const photo of photos) {
    if (claimed.has(photo.id)) continue;
    items.push({ kind: 'photo', t: photo.t, photos: [photo] });
  }

  return items.sort((a, b) => new Date(a.t) - new Date(b.t));
}

/** 사진 위치와 동선이 얼마나 떨어져 있는지 (검증·표시용). */
export function photoDistanceFromPath(photo, points) {
  if (!photo.latitude || !points?.length) return null;
  let min = Infinity;
  for (const p of points) {
    const km = haversineKm(photo, p);
    if (km < min) min = km;
  }
  return min * 1000;
}
