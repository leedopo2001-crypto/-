// Adapted from mahlernim/google-timeline-visualizer (MIT License, (c) 2025 mahlernim)
// https://github.com/mahlernim/google-timeline-visualizer — see web/lib/ATTRIBUTION.md

export function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function easeOutCubic(value) {
  const inverse = 1 - clamp(value);
  return 1 - inverse * inverse * inverse;
}

export function easeInOutCubic(value) {
  const amount = clamp(value);
  if (amount < 0.5) return 4 * amount * amount * amount;
  const inverse = -2 * amount + 2;
  return 1 - (inverse * inverse * inverse) / 2;
}

/**
 * requestAnimationFrame 기반 트윈. onUpdate(progress) 를 0→1 로 호출하고
 * 끝나면 onDone 을 부른다. 반환값을 호출하면 중간에 취소된다.
 */
export function tween({ durationMs, easing = easeInOutCubic, onUpdate, onDone }) {
  let frame = null;
  let cancelled = false;
  const start = performance.now();

  const step = (now) => {
    if (cancelled) return;
    const elapsed = now - start;
    const progress = durationMs <= 0 ? 1 : clamp(elapsed / durationMs);
    onUpdate(easing(progress));
    if (progress < 1) {
      frame = requestAnimationFrame(step);
    } else if (onDone) {
      onDone();
    }
  };

  frame = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
