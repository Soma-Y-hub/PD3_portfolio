export default function BoardMediaItem({
  mediaId,
  media,
  readOnly,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onToggleReflectionPoint,
  onDelete,
  onVideoPlayed,
  onStartResize,
  onMoveResize,
  onEndResize
}) {
  const parsedX = Number(media.x);
  const parsedY = Number(media.y);
  const x = Number.isFinite(parsedX) ? parsedX : 150;
  const y = Number.isFinite(parsedY) ? parsedY : 150;
  const width = Number(media.width) || 500;
  const height = Number(media.height) || 300;

  return (
    <div
      className={`board-media-item ${media.isReflectionPoint ? "is-reflection-point" : ""}`}
      style={{ left: x, top: y, width, height, zIndex: Number(media.zIndex) || 5 }}
    >
      {!readOnly && (
        <div
          className="board-media-drag-handle"
          title="ドラッグして移動"
          onPointerDown={(event) => onPointerDown(event, mediaId, media)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span>移動</span>
        </div>
      )}

      {!readOnly && (
        <button
          type="button"
          className={`media-reflection-button ${media.isReflectionPoint ? "active" : ""}`}
          title={media.isReflectionPoint ? "振り返りポイントを解除" : "振り返りポイントに指定"}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => onToggleReflectionPoint(event, mediaId, media)}
        >
          {media.isReflectionPoint ? "★ 振り返り" : "☆ 振り返り"}
        </button>
      )}

      {!readOnly && (
        <button
          type="button"
          className="board-media-delete-button"
          title="メディアを削除"
          aria-label={`${media.fileName || "メディア"}を削除`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => onDelete(event, mediaId, media)}
        >
          ×
        </button>
      )}

      {media.type === "image" ? (
        <img src={media.url} alt={media.fileName || "アップロード画像"} draggable={false} />
      ) : (
        <video
          src={media.url}
          controls
          preload="metadata"
          onPlay={() => onVideoPlayed(mediaId, media)}
        >
          お使いのブラウザでは動画を再生できません。
        </video>
      )}

      <div className="board-media-caption">
        {media.fileName || "メディア"}
        {media.isReflectionPoint && media.reflectionReason && (
          <small>{media.reflectionReason}</small>
        )}
      </div>

      {!readOnly && (
        <div
          className="board-media-resize-handle"
          title="ドラッグしてサイズ変更"
          onPointerDown={(event) => onStartResize(event, mediaId, media)}
          onPointerMove={onMoveResize}
          onPointerUp={onEndResize}
          onPointerCancel={onEndResize}
        />
      )}
    </div>
  );
}
