const DEFAULT_STALE_MS = 45_000;
const EVENT_TOLERANCE_MS = 0;

function toTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function buildActiveIntervals(
  sessions = {},
  {
    now = Date.now(),
    cutoff = null,
    historyEvents = [],
    staleMs = DEFAULT_STALE_MS
  } = {}
) {
  const cutoffTimestamp = toTimestamp(cutoff);
  const intervals = Object.values(sessions || {})
    .map((session) => {
      const start = toTimestamp(session?.startedAt);
      if (!start) return null;

      const explicitEnd = toTimestamp(session?.endedAt);
      const lastActive = toTimestamp(session?.lastActive);
      let end = explicitEnd;

      if (!end) {
        end = Math.min(
          now,
          lastActive ? lastActive + staleMs : start + staleMs
        );
      }

      if (cutoffTimestamp) {
        end = Math.min(end, cutoffTimestamp);
      }

      if (end <= start) return null;
      return { start, end };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  intervals.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end + 1_000) {
      merged.push({ ...interval });
      return;
    }
    last.end = Math.max(last.end, interval.end);
  });

  if (merged.length > 0) return merged;

  // 活動時間記録導入前のボードは、履歴の最初から最後までを暫定的に使用する。
  const timestamps = historyEvents
    .map((event) => toTimestamp(event?.timestamp))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (timestamps.length === 0) return [];
  const fallbackEnd = Math.max(timestamps[timestamps.length - 1], timestamps[0] + 1);
  return [{ start: timestamps[0], end: fallbackEnd }];
}

export function getActiveTimelineDuration(intervals = []) {
  return intervals.reduce(
    (total, interval) => total + Math.max(0, interval.end - interval.start),
    0
  );
}

export function timestampToActivePosition(timestamp, intervals = []) {
  const target = toTimestamp(timestamp);
  if (!target) return null;

  let elapsed = 0;
  for (const interval of intervals) {
    if (target < interval.start - EVENT_TOLERANCE_MS) return null;
    if (target <= interval.end + EVENT_TOLERANCE_MS) {
      return elapsed + Math.max(0, Math.min(target, interval.end) - interval.start);
    }
    elapsed += interval.end - interval.start;
  }
  return null;
}

export function activePositionToTimestamp(positionMs, intervals = []) {
  if (intervals.length === 0) return null;
  let remaining = Math.max(0, Number(positionMs) || 0);

  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index];
    const duration = interval.end - interval.start;
    const isLast = index === intervals.length - 1;
    if (remaining < duration || isLast) {
      return interval.start + Math.min(remaining, duration);
    }
    remaining -= duration;
  }

  return intervals[intervals.length - 1].end;
}

export function annotateEventsForActiveTimeline(events = [], intervals = []) {
  return events
    .map((event) => {
      const timelinePositionMs = timestampToActivePosition(
        event?.timestamp,
        intervals
      );
      if (timelinePositionMs === null) return null;
      return { ...event, timelinePositionMs };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const diff = a.timelinePositionMs - b.timelinePositionMs;
      return diff !== 0 ? diff : String(a.id || "").localeCompare(String(b.id || ""));
    });
}
