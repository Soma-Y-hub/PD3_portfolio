export default function BoardSelectionPage({
  currentUser,
  boardInput,
  allBoards,
  onBoardInputChange,
  onJoinBoard,
  onOpenAdmin,
  onEnterBoard,
  onLogout
}) {
  return (
    <div className="login-page">
      <div className="login-card group-card">
        <h1>PBL思考ボード</h1>

        <p>ユーザー：{currentUser.name}</p>
        <p>権限：{currentUser.role === "admin" ? "管理者" : "学生"}</p>

        <input
          value={boardInput}
          onChange={(e) => onBoardInputChange(e.target.value)}
          placeholder="グループ名"
        />

        <button onClick={onJoinBoard}>ホワイトボードに参加</button>

        {currentUser.role === "admin" && (
          <>
            <button className="admin-button" onClick={onOpenAdmin}>
              管理画面
            </button>

            <div className="group-list">
              <h2>現在開いているグループ</h2>

              {Object.entries(allBoards).length === 0 && (
                <p className="empty-text">開いているグループはありません</p>
              )}

              {Object.entries(allBoards).map(([groupName, board]) => {
                const onlineMembers = Object.values(board.members || {}).filter(
                  (member) => member.status === "online"
                );

                if (onlineMembers.length === 0) return null;

                return (
                  <div className="group-item" key={groupName}>
                    <div>
                      <strong>{groupName}</strong>
                      <p>{onlineMembers.length}人参加中</p>
                    </div>

                    <button onClick={() => onEnterBoard(groupName)}>
                      入る
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <button onClick={onLogout}>ログアウト</button>
      </div>
    </div>
  );
}
