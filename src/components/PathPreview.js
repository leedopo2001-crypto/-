import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { buildTrack, positionAtProgress } from '../lib/replay';
import { formatDistance } from '../lib/geo';

const VIEW_W = 320;
const VIEW_H = 180;
const PAD = 18;
const REPLAY_MS = 10_000;
const FRAME_MS = 40; // 25fps — SVG 를 매 프레임 다시 그리므로 60fps 는 과하다

/**
 * 위경도를 미리보기 사각형 좌표로 바꾸는 변환기를 만든다.
 * 경도에 cos(위도) 보정을 넣어 가로세로 비율이 심하게 왜곡되지 않게 한다.
 */
function makeProjector(points) {
  const midLat = points.reduce((a, p) => a + p.latitude, 0) / points.length;
  const lonScale = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));

  const xs = points.map((p) => p.longitude * lonScale);
  const ys = points.map((p) => -p.latitude); // 북쪽이 위로

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((VIEW_W - PAD * 2) / spanX, (VIEW_H - PAD * 2) / spanY);
  const offsetX = (VIEW_W - spanX * scale) / 2;
  const offsetY = (VIEW_H - spanY * scale) / 2;

  return (point) => [
    offsetX + (point.longitude * lonScale - minX) * scale,
    offsetY + (-point.latitude - minY) * scale,
  ];
}

const toPolyline = (coords) =>
  coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * 기록된 경로를 SVG 로 그린다. 지도 타일 없이 모양만 보여주는 미리보기다.
 * stays 가 있으면 머문 자리를 원으로 표시하고, 재생 버튼으로 동선을
 * 처음부터 되돌려 볼 수 있다.
 */
export default function PathPreview({ points, stays = [] }) {
  const [progress, setProgress] = useState(null); // null = 재생 중 아님
  const rafRef = useRef(null);
  const startedAtRef = useRef(0);

  const hasPath = points && points.length >= 2;

  const track = useMemo(() => (hasPath ? buildTrack(points) : null), [points, hasPath]);
  const project = useMemo(() => (hasPath ? makeProjector(points) : null), [points, hasPath]);
  const allCoords = useMemo(
    () => (hasPath ? points.map(project) : []),
    [points, project, hasPath],
  );

  useEffect(() => () => clearTimeout(rafRef.current), []);

  function stop() {
    clearTimeout(rafRef.current);
    rafRef.current = null;
    setProgress(null);
  }

  function play() {
    if (rafRef.current) {
      stop();
      return;
    }
    startedAtRef.current = Date.now();

    const step = () => {
      const elapsed = Date.now() - startedAtRef.current;
      const value = Math.min(1, elapsed / REPLAY_MS);
      setProgress(value);
      if (value < 1) {
        rafRef.current = setTimeout(step, FRAME_MS);
      } else {
        rafRef.current = null;
        // 끝나면 잠깐 두었다가 전체 경로로 되돌린다.
        setTimeout(() => setProgress(null), 900);
      }
    };
    step();
  }

  if (!hasPath) {
    return (
      <View style={[styles.box, styles.empty]}>
        <Text style={styles.emptyText}>기록된 경로가 없습니다</Text>
      </View>
    );
  }

  const playing = progress !== null;
  const at = playing ? positionAtProgress(track, progress) : null;

  let drawnCoords = allCoords;
  let headCoord = allCoords.at(-1);
  let recentCoords = null;

  if (at) {
    const head = project(at.position);
    drawnCoords = [...allCoords.slice(0, at.segmentIndex + 1), head];
    headCoord = head;

    // 최근 구간만 굵고 진하게. 전체가 한 색이면 지금 어디인지 안 보인다.
    const recentKm = Math.max(0.03, track.totalKm * 0.18);
    const fromKm = Math.max(0, at.distanceKm - recentKm);
    let fromIndex = track.cumulative.findIndex((km) => km >= fromKm);
    if (fromIndex < 0) fromIndex = 0;
    recentCoords = [...allCoords.slice(fromIndex, at.segmentIndex + 1), head];
  }

  const startCoord = allCoords[0];

  return (
    <View>
      <View style={styles.box}>
        <Svg width="100%" height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {/* 재생 중에는 전체 경로를 흐리게 깔아 어디까지 남았는지 보여준다 */}
          {playing && (
            <Polyline
              points={toPolyline(allCoords)}
              fill="none"
              stroke="#D8DDE2"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          <Polyline
            points={toPolyline(drawnCoords)}
            fill="none"
            stroke="#ffffff"
            strokeWidth={7}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Polyline
            points={toPolyline(drawnCoords)}
            fill="none"
            stroke="#E53935"
            strokeWidth={3.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {recentCoords && recentCoords.length > 1 && (
            <Polyline
              points={toPolyline(recentCoords)}
              fill="none"
              stroke="#8B0000"
              strokeWidth={6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* 머문 자리. 출발·도착 마커와 겹치는 경우가 많으므로, 그보다
              눈에 띄게 크게 그리고 마커를 그 위에 올린다. */}
          {!playing &&
            stays.map((stay) => {
              const [cx, cy] = project(stay);
              return (
                <Circle
                  key={`${stay.startIndex}-${stay.endIndex}`}
                  cx={cx}
                  cy={cy}
                  r={16}
                  fill="rgba(69, 39, 160, 0.14)"
                  stroke="#7E57C2"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              );
            })}

          <Circle
            cx={startCoord[0]}
            cy={startCoord[1]}
            r={5}
            fill="#fff"
            stroke="#666"
            strokeWidth={2.5}
          />
          <Circle
            cx={headCoord[0]}
            cy={headCoord[1]}
            r={6}
            fill="#E53935"
            stroke="#fff"
            strokeWidth={2.5}
          />
        </Svg>
      </View>

      {stays.length > 0 && (
        <Text style={styles.legend}>
          ⬤ 출발 · ⬤ 도착 · ⭘ 점선 원은 머문 곳
        </Text>
      )}

      <Pressable style={styles.playButton} onPress={play}>
        <Text style={styles.playText}>
          {playing
            ? `⏹ 재생 중지 · ${Math.round(progress * 100)}% · ${formatDistance(at?.distanceKm || 0)}`
            : '▶ 경로 재생'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#F1F3F5',
    borderRadius: 14,
    overflow: 'hidden',
  },
  empty: {
    height: VIEW_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#999', fontSize: 13 },
  playButton: {
    marginTop: 10,
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  playText: { color: '#555', fontSize: 14, fontWeight: '600' },
  legend: {
    marginTop: 8,
    fontSize: 11.5,
    color: '#999',
    textAlign: 'center',
  },
});
