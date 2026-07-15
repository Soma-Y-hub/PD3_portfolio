export default function AdminPage({
  users,
  currentUserId,
  onAddUser,
  onImportUsers,
  onUpdateUser,
  onDeleteUser,
  onBack
}) {
  return (
    <div className="admin-page">
      <header className="header">
        <div>
          <h1>管理画面</h1>
          <p>ユーザーの追加・編集・削除</p>
        </div>

        <div className="header-buttons">
          <button className="add-button" onClick={onAddUser}>
            ＋ メンバー追加
          </button>

          <label className="csv-button">
            CSVで一括追加
            <input type="file" accept=".csv" onChange={onImportUsers} hidden />
          </label>

          <button className="leave-button" onClick={onBack}>
            戻る
          </button>
        </div>
      </header>

      <div className="csv-guide">
        <strong>CSV形式：</strong>
        <span>name,role,color</span>
        <span>例：山田太郎,student,#fff176</span>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>名前</th>
            <th>権限</th>
            <th>色</th>
            <th>ID</th>
            <th>削除</th>
          </tr>
        </thead>

        <tbody>
          {Object.entries(users).map(([uid, user]) => (
            <tr key={uid}>
              <td>
                <input
                  value={user.name || ""}
                  onChange={(e) => onUpdateUser(uid, { name: e.target.value })}
                />
              </td>

              <td>
                <select
                  value={user.role || "student"}
                  onChange={(e) => onUpdateUser(uid, { role: e.target.value })}
                >
                  <option value="student">学生</option>
                  <option value="admin">管理者</option>
                </select>
              </td>

              <td>
                <input
                  type="color"
                  value={user.color || "#fff176"}
                  onChange={(e) => onUpdateUser(uid, { color: e.target.value })}
                />
              </td>

              <td className="uid-cell">{uid}</td>

              <td>
                <button
                  className="delete-user-button"
                  onClick={() => onDeleteUser(uid)}
                  disabled={uid === currentUserId}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
