import { useEffect, useMemo, useRef } from "react";

function getEventCard(event) {
  const payload = event?.payload || {};
  return (
    payload.afterCard ||
    payload.card ||
    payload.beforeCard ||
    payload.media ||
    null
  );
}

function getTargetName(event, cardLabelMap) {
  const payload = event?.payload || {};
  const cardId = event?.cardId || payload.cardId || payload.card?.id || payload.afterCard?.id || payload.beforeCard?.id;
  const card = getEventCard(event);

  if (card?.text?.trim()) return card.text.trim();
  if (cardId && cardLabelMap?.[cardId]) return cardLabelMap[cardId];
  if (payload.fileName) return payload.fileName;
  if (card?.fileName) return card.fileName;

  const type = card?.type || payload.cardType;
  const owner = card?.ownerName || event?.userName;
  if (type && owner) return `${owner}さんの${type}`;
  if (owner) return `${owner}さんが操作した付箋`;
  return "対象の付箋";
}

function CardPreview({ event, cardLabelMap }) {
  const card = getEventCard(event);
  const targetName = getTargetName(event, cardLabelMap);
  const isMedia = event.type?.startsWith("media_");

  if (isMedia) {
    return (
      <div className="keypoint-card-preview media-preview" aria-hidden="true">
        <span className="keypoint-preview-icon">▧</span>
        <span>{targetName}</span>
      </div>
    );
  }

  return (
    <div
      className="keypoint-card-preview"
      style={{ background: card?.color || "#fff4a8" }}
      aria-hidden="true"
    >
      <span className="keypoint-preview-owner">
        {card?.ownerName || event.userName || "利用者"}
      </span>
      <strong>{targetName}</strong>
      <span className="keypoint-preview-type">
        {card?.type || event?.payload?.cardType || "付箋"}
      </span>
    </div>
  );
}

export default function ActivityKeypointList({
  events,
  selectedEventId,
  currentPlaybackTimestamp,
  cardLabelMap,
  getKeypointMeta,
  getDescription,
  getChangeDetail,
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
    const element = itemRefs.current.get(activeEventId);
    element?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [activeEventId]);

  if (events.length === 0) {
    return (
      <p className="activity-history-empty">
        付箋やメディアの変化はまだ記録されていません。
      </p>
    );
  }

  return (
    <div className="activity-keypoint-list" role="list">
      {events.map((event, index) => {
        const meta = getKeypointMeta(event);
        const isSelected = activeEventId === event.id;
        const targetName = getTargetName(event, cardLabelMap);

        return (
          <button
            key={event.id}
            ref={(element) => {
              if (element) itemRefs.current.set(event.id, element);
              else itemRefs.current.delete(event.id);
            }}
            type="button"
            role="listitem"
            className={`activity-keypoint-card keypoint-${meta.className} ${
              isSelected ? "selected" : ""
            }`}
            onClick={() => onSelect(event)}
            aria-pressed={isSelected}
          >
            <div className="activity-keypoint-rail" aria-hidden="true">
              <span className={`activity-keypoint-number ${meta.className}`}>
                {index + 1}
              </span>
              {index < events.length - 1 && <span className="activity-keypoint-line" />}
            </div>

            <div className="activity-keypoint-main">
              <div className="activity-keypoint-topline">
                <time>{formatTime(event.timestamp)}</time>
                <span className={`activity-keypoint-type ${meta.className}`}>
                  {meta.icon} {meta.label}
                </span>
              </div>

              <div className="activity-keypoint-body">
                <CardPreview event={event} cardLabelMap={cardLabelMap} />

                <div className="activity-keypoint-copy">
                  <strong className="activity-keypoint-target">{targetName}</strong>
                  <p>{getDescription(event, cardLabelMap)}</p>
                  <small>{getChangeDetail(event)}</small>
                </div>
              </div>

              <div className="activity-keypoint-action">
                <span>{isSelected ? "この場面を表示中" : "タップしてこの場面を見る"}</span>
                <span aria-hidden="true">›</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
