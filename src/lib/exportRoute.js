// 기록한 경로를 밖으로 꺼낸다.
//
// GPX 는 등산·러닝 앱과 구글 어스가 모두 읽는 표준이라, 이 앱이 사라져도
// 기록은 남는다. 안전 앱에서 데이터가 앱에 갇히지 않는 건 꽤 중요하다.

import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { formatDistance, formatDuration } from './geo';

/** XML 에 그대로 넣으면 깨지는 문자들을 치환한다. */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeFileName(value) {
  return (
    String(value || 'here-route')
      .replace(/[^\w가-힣-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'here-route'
  );
}

/** 세션을 GPX 1.1 문서로. */
export function toGpx(session) {
  const points = session.points || [];
  const name = session.userName
    ? `${session.userName} · ${new Date(session.startedAt).toLocaleString('ko-KR')}`
    : `here · ${new Date(session.startedAt).toLocaleString('ko-KR')}`;

  const trkpts = points
    .map((p) => {
      const parts = [
        `        <trkpt lat="${p.latitude}" lon="${p.longitude}">`,
        `          <time>${new Date(p.t).toISOString()}</time>`,
      ];
      // GPX 표준에 배터리·흔들림 자리는 없다. 확장 필드로 넣어두면
      // 표준 뷰어는 무시하고, 필요하면 우리가 다시 읽을 수 있다.
      const ext = [];
      if (Number.isFinite(p.battery)) ext.push(`            <here:battery>${p.battery}</here:battery>`);
      if (Number.isFinite(p.shake)) ext.push(`            <here:shake>${p.shake}</here:shake>`);
      if (Number.isFinite(p.accuracy)) ext.push(`            <here:accuracy>${p.accuracy}</here:accuracy>`);
      if (ext.length > 0) {
        parts.push('          <extensions>', ...ext, '          </extensions>');
      }
      parts.push('        </trkpt>');
      return parts.join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="here"',
    '     xmlns="http://www.topografix.com/GPX/1/1"',
    '     xmlns:here="https://github.com/leedopo2001-crypto">',
    '  <metadata>',
    `    <name>${escapeXml(name)}</name>`,
    `    <time>${new Date(session.startedAt).toISOString()}</time>`,
    '  </metadata>',
    '  <trk>',
    `    <name>${escapeXml(name)}</name>`,
    '    <trkseg>',
    trkpts,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** 문자로 보내기 좋은 한 줄 요약. */
export function toSummaryText(session) {
  const s = session.stats || {};
  const when = new Date(session.startedAt).toLocaleString('ko-KR');
  const lines = [
    `📍 ${session.userName ? `${session.userName} · ` : ''}${when}`,
    `이동 ${formatDistance(s.distanceKm || 0)} · ${formatDuration(s.durationMs || 0)}`,
  ];
  if (Number.isFinite(s.avgSpeedKmh)) {
    lines.push(`평균 ${s.avgSpeedKmh.toFixed(1)} km/h · 최고 ${(s.maxSpeedKmh ?? 0).toFixed(1)} km/h`);
  }
  const last = session.points?.at(-1);
  if (last) {
    lines.push(`도착 위치: https://maps.google.com/?q=${last.latitude},${last.longitude}`);
  }
  return lines.join('\n');
}

/**
 * GPX 파일을 만들어 OS 공유 시트로 넘긴다.
 * 웹에서는 파일 시스템을 못 쓰므로 호출부가 다른 경로를 택해야 한다.
 */
export async function shareGpx(session) {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'web-unsupported' };
  }
  if (!(session.points || []).length) {
    return { ok: false, reason: 'no-points' };
  }

  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) return { ok: false, reason: 'sharing-unavailable' };

    const stamp = new Date(session.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '');
    const file = new File(Paths.cache, `${safeFileName(session.userName)}-${stamp}.gpx`);
    if (file.exists) file.delete();
    file.create();
    file.write(toGpx(session));

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/gpx+xml',
      dialogTitle: '경로 내보내기',
      UTI: 'public.xml',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || 'failed' };
  }
}

/** 요약 텍스트를 공유한다. 웹 포함 어디서나 동작한다. */
export async function shareSummary(session) {
  try {
    await Share.share({ message: toSummaryText(session) });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || 'failed' };
  }
}
