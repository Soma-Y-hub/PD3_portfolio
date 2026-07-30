import { useEffect, useMemo, useRef } from "react";

function getEventTarget(event, cardLabelMap) {
  const payload = event?.payload || {};
  const card = payload.afterCard || payload.card || payload.beforeCard || payload.media || null;
  const cardId = event?.cardId || payload.cardId || card?.id;

  if (card?.text?.trim()) return card.text.trim();
  if (cardId && cardLabelMap?.[cardId]) return cardLabelMap[cardId];
  if (payload.fileName || card?.fileName) return payload.fileName || card.fileName;
  return card?.ownerName ? `${card.ownerName}さんの付箋` : "対象の付箋";
}

function KeypointPreview({ event }) {
  const payload = event?.payload || {};
  const card = payload.afterCard || payload.card || payload.beforeCard || null;
  const media = payload.media || null;

  if (event.type?.startsWith("media_")) {
    return (
      <span className="simple-keypoint-preview media" aria-hidden="true">
        {media?.type === "video" ? "▶" : "▧"}
      </span>
    );
  }

  return (
    <span
      className="simple-keypoint-preview"
      style={{ background: card?.color || "#fff176" }}
      aria-hidden="true"
    />
  );
}

export default function ActivityKeypointList({
  events,
  selectedEventId,
  currentPlaybackTimestamp,
  cardLabelMap,
  getKeypointMeta,
  getDescription,
  formatTime,
  onSelect
}) {
  const itemRefs = useRef(new Map());

  const activeEventId = useMemo(() => {
    if (selectedEventId) return selectedEventId;
    if (!currentPlaybackTimestamp) return null;

    let activeId = null;
    for (const event of events) {
      if (event.timestamp <= currentPlaybackTimestamp) activeId = event.id;
      else break;
    }
    return activeId;
  }, [events, selectedEventId, currentPlaybackTimestamp]);

  useEffect(() => {
    if (!activeEventId) return;
    itemRefs.current.get(activeEventId)?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth"
    });
  }, [activeEventId]);

  if (events.length === 0) {
    return <p className="activity-history-empty">活動の目印はまだありません。</p>;
  }

  return (
    <div className="simple-keypoint-list" role="list">
      {events.map((event) => {
        const meta = getKeypointMeta(event);
        const isSelected = activeEventId === event.id;
        const target = getEventTarget(event, cardLabelMap);

        return (
          <button
            key={event.id}
            ref={(element) => {
              if (element) itemRefs.current.set(event.id, element);
              else itemRefs.current.delete(event.id);
            }}
            type="button"
            role="listitem"
            className={`simple-keypoint-item ${isSelected ? "selected" : ""}`}
            onClick={() => onSelect(event)}
            aria-pressed={isSelected}
          >
            <KeypointPreview event={event} />
            <span className="simple-keypoint-copy">
              <span className="simple-keypoint-topline">
                <time>{formatTime(event.timestamp)}</time>
                <b>{meta.icon} {meta.label}</b>
              </span>
              <strong>{target}</strong>
              <small>{getDescription(event, cardLabelMap)}</small>
            </span>
            <span className="simple-keypoint-jump">
              {isSelected ? "表示中" : "この場面へ"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
