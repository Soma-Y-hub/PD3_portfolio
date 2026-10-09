import RealtimeDrawingCanvas from "../RealtimeDrawingCanvas";
import CardMenu from "./CardMenu";

export default function BoardCard({
  id,
  card,
  boardId,
  currentUserId,
  currentUser,
  focused,
  menuOpen,
  boardTool,
  cardDrawingTool,
  readOnly,
  onFocus,
  onMenuChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onChangeLayer,
  onDelete,
  onChangeType,
  onDrawingToolChange,
  onClearDrawing,
  onStartDraw,
  onDraw,
  onStopDraw,
  onEraseStroke,
  onStartResize,
  onMoveResize,
  onEndResize
}) {
  const isOwner = card.owner === currentUserId;
  const isAdmin = currentUser?.role === "admin";
  const canManage = !readOnly && (isOwner || isAdmin);
  const canDraw = canManage && boardTool === "move";

  return (
    <div
      className={`card ${isOwner ? "my-card" : "other-card"} ${focused ? "card-focus-highlight" : ""}`}
      style={{
        left: Number(card.x) || 0,
        top: Number(card.y) || 0,
        width: Number(card.width) || 260,
        height: Number(card.height) || 360,
        background: card.color || "#fff176",
        zIndex: Number(card.zIndex) || 1
      }}
      onClick={() => onFocus(id)}
      onPointerDown={(event) => onPointerDown(event, id, card)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {canManage && (
        <CardMenu
          open={menuOpen}
          onToggle={() => onMenuChange(menuOpen ? null : id)}
          onBringToFront={() => onChangeLayer(id, "front")}
          onSendToBack={() => onChangeLayer(id, "back")}
          onDelete={() => onDelete(id, card)}
        />
      )}

      {!isOwner && <div className="lock-label">他の人</div>}

      <div className="card-header-row">
        <div className="owner-name" title={card.ownerName || "名前なし"}>
          {card.ownerName || "名前なし"}
        </div>
        <select
          className="card-type-select"
          aria-label="付箋の種類"
          disabled={!canManage}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          value={card.type || "idea"}
          onChange={(event) => onChangeType(id, card, event.target.value)}
        >
          <option value="idea">アイデア</option>
          <option value="problem">課題</option>
          <option value="reason">理由</option>
          <option value="solution">解決案</option>
          <option value="evidence">根拠</option>
        </select>
      </div>

      <div
        className={`drawing-area drawing-area-full ${boardTool !== "move" || readOnly ? "drawing-area-disabled" : ""}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawing-toolbar">
          <span>{readOnly ? "閲覧専用" : boardTool === "move" ? "この付箋に書く" : "ボードへの書き込み中"}</span>
          <div className="card-drawing-tools">
            <button
              type="button"
              className={cardDrawingTool === "pen" ? "active" : ""}
              disabled={!canDraw}
              onClick={(event) => {
                event.stopPropagation();
                onDrawingToolChange("pen");
              }}
            >
              ペン
            </button>
            <button
              type="button"
              className={cardDrawingTool === "eraser" ? "active" : ""}
              disabled={!canDraw}
              onClick={(event) => {
                event.stopPropagation();
                onDrawingToolChange("eraser");
              }}
            >
              消しゴム
            </button>
            <button
              type="button"
              disabled={!canDraw}
              onClick={(event) => onClearDrawing(event, id, canDraw)}
            >
              全消去
            </button>
          </div>
        </div>
        <RealtimeDrawingCanvas
          boardId={boardId}
          cardId={id}
          canEdit={canDraw}
          tool={cardDrawingTool}
          startDrawOnCard={onStartDraw}
          drawOnCard={onDraw}
          stopDrawOnCard={onStopDraw}
          onEraseStroke={onEraseStroke}
        />
      </div>

      {canManage && (
        <div
          className="resize-handle"
          onPointerDown={(event) => onStartResize(event, id, card)}
          onPointerMove={onMoveResize}
          onPointerUp={onEndResize}
          onPointerCancel={onEndResize}
        />
      )}
    </div>
  );
}
