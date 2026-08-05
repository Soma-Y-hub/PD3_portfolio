import { useRef } from "react";

export default function BoardHeader({
  boardId,
  currentUser,
  reflectionRecord,
  boardTool,
  onBoardToolChange,
  onClearBoardDrawing,
  onAddCard,
  onUploadMedia,
  onOpenMembers,
  onOpenCards,
  onOpenReflection,
  onExportReflectionCsv,
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
        <div className="toolbar-group toolbar-create" aria-label="追加">
          <span className="toolbar-group-label">追加</span>
          <button className="add-button" onClick={onAddCard}>＋付箋</button>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onUploadMedia}
          hidden
        />
          <button className="add-button" onClick={() => cameraInputRef.current?.click()}>📷撮影</button>

        <input
          ref={mediaInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          onChange={onUploadMedia}
          hidden
        />
          <button className="add-button" onClick={() => mediaInputRef.current?.click()}>＋画像・動画</button>
        </div>

        <div className="board-tool-group" aria-label="書き込み先を選ぶ">
          <span className="toolbar-group-label">書き込み先</span>
          <button
            className={boardTool === "move" ? "active-button" : ""}
            onClick={() => onBoardToolChange("move")}
          >
            付箋を操作
          </button>
          <button
            className={boardTool === "pen" ? "active-button" : ""}
            onClick={() => onBoardToolChange("pen")}
          >
            ボードに書く
          </button>
          {boardTool !== "move" && (
            <>
              <button
                className={boardTool === "eraser" ? "active-button" : ""}
                onClick={() => onBoardToolChange("eraser")}
              >
                消しゴム
              </button>
              <button onClick={onClearBoardDrawing}>ボードを全消去</button>
            </>
          )}
        </div>

        <div className="toolbar-group" aria-label="表示">
          <span className="toolbar-group-label">表示</span>
          <button onClick={onOpenMembers}>参加者</button>
          <button onClick={onOpenCards}>付箋一覧</button>
        </div>

        <button className="reflection-button" onClick={onOpenReflection}>
          {reflectionRecord ? "活動履歴・振り返り" : "活動履歴・振り返り"}
        </button>

        {currentUser.role === "admin" && (
          <>
            <button onClick={onExportReflectionCsv}>CSV</button>
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
