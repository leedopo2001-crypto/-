// 가속도계로 "흔들림 지수"를 계산한다.
//
// 원리: 가속도 크기 |a| 는 가만히 있으면 중력 때문에 1g 근처에 고정된다.
// 걷거나 흔들면 |a| 가 출렁이므로, 최근 몇 초 구간의 표준편차가 곧 흔들림이다.
// 지수 = 표준편차 × 100. 경험적 기준(기기마다 편차 있음):
//   0~4    거의 정지
//   5~24   걷는 중
//   25+    크게 흔들림 (뛰기, 휘두르기 등)

import { Accelerometer } from 'expo-sensors';

const SAMPLE_INTERVAL_MS = 200;
const WINDOW_SIZE = 25; // 약 5초

/**
 * 흔들림 모니터를 시작한다. onIndex(지수) 가 샘플마다 호출된다.
 * 반환한 함수를 부르면 중단된다. 센서가 없는 환경(웹 데스크톱 등)에서는
 * 아무 일도 하지 않는 중단 함수를 돌려준다.
 */
export function startShakeMonitor(onIndex) {
  let subscription = null;
  const window = [];

  try {
    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    subscription = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      window.push(magnitude);
      if (window.length > WINDOW_SIZE) window.shift();
      if (window.length < 5) return;

      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const variance =
        window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
      onIndex(Math.round(Math.sqrt(variance) * 100));
    });
  } catch {
    // 센서 미지원 환경: 지수는 영영 오지 않고, 호출부는 '—' 를 표시한다.
  }

  return () => {
    if (subscription) subscription.remove();
  };
}

export function shakeLabel(index) {
  if (!Number.isFinite(index)) return '—';
  if (index < 5) return '안정';
  if (index < 25) return '이동 중';
  return '흔들림 큼';
}
