import { useRef } from "react";

export default function BoardHeader({
  boardId,
  currentUser,
  reflectionRecord,
  historyLoading,
  boardTool,
  onBoardToolChange,
  onClearBoardDrawing,
  onAddCard,
  onUploadMedia,
  onOpenMembers,
  onOpenCards,
  onOpenReflection,
  onExportReflectionCsv,
  onOpenTimelapse,
  onOpenAdmin,
  onLeaveBoard,
  onLogout
}) {
  const cameraInputRef = useRef(null);
  const mediaInputRef = useRef(null);

  return (
    <header className="header tablet-header">
      <div className="header-title-area">
        <h1>PBL思考ボード</h1>
        <p>
          グループ：{boardId} ／ {currentUser.name} ／
          {currentUser.role === "admin" ? "管理者" : "学生"}
        </p>
      </div>

      <div className="header-buttons tablet-toolbar">
        <button className="add-button" onClick={onAddCard}>
          ＋付箋
        </button>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onUploadMedia}
          hidden
        />
        <button className="add-button" onClick={() => cameraInputRef.current?.click()}>
          📷撮影
        </button>

        <input
          ref={mediaInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          onChange={onUploadMedia}
          hidden
        />
        <button className="add-button" onClick={() => mediaInputRef.current?.click()}>
          ＋画像・動画
        </button>

        <div className="board-tool-group" aria-label="ボード描画ツール">
          <button
            className={boardTool === "move" ? "active-button" : ""}
            onClick={() => onBoardToolChange("move")}
          >
            移動
          </button>
          <button
            className={boardTool === "pen" ? "active-button" : ""}
            onClick={() => onBoardToolChange("pen")}
          >
            ✏ペン
          </button>
          <button
            className={boardTool === "eraser" ? "active-button" : ""}
            onClick={() => onBoardToolChange("eraser")}
          >
            消しゴム
          </button>
          <button onClick={onClearBoardDrawing}>全消去</button>
        </div>

        <button onClick={onOpenMembers}>参加者</button>
        <button onClick={onOpenCards}>付箋一覧</button>

        <button className="reflection-button" onClick={onOpenReflection}>
          {reflectionRecord ? "振り返りを開く" : "振り返り"}
        </button>

        {currentUser.role === "admin" && (
          <>
            <button onClick={onExportReflectionCsv}>CSV</button>
            <button onClick={onOpenTimelapse} disabled={historyLoading}>
              {historyLoading ? "読込中…" : "履歴"}
            </button>
            <button className="admin-button" onClick={onOpenAdmin}>
              管理
            </button>
          </>
        )}

        <button className="leave-button" onClick={onLeaveBoard}>退出</button>
        <button className="leave-button" onClick={onLogout}>ログアウト</button>
      </div>
    </header>
  );
}
