import { getTimestampValue, formatTimeOnly } from "../../utils/timeUtils";
import { getCardTypeLabel } from "../../utils/activityUtils";

export default function StickyNoteList({ cards, selectedCardId, onSelect }) {
  const entries = Object.entries(cards || {}).sort(([, a], [, b]) => {
    return getTimestampValue(b.updatedAt) - getTimestampValue(a.updatedAt);
  });

  if (entries.length === 0) {
    return <p className="side-panel-empty">付箋はありません。</p>;
  }

  return (
    <div className="sticky-note-list">
      {entries.map(([cardId, card]) => (
        <button
          type="button"
          key={cardId}
          className={`sticky-note-list-item ${selectedCardId === cardId ? "active" : ""}`}
          onClick={() => onSelect(cardId, card)}
        >
          <span
            className="sticky-note-list-preview"
            style={{ background: card.color || "#fff176" }}
            aria-hidden="true"
          >
            <b>{getCardTypeLabel(card.type || "idea")}</b>
            <small>{card.ownerName || "利用者"}</small>
          </span>

          <span className="sticky-note-list-copy">
            <strong>{card.text?.trim() || `${card.ownerName || "利用者"}の手書き付箋`}</strong>
            <small>
              {getCardTypeLabel(card.type || "idea")} ／ {card.ownerName || "利用者"}
            </small>
            <time>{getTimestampValue(card.updatedAt) > 0 ? formatTimeOnly(getTimestampValue(card.updatedAt)) : "時刻不明"}</time>
          </span>
          <span className="sticky-note-list-arrow" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}
