import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

const VIEW_W = 320;
const VIEW_H = 180;
const PAD = 16;

/**
 * 기록된 경로를 작은 SVG 로 그린다. 지도 타일 없이 모양만 보여주는
 * 미리보기 용도라서, 위경도를 화면 사각형에 단순 정규화한다.
 * (경도에 cos(위도) 보정을 넣어 가로세로 비율이 심하게 왜곡되지 않게 한다)
 */
export default function PathPreview({ points }) {
  if (!points || points.length < 2) {
    return (
      <View style={[styles.box, styles.empty]}>
        <Text style={styles.emptyText}>기록된 경로가 없습니다</Text>
      </View>
    );
  }

  const midLat = points.reduce((a, p) => a + p.latitude, 0) / points.length;
  const lonScale = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));

  const xs = points.map((p) => p.longitude * lonScale);
  const ys = points.map((p) => -p.latitude); // 북쪽이 위로 오게 부호 반전

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((VIEW_W - PAD * 2) / spanX, (VIEW_H - PAD * 2) / spanY);

  const offsetX = (VIEW_W - spanX * scale) / 2;
  const offsetY = (VIEW_H - spanY * scale) / 2;

  const coords = points.map((_, i) => [
    offsetX + (xs[i] - minX) * scale,
    offsetY + (ys[i] - minY) * scale,
  ]);
  const polyPoints = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const [startX, startY] = coords[0];
  const [endX, endY] = coords.at(-1);

  return (
    <View style={styles.box}>
      <Svg width="100%" height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        <Polyline
          points={polyPoints}
          fill="none"
          stroke="#ffffff"
          strokeWidth={7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Polyline
          points={polyPoints}
          fill="none"
          stroke="#E53935"
          strokeWidth={3.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={startX} cy={startY} r={5} fill="#fff" stroke="#666" strokeWidth={2.5} />
        <Circle cx={endX} cy={endY} r={6} fill="#E53935" stroke="#fff" strokeWidth={2.5} />
      </Svg>
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
});
