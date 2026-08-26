// 밤 모드 — 마시기 전에 켜두는 기록 모드.
//
// 왜 별도 모드인가
//   지금까지의 추적은 "위급하다고 판단한 사람이 켜는 것"을 전제로 한다.
//   취한 사람은 그 판단을 못 한다. 새벽 두 시에 앱을 열어 추적을 시작할
//   리가 없다. 그래서 판단이 멀쩡할 때 한 번 켜두고 잊어버리는 모드가
//   따로 필요하다.
//
// 일반 추적과 다른 점
//   · 주기가 길다 (기본 10분) — 밤새 돌아야 하므로 배터리가 관건이다.
//   · 끝나는 시각을 정해둔다 — 취한 사람은 종료도 안 누른다.
//   · 시작할 때 문자를 보내지 않는다 — 공유가 아니라 기록이 목적이다.
//     공유가 필요하면 추적 화면에서 언제든 링크를 보낼 수 있다.

export const NIGHT_INTERVAL_MINUTES = 10;

/** 밤 모드 종료 시각 후보. 아침에 깨어나 확인하는 흐름을 가정한다. */
export const END_HOUR_PRESETS = [4, 6, 8];

/**
 * 오늘(혹은 내일) 지정 시각의 타임스탬프.
 * 이미 지난 시각이면 다음 날로 넘긴다 — 밤 11시에 "6시"를 고르면
 * 오늘 아침 6시가 아니라 내일 아침 6시여야 한다.
 */
export function nextOccurrence(hour, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= nowMs) target.setDate(target.getDate() + 1);
  return target.getTime();
}

export function formatEndsAt(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const tomorrow = d.getDate() !== new Date().getDate();
  return `${tomorrow ? '내일 ' : ''}${hh}:${mm}`;
}

/** 남은 시간을 "6시간 20분" 으로. */
export function formatRemaining(ms) {
  if (ms <= 0) return '종료 시각 지남';
  const mins = Math.ceil(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}
