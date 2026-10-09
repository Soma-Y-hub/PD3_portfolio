import BoardDrawingCanvas from "./BoardDrawingCanvas";
import BoardCard from "./BoardCard";
import BoardMediaItem from "./BoardMediaItem";
import MemberPanel from "./MemberPanel";
import StickyNoteList from "./StickyNoteList";

export default function BoardWorkspace({
  boardRef,
  boardCanvasRef,
  boardIsLocked,
  zoom,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  cards,
  mediaItems,
  currentUserId,
  currentUser,
  focusedCardId,
  onFocusCard,
  cardMenuId,
  onCardMenuChange,
  boardTool,
  cardDrawingTool,
  onCardDrawingToolChange,
  boardId,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onChangeCardLayer,
  onDeleteCard,
  onChangeCardType,
  onClearCardDrawing,
  onStartDrawOnCard,
  onDrawOnCard,
  onStopDrawOnCard,
  onEraseCardStroke,
  onStartResizeCard,
  onMoveResizeCard,
  onEndResizeCard,
  onMediaPointerDown,
  onMediaPointerMove,
  onMediaPointerUp,
  onToggleMediaReflectionPoint,
  onDeleteMedia,
  onVideoPlayed,
  onStartResizeMedia,
  onMoveResizeMedia,
  onEndResizeMedia,
  sidePanelOpen,
  sidePanelMode,
  onCloseSidePanel,
  members,
  onSelectCardFromList
}) {
  return (
    <main className="layout">
      <section className={`board ${boardIsLocked ? "board-read-only" : ""}`}>
        <div className="board-scroll" ref={boardRef}>
          <div className="zoom-controls">
            <button type="button" onClick={onZoomOut} aria-label="縮小">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={onZoomIn} aria-label="拡大">＋</button>
            <button type="button" onClick={onResetZoom}>100%</button>
            <small>2本指で拡大縮小</small>
          </div>

          <div
            ref={boardCanvasRef}
            className={`board-canvas ${boardIsLocked ? "board-canvas-read-only" : ""}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          >
            {Object.entries(cards).map(([id, card]) => (
              <BoardCard
                key={id}
                id={id}
                card={card}
                boardId={boardId}
                currentUserId={currentUserId}
                currentUser={currentUser}
                focused={focusedCardId === id}
                menuOpen={cardMenuId === id}
                boardTool={boardTool}
                cardDrawingTool={cardDrawingTool}
                readOnly={boardIsLocked}
                onFocus={(cardId) => {
                  onFocusCard(cardId);
                  onCardMenuChange(null);
                }}
                onMenuChange={onCardMenuChange}
                onPointerDown={onCardPointerDown}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onChangeLayer={onChangeCardLayer}
                onDelete={onDeleteCard}
                onChangeType={onChangeCardType}
                onDrawingToolChange={onCardDrawingToolChange}
                onClearDrawing={onClearCardDrawing}
                onStartDraw={onStartDrawOnCard}
                onDraw={onDrawOnCard}
                onStopDraw={onStopDrawOnCard}
                onEraseStroke={onEraseCardStroke}
                onStartResize={onStartResizeCard}
                onMoveResize={onMoveResizeCard}
                onEndResize={onEndResizeCard}
              />
            ))}

            {Object.entries(mediaItems)
              .filter(([, media]) => !media.deleted)
              .map(([mediaId, media]) => (
                <BoardMediaItem
                  key={mediaId}
                  mediaId={mediaId}
                  media={media}
                  readOnly={boardIsLocked}
                  onPointerDown={onMediaPointerDown}
                  onPointerMove={onMediaPointerMove}
                  onPointerUp={onMediaPointerUp}
                  onToggleReflectionPoint={onToggleMediaReflectionPoint}
                  onDelete={onDeleteMedia}
                  onVideoPlayed={onVideoPlayed}
                  onStartResize={onStartResizeMedia}
                  onMoveResize={onMoveResizeMedia}
                  onEndResize={onEndResizeMedia}
                />
              ))}

            <BoardDrawingCanvas
              boardId={boardId}
              currentUserId={currentUserId}
              currentUser={currentUser}
              tool={boardTool}
              disabled={boardIsLocked}
            />
          </div>
        </div>
      </section>

      {sidePanelOpen && (
        <aside className="side-panel tablet-side-panel">
          <div className="side-panel-header">
            <h2>{sidePanelMode === "members" ? "参加中のユーザー" : "付箋一覧"}</h2>
            <button type="button" onClick={onCloseSidePanel}>×</button>
          </div>
          {sidePanelMode === "members" && <MemberPanel members={members} />}
          {sidePanelMode === "cards" && (
            <StickyNoteList
              cards={cards}
              selectedCardId={focusedCardId}
              onSelect={onSelectCardFromList}
            />
          )}
        </aside>
      )}
    </main>
  );
}
