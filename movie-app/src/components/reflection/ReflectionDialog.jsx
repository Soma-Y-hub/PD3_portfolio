import { useEffect, useState } from "react";
import PlaybackDrawingCanvas from "../PlaybackDrawingCanvas";
import StudentTeacherFeedbackCard from "../feedback/StudentTeacherFeedbackCard";
import ActivityKeypointList from "./ActivityKeypointList";
import ReflectionWritingPanel from "./ReflectionWritingPanel";

export default function ReflectionDialog({
  open,
  onClose,
  historyEvents,
  playbackDuration,
  playbackPosition,
  onPlaybackPositionChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  isPlaying,
  onPlayingChange,
  playbackTimestamp,
  playbackState,
  keypoints,
  selectedKeypointId,
  onSelectKeypoint,
  cardLabelMap,
  getKeypointMeta,
  getDescription,
  getCardTypeLabel,
  formatTime,
  reflectionText,
  onReflectionTextChange,
  reflectionRecord,
  reflectionSubmitting,
  onSubmitReflection,
  onDeleteReflection,
  boardId,
  currentUserId
}) {
  const [tab, setTab] = useState("review");

  useEffect(() => {
    if (open) setTab("review");
  }, [open]);

  if (!open) return null;

  return (
    <div className="reflection-overlay simple-reflection-overlay" role="dialog" aria-modal="true">
      <div className="simple-reflection-dialog">
        <header className="simple-reflection-header">
          <div>
            <h2>活動の振り返り</h2>
            <p>活動を見る → 書く → コメントを確認する</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる">×</button>
        </header>

        <nav className="simple-reflection-tabs" aria-label="振り返り画面">
          <button
            type="button"
            className={tab === "review" ? "active" : ""}
            onClick={() => setTab("review")}
          >
            1 活動を見る
          </button>
          <button
            type="button"
            className={tab === "write" ? "active" : ""}
            onClick={() => setTab("write")}
          >
            2 振り返る
          </button>
          <button
            type="button"
            className={tab === "comment" ? "active" : ""}
            onClick={() => setTab("comment")}
          >
            3 コメント
            {reflectionRecord?.teacherFeedback?.comment && !reflectionRecord.teacherFeedback.isRead && (
              <span className="unread-dot" aria-label="未読コメントあり" />
            )}
          </button>
        </nav>

        <div className="simple-reflection-body">
          {tab === "review" && (
            <div className="simple-review-layout">
              <section className="simple-timelapse-panel">
                <div className="simple-timelapse-toolbar">
                  <button
                    type="button"
                    disabled={historyEvents.length === 0}
                    onClick={() => {
                      if (playbackPosition >= playbackDuration) onPlaybackPositionChange(0);
                      onPlayingChange(!isPlaying);
                    }}
                  >
                    {isPlaying ? "停止" : "再生"}
                  </button>
                  <button type="button" onClick={() => {
                    onPlayingChange(false);
                    onPlaybackPositionChange(0);
                  }}>
                    最初
                  </button>
                  <select
                    value={playbackSpeed}
                    onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
                  >
                    <option value={60}>ゆっくり</option>
                    <option value={300}>標準</option>
                    <option value={600}>速い</option>
                  </select>
                  <time>{playbackTimestamp ? formatTime(playbackTimestamp) : "履歴なし"}</time>
                </div>

                <input
                  className="simple-timelapse-range"
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

                <div className="simple-timelapse-board">
                  {Object.entries(playbackState.cards || {}).map(([cardId, card]) => {
                    const isFocused = selectedKeypointId &&
                      keypoints.find((event) => event.id === selectedKeypointId)?.cardId === cardId;
                    return (
                      <div
                        key={cardId}
                        className={`card timelapse-card ${isFocused ? "simple-playback-focus" : ""}`}
                        style={{
                          left: card.x,
                          top: card.y,
                          width: card.width || 260,
                          height: card.height || 360,
                          background: card.color || "#fff176",
                          zIndex: card.zIndex || 1
                        }}
                      >
                        <div className="owner-name">{card.ownerName}</div>
                        <div className="timelapse-card-type">{getCardTypeLabel(card.type || "idea")}</div>
                        <div className="drawing-area drawing-area-full">
                          <PlaybackDrawingCanvas segments={playbackState.drawings?.[cardId] || []} />
                        </div>
                      </div>
                    );
                  })}

                  {(playbackState.boardDrawings || []).length > 0 && (
                    <div className="simple-playback-board-drawing" aria-hidden="true">
                      <PlaybackDrawingCanvas segments={playbackState.boardDrawings} />
                    </div>
                  )}

                  {historyEvents.length === 0 && (
                    <div className="reflection-mini-empty">履歴がありません</div>
                  )}
                </div>
              </section>

              <section className="simple-keypoint-panel">
                <div className="simple-keypoint-heading">
                  <h3>活動の目印</h3>
                  <p>選ぶと左の場面へ移動します。</p>
                </div>
                <ActivityKeypointList
                  events={keypoints}
                  selectedEventId={selectedKeypointId}
                  currentPlaybackTimestamp={playbackTimestamp}
                  cardLabelMap={cardLabelMap}
                  getKeypointMeta={getKeypointMeta}
                  getDescription={getDescription}
                  formatTime={formatTime}
                  onSelect={onSelectKeypoint}
                />
              </section>
            </div>
          )}

          {tab === "write" && (
            <ReflectionWritingPanel
              reflectionText={reflectionText}
              onReflectionTextChange={onReflectionTextChange}
              reflectionRecord={reflectionRecord}
              reflectionSubmitting={reflectionSubmitting}
              onSubmit={onSubmitReflection}
              onDelete={onDeleteReflection}
            />
          )}

          {tab === "comment" && (
            <div className="simple-comment-panel">
              <StudentTeacherFeedbackCard
                boardId={boardId}
                userId={currentUserId}
                feedback={reflectionRecord?.teacherFeedback}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
