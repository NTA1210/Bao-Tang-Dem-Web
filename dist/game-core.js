export const LIMIT = 3;
export const TARGET = 10000;
export const DEADLINE = 13000;

export function scoreAttempt(elapsed, timedOut = false) {
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new Error('Thời gian không hợp lệ');
  }
  const offset = elapsed - TARGET;
  const isExpired = timedOut || elapsed >= DEADLINE;
  const score = isExpired ? 0 : Math.round(1000 * Math.exp(-Math.abs(offset) / 250));

  return {
    elapsed,
    offset,
    deviation: Math.abs(offset),
    score,
    timedOut: isExpired
  };
}

export function clockParts(elapsed) {
  const ms = Math.floor(64790000 + Math.max(0, Math.min(elapsed, DEADLINE)));
  const hours = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const seconds = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  const milliseconds = String(ms % 1000).padStart(3, '0');

  return {
    main: `${hours}:${minutes}:${seconds}`,
    ms: `.${milliseconds}`
  };
}

// Giới hạn độ lệch cao nhất tính theo milliseconds (bao gồm cả cận trên)
export const LIGHT_LEVELS = Object.freeze([
  { maxDeviation: 50, windows: 8 },
  { maxDeviation: 100, windows: 7 },
  { maxDeviation: 200, windows: 6 },
  { maxDeviation: 350, windows: 5 },
  { maxDeviation: 500, windows: 4 },
  { maxDeviation: 750, windows: 3 },
  { maxDeviation: 1000, windows: 2 },
  { maxDeviation: 2000, windows: 1 }
]);

export function litWindows(deviation, timedOut = false) {
  if (timedOut || !Number.isFinite(deviation) || deviation < 0) {
    return 0;
  }
  return LIGHT_LEVELS.find(level => deviation <= level.maxDeviation)?.windows || 0;
}

export function secondsLabel(milliseconds) {
  return (milliseconds / 1000).toLocaleString('vi-VN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

export function bestAttempt(attempts) {
  return (
    attempts
      .filter(a => !a.timedOut && a.status !== 'suspicious' && a.status !== 'rejected')
      .sort((a, b) => a.deviation - b.deviation || a.achievedAt - b.achievedAt)[0] || null
  );
}
