const timestampFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const timeOnlyFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

export const getTimestampValue = (timestamp) => {
  return typeof timestamp === "number" ? timestamp : 0;
};

export const formatTimestamp = (timestamp) => {
  if (typeof timestamp !== "number") return "保存中…";
  return timestampFormatter.format(new Date(timestamp));
};

export const formatTimeOnly = (timestamp) => {
  if (typeof timestamp !== "number") return "--:--:--";
  return timeOnlyFormatter.format(new Date(timestamp));
};

export const formatDuration = (durationMs) => {
  const value = Math.max(0, Number(durationMs) || 0);
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}秒`;
  return `${minutes}分${seconds}秒`;
};
