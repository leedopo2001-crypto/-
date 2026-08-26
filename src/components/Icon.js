import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

/**
 * 선 기반 아이콘 세트.
 *
 * 이모지를 UI 요소로 쓰지 않는 이유: 렌더링이 OS·폰트마다 제각각이고,
 * 무엇보다 이 앱이 다루는 상황(납치, 낙상, 실종)에 맞지 않는 인상을 준다.
 * 24 그리드에 1.8 굵기로 통일해 어느 화면에서든 같은 무게로 보이게 한다.
 */
const SHAPES = {
  person: (p) => (
    <>
      <Circle cx={12} cy={8} r={3.6} {...p} />
      <Path d="M4.5 20.5c0-4 3.4-6.2 7.5-6.2s7.5 2.2 7.5 6.2" {...p} />
    </>
  ),
  pin: (p) => (
    <>
      <Path d="M12 21.5s7-6.6 7-11.5a7 7 0 1 0-14 0c0 4.9 7 11.5 7 11.5z" {...p} />
      <Circle cx={12} cy={10} r={2.6} {...p} />
    </>
  ),
  clock: (p) => (
    <>
      <Circle cx={12} cy={12} r={9} {...p} />
      <Polyline points="12,6.6 12,12 16,14.2" {...p} />
    </>
  ),
  timer: (p) => (
    <>
      <Circle cx={12} cy={13.5} r={8} {...p} />
      <Line x1={9.5} y1={2.5} x2={14.5} y2={2.5} {...p} />
      <Line x1={12} y1={2.5} x2={12} y2={5.5} {...p} />
      <Polyline points="12,9 12,13.5 15,15.5" {...p} />
    </>
  ),
  eye: (p) => (
    <>
      <Path d="M2 12s3.6-6.8 10-6.8S22 12 22 12s-3.6 6.8-10 6.8S2 12 2 12z" {...p} />
      <Circle cx={12} cy={12} r={3} {...p} />
    </>
  ),
  stop: (p) => <Rect x={6.5} y={6.5} width={11} height={11} rx={2.2} {...p} />,
  play: (p) => <Path d="M7.5 4.8 19 12 7.5 19.2z" {...p} />,
  send: (p) => (
    <>
      <Line x1={21.5} y1={2.5} x2={11} y2={13} {...p} />
      <Path d="M21.5 2.5 14.8 21.5 11 13 2.5 9.2z" {...p} />
    </>
  ),
  file: (p) => (
    <>
      <Path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" {...p} />
      <Polyline points="13.8,2.5 13.8,8.2 19.5,8.2" {...p} />
    </>
  ),
  share: (p) => (
    <>
      <Circle cx={18} cy={5} r={2.6} {...p} />
      <Circle cx={6} cy={12} r={2.6} {...p} />
      <Circle cx={18} cy={19} r={2.6} {...p} />
      <Line x1={8.3} y1={10.8} x2={15.7} y2={6.2} {...p} />
      <Line x1={8.3} y1={13.2} x2={15.7} y2={17.8} {...p} />
    </>
  ),
  map: (p) => (
    <>
      <Path d="M2.5 6.5 9 4l6 2.5 6.5-2.5v13L15 19.5 9 17l-6.5 2.5z" {...p} />
      <Line x1={9} y1={4} x2={9} y2={17} {...p} />
      <Line x1={15} y1={6.5} x2={15} y2={19.5} {...p} />
    </>
  ),
  copy: (p) => (
    <>
      <Rect x={8.5} y={8.5} width={11} height={11} rx={2} {...p} />
      <Path d="M15.5 5.5v-1a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1" {...p} />
    </>
  ),
  check: (p) => <Polyline points="20,6.5 9,17.5 4,12.5" {...p} />,
  checkCircle: (p) => (
    <>
      <Circle cx={12} cy={12} r={9} {...p} />
      <Polyline points="8,12.2 11,15.2 16.2,9" {...p} />
    </>
  ),
  battery: (p) => (
    <>
      <Rect x={2.5} y={7.5} width={16} height={9} rx={2} {...p} />
      <Line x1={21} y1={10.5} x2={21} y2={13.5} {...p} />
    </>
  ),
  warning: (p) => (
    <>
      <Path d="M12 3.5 22 20H2z" {...p} />
      <Line x1={12} y1={9.5} x2={12} y2={14} {...p} />
      <Line x1={12} y1={16.8} x2={12} y2={17} {...p} />
    </>
  ),
  signal: (p) => (
    <>
      <Path d="M4.5 12.5a10 10 0 0 1 15 0" {...p} />
      <Path d="M7.5 15.5a6 6 0 0 1 9 0" {...p} />
      <Line x1={12} y1={19} x2={12} y2={19.2} {...p} />
    </>
  ),
  lock: (p) => (
    <>
      <Rect x={4.5} y={10.5} width={15} height={10} rx={2.2} {...p} />
      <Path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" {...p} />
    </>
  ),
  chat: (p) => (
    <Path d="M20.5 12.5c0 3.9-3.8 7-8.5 7-1.1 0-2.2-.2-3.1-.5L3.5 20.5l1.6-4A6.6 6.6 0 0 1 3.5 12.5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z" {...p} />
  ),
  link: (p) => (
    <>
      <Path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.6 4.6 0 0 0-6.5-6.5l-1.5 1.5" {...p} />
      <Path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5L4.5 12.7a4.6 4.6 0 0 0 6.5 6.5l1.5-1.5" {...p} />
    </>
  ),
  unplug: (p) => (
    <>
      <Path d="M8.5 3.5v5M15.5 3.5v5" {...p} />
      <Path d="M5.5 8.5h13v3a6.5 6.5 0 0 1-13 0z" {...p} />
      <Line x1={12} y1={18} x2={12} y2={21} {...p} />
      <Line x1={3} y1={3} x2={21} y2={21} {...p} />
    </>
  ),
  sos: (p) => (
    <>
      <Circle cx={12} cy={12} r={3.2} {...p} />
      <Path d="M6.6 6.6a7.7 7.7 0 0 0 0 10.8M17.4 6.6a7.7 7.7 0 0 1 0 10.8" {...p} />
    </>
  ),
};

export default function Icon({
  name,
  size = 20,
  color = '#555',
  strokeWidth = 1.8,
}) {
  const shape = SHAPES[name];
  if (!shape) return null;

  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };
  // 채워야 자연스러운 것들은 따로 처리한다.
  const filled = { fill: color, stroke: color, strokeWidth, strokeLinejoin: 'round' };
  const props = name === 'play' || name === 'stop' ? filled : stroke;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shape(props)}
    </Svg>
  );
}
