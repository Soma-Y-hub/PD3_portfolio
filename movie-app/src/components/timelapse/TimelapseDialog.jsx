import PlaybackDrawingCanvas from "../PlaybackDrawingCanvas";
import PlaybackMediaLayer from "../PlaybackMediaLayer";

export default function TimelapseDialog({
  open,
  onClose,
  historyEvents,
  playbackPosition,
  playbackDuration,
  playbackSpeed,
  isPlaying,
  playbackTimestamp,
  playbackState,
  keypoints,
  activeKeypoint,
  activityCardLabelMap,
  onPlayingChange,
  onPlaybackPositionChange,
  onPlaybackSpeedChange,
  getKeypointMeta,
  getActivityDescription,
  getCardDisplayName,
  getActivityChangeDetail,
  getCardTypeLabel,
  getShortCardId,
  formatTimestamp,
  formatTimeOnly,
  formatDuration
}) {
  if (!open) return null;

  return (
    <div className="timelapse-overlay">
      <div className="timelapse-dialog">
        <div className="timelapse-header">
          <div>
            <h2>タイムラプス</h2>
            <p>{playbackTimestamp ? formatTimestamp(playbackTimestamp) : "履歴がありません"}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="timelapse-controls">
          <button
            type="button"
            disabled={historyEvents.length === 0}
            onClick={() => {
              if (playbackPosition >= playbackDuration) onPlaybackPositionChange(0);
              onPlayingChange(!isPlaying);
            }}
          >
            {isPlaying ? "一時停止" : "再生"}
          </button>
          <button
            type="button"
            onClick={() => {
              onPlayingChange(false);
              onPlaybackPositionChange(0);
            }}
          >
            最初から
          </button>
          <select
            value={playbackSpeed}
            onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
          >
            <option value={60}>1秒＝1分</option>
            <option value={300}>1秒＝5分</option>
            <option value={600}>1秒＝10分</option>
            <option value={1800}>1秒＝30分</option>
          </select>

          <div className="timelapse-range-wrap">
            <input
              type="range"
              min="0"
              max={Math.max(playbackDuration, 0)}
              value={Math.min(playbackPosition, playbackDuration)}
              onChange={(event) => {
                onPlayingChange(false);
                onPlaybackPositionChange(Number(event.target.value));
              }}
              aria-label="タイムラプス再生位置"
            />

            <div className="timelapse-keypoint-track" aria-label="キーポイント一覧">
              {keypoints.map((event) => {
                const meta = getKeypointMeta(event);
                const active = activeKeypoint?.id === event.id;
                return (
                  <button
                    key={event.id}
                    type="button"
                    className={`timelapse-keypoint-dot ${meta.className} ${active ? "active" : ""}`}
                    style={{ left: `${event.percentage}%` }}
                    title={`${formatTimeOnly(event.timestamp)} ${meta.label}：${getActivityDescription(event, activityCardLabelMap)}`}
                    aria-label={`${formatTimeOnly(event.timestamp)} ${meta.label}`}
                    onClick={() => {
                      onPlayingChange(false);
                      onPlaybackPositionChange(event.positionMs);
                    }}
                  >
                    <span>{meta.icon}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <span>{historyEvents.length}件 ／ 活動時間 {formatDuration(playbackDuration)}</span>
        </div>

        {activeKeypoint && (() => {
          const meta = getKeypointMeta(activeKeypoint);
          const payload = activeKeypoint.payload || {};
          return (
            <div className={`timelapse-keypoint-banner ${meta.className}`}>
              <div className={`timelapse-keypoint-banner-icon ${meta.className}`}>
                {meta.icon}
              </div>
              <div>
                <strong>{meta.label}</strong>
                <span>{formatTimeOnly(activeKeypoint.timestamp)}</span>
                <p className="timelapse-keypoint-fact">
                  記録された事実：{getActivityDescription(activeKeypoint, activityCardLabelMap)}
                </p>
                <p className="timelapse-keypoint-target">
                  対象：{getCardDisplayName(activeKeypoint, activityCardLabelMap)}
                </p>
                <p className="timelapse-keypoint-change">
                  {getActivityChangeDetail(activeKeypoint)}
                </p>
                <p className="timelapse-keypoint-hint">{meta.hint}</p>
                {activeKeypoint.type === "card_resized" && (
                  <small>操作時間：{formatDuration(payload.durationMs)}</small>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  onPlayingChange(false);
                  onPlaybackPositionChange(activeKeypoint.positionMs);
                }}
              >
                この時点へ
              </button>
            </div>
          );
        })()}

        <div className="timelapse-keypoint-legend">
          {["card_created", "card_deleted", "card_type_changed", "card_resized"].map((type) => {
            const meta = getKeypointMeta({ type });
            return (
              <span key={type} className={meta.className}>
                <b>{meta.icon}</b>{meta.label}
              </span>
            );
          })}
        </div>

        <div className="timelapse-board">
          {Object.entries(playbackState.cards || {}).map(([id, card]) => (
            <div
              key={id}
              className={`card timelapse-card ${activeKeypoint?.cardId === id
                ? `timelapse-keypoint-card-active ${getKeypointMeta(activeKeypoint).className}`
                : ""}`}
              style={{
                left: card.x,
                top: card.y,
                width: card.width || 260,
                height: card.height || 360,
                background: card.color || "#fff176",
                zIndex: Number(card.zIndex) || 1
              }}
            >
              <div className="timelapse-card-meta-row">
                <div className="owner-name" title={card.ownerName || "名前なし"}>
                  {card.ownerName || "名前なし"}
                </div>
                <div className="timelapse-card-type">
                  {getCardTypeLabel(card.type || "idea")} ／ ID:{getShortCardId(id)}
                </div>
              </div>
              <div className="drawing-area drawing-area-full">
                <PlaybackDrawingCanvas segments={playbackState.drawings?.[id] || []} />
              </div>
            </div>
          ))}

          <PlaybackMediaLayer media={playbackState.media || {}} />

          {(playbackState.boardDrawings || []).length > 0 && (
            <div className="timelapse-board-drawing-layer" aria-hidden="true">
              <PlaybackDrawingCanvas segments={playbackState.boardDrawings} />
            </div>
          )}

          {historyEvents.length === 0 && (
            <div className="timelapse-empty">
              履歴がありません。統合版導入後の操作から記録されます。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
