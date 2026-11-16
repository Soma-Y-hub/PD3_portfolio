import { useRef } from "react";

export default function BoardHeader({
  boardId,
  readOnly = false,
  currentUser,
  boardTool,
  onBoardToolChange,
  onClearBoardDrawing,
  onAddCard,
  onUploadMedia,
  onOpenArchives,
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
        <button
          type="button"
          className="board-archive-shortcut"
          onClick={onOpenArchives}
          title="閲覧できる終了済みボードを開きます"
        >
          過去のボード
        </button>

        <fieldset disabled={readOnly} className="toolbar-group toolbar-create school-toolbar-fieldset" aria-label="追加">
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
          <button
            type="button"
            className={boardTool === "crop" ? "active-button" : ""}
            aria-pressed={boardTool === "crop"}
            onClick={() => onBoardToolChange(boardTool === "crop" ? "move" : "crop")}
          >
            ✂ トリミング
          </button>
          {boardTool === "crop" && (
            <span className="image-crop-tool-hint" role="status">ボード上の画像を選択してください</span>
          )}
        </fieldset>

        <fieldset disabled={readOnly} className="board-tool-group school-toolbar-fieldset" aria-label="書き込み先を選ぶ">
          <span className="toolbar-group-label">書き込み先</span>
          <button
            className={boardTool === "move" ? "active-button" : ""}
            onClick={() => onBoardToolChange("move")}
          >
            付箋を操作
          </button>
          <button
            className={boardTool === "arrow" ? "active-button" : ""}
            onClick={() => onBoardToolChange("arrow")}
            title="付箋の上から別の付箋までドラッグして、手書き矢印でつなぎます"
          >
            付箋を矢印でつなぐ
          </button>
          <button
            type="button"
            className={boardTool === "arrow-erase" ? "active-button" : ""}
            onClick={() => onBoardToolChange("arrow-erase")}
            title="消したい矢印の線をクリックまたはタップしてください"
          >
            矢印を消す
          </button>
          {boardTool === "arrow-erase" && (
            <span className="arrow-tool-hint">矢印の線を押すと1本削除</span>
          )}
          {boardTool === "arrow" && (
            <span className="arrow-tool-hint">付箋から別の付箋までドラッグ</span>
          )}
          {boardTool === "eraser" && (
            <span className="arrow-tool-hint">消したい矢印をクリック</span>
          )}
          <button
            className={boardTool === "pen" ? "active-button" : ""}
            onClick={() => onBoardToolChange("pen")}
          >
            ボードに書く
          </button>
          {boardTool !== "move" && boardTool !== "crop" && (
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
        </fieldset>

        <button className="reflection-button" onClick={onOpenReflection}>
          {readOnly ? "タイムラプスを見る" : "活動履歴・振り返り"}
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
