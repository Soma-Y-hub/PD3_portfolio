import { useRef } from "react";

export default function BoardHeader({
  boardId,
  currentUser,
  connectMode,
  reflectionRecord,
  historyLoading,
  onAddCard,
  onUploadMedia,
  onToggleConnectMode,
  onOpenMembers,
  onOpenCards,
  onOpenConnections,
  onOpenReflection,
  onExportReflectionCsv,
  onOpenTimelapse,
  onOpenAdmin,
  onLeaveBoard,
  onLogout
}) {
  const mediaInputRef = useRef(null);

  const openMediaPicker = () => {
    mediaInputRef.current?.click();
  };

  return (
    <header className="header">
      <div>
        <h1>PBL思考ボード</h1>
        <p>
          グループ：{boardId} ／ ユーザー：{currentUser.name} ／ 権限：
          {currentUser.role === "admin" ? "管理者" : "学生"}
        </p>
      </div>

      <div className="header-buttons">
        <button className="add-button" onClick={onAddCard}>
          ＋ 付箋追加
        </button>

        <input
          ref={mediaInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          onChange={onUploadMedia}
          hidden
        />

        <button className="add-button" onClick={openMediaPicker}>
          ＋ 画像・動画
        </button>

        <button
          className={connectMode ? "active-button" : ""}
          onClick={onToggleConnectMode}
        >
          {connectMode ? "矢印ON" : "矢印OFF"}
        </button>

        <button onClick={onOpenMembers}>参加者</button>
        <button onClick={onOpenCards}>付箋一覧</button>
        <button onClick={onOpenConnections}>矢印一覧</button>

        <button className="reflection-button" onClick={onOpenReflection}>
          {reflectionRecord ? "振り返りを編集" : "振り返り"}
        </button>

        {currentUser.role === "admin" && (
          <>
            <button onClick={onExportReflectionCsv}>振り返りCSV</button>
            <button onClick={onOpenTimelapse} disabled={historyLoading}>
              {historyLoading ? "読み込み中…" : "詳細履歴"}
            </button>
            <button className="admin-button" onClick={onOpenAdmin}>
              管理画面
            </button>
          </>
        )}

        <button className="leave-button" onClick={onLeaveBoard}>退出</button>
        <button className="leave-button" onClick={onLogout}>ログアウト</button>
      </div>
    </header>
  );
}
