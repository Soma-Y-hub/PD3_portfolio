import { useState } from "react";
import AdminReflectionOverview from "./feedback/AdminReflectionOverview";

function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function downloadCredentials(credentials) {
  const rows = [
    ["ユーザーID", "ログインコード", "ユーザー名"],
    ...credentials.map(({ loginId, loginCode, name }) => [loginId, loginCode, name])
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "school-login-credentials.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage({ users, boards, boardsLoading, boardsError, currentUserId, currentUser, onImportUsers, onUpdateUser, onDeleteUser, onSaveLogin, onBack }) {
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [credentialRows, setCredentialRows] = useState([]);
  const [activeSection, setActiveSection] = useState("users");

  const openEditor = (uid) => {
    const user = users[uid] || {};
    setEditor({
      ...(uid ? { uid } : {}),
      name: user.name || "",
      role: user.role || "student",
      color: user.color || "#fff176"
    });
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const credentials = await onSaveLogin(editor);
      if (credentials?.loginId && credentials?.loginCode) {
        setCredentialRows([credentials]);
        setEditor(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const importCsv = async (event) => {
    setImporting(true);
    try {
      const credentials = await onImportUsers(event);
      if (Array.isArray(credentials) && credentials.length > 0) setCredentialRows(credentials);
    } finally {
      setImporting(false);
    }
  };

  const editField = (key, value) => setEditor((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="admin-page">
      <header className="header">
        <div><h1>管理画面</h1><p>{activeSection === "users" ? "ユーザーID・ログインコードの管理" : "各回の提出された振り返りをまとめて管理"}</p></div>
        <div className="header-buttons">
          {activeSection === "users" && <>
            <button type="button" className="add-button" onClick={() => openEditor()}>＋ メンバー追加</button>
            <label className="csv-button">
              {importing ? "登録中…" : "名前だけのCSVから一括登録"}
              <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={importing} hidden />
            </label>
          </>}
          <button type="button" className="leave-button" onClick={onBack}>戻る</button>
        </div>
      </header>

      <nav className="admin-section-tabs" aria-label="管理画面の種類">
        <button
          type="button"
          className={activeSection === "users" ? "active" : ""}
          aria-current={activeSection === "users" ? "page" : undefined}
          onClick={() => setActiveSection("users")}
        >ユーザー管理</button>
        <button
          type="button"
          className={activeSection === "reflections" ? "active" : ""}
          aria-current={activeSection === "reflections" ? "page" : undefined}
          onClick={() => setActiveSection("reflections")}
        >振り返り管理</button>
      </nav>

      {activeSection === "reflections" && (
        <AdminReflectionOverview
          boards={boards}
          loading={boardsLoading}
          error={boardsError}
          users={users}
          currentUserId={currentUserId}
          currentUser={currentUser}
        />
      )}

      {activeSection === "users" && <>
      <div className="csv-guide">
        <strong>CSV形式：</strong><code>name</code> の1列だけにしてください。見出しは「name」「名前」「ユーザー名」に対応します。
        <span>CSVから追加したユーザーは学生として登録されます。管理者を追加する場合は「メンバー追加」で権限を選んでください。</span>
      </div>

      {credentialRows.length > 0 && (
        <section className="csv-guide" aria-live="polite">
          <strong>発行したログイン情報（今回限り表示）</strong>
          <p>コードはデータベースには平文保存されません。この画面を離れる前に、安全な方法で本人へ配布してください。</p>
          <div className="header-buttons">
            <button type="button" onClick={() => downloadCredentials(credentialRows)}>ログイン情報をCSVでダウンロード</button>
            <button type="button" onClick={() => setCredentialRows([])}>表示を消す</button>
          </div>
          <table className="admin-table">
            <thead><tr><th>名前</th><th>ユーザーID</th><th>ログインコード</th></tr></thead>
            <tbody>{credentialRows.map((credential) => (
              <tr key={`${credential.uid}-${credential.loginId}`}>
                <td>{credential.name || users[credential.uid]?.name || ""}</td>
                <td>{credential.loginId}</td>
                <td><code>{credential.loginCode}</code></td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {editor && <form className="school-user-form" onSubmit={save}>
        <h2>{editor.uid ? "ログインコード再発行" : "メンバー登録"}</h2>
        <p>ユーザーID（8桁）とログインコード（英数字24文字）を自動で発行します。</p>
        <label>表示名<input required maxLength={100} disabled={saving} value={editor.name} onChange={(event) => editField("name", event.target.value)} /></label>
        <label>権限<select value={editor.role} disabled={saving || editor.uid === currentUserId} onChange={(event) => editField("role", event.target.value)}>
          <option value="student">学生</option><option value="admin">管理者</option>
        </select></label>
        <button disabled={saving} type="submit">{saving ? "登録中…" : "登録してログイン情報を発行"}</button>
        <button disabled={saving} type="button" onClick={() => setEditor(null)}>キャンセル</button>
      </form>}

      <table className="admin-table">
        <thead><tr><th>名前</th><th>権限</th><th>色</th><th>ユーザーID</th><th>内部ID（移行用）</th><th>ログイン情報</th><th>利用状態</th></tr></thead>
        <tbody>{Object.entries(users).map(([uid, user]) => <tr key={uid}>
          <td><input defaultValue={user.name || ""} onBlur={(event) => {
            if (event.target.value.trim() && event.target.value !== user.name) onUpdateUser(uid, { name: event.target.value.trim() });
          }} /></td>
          <td><select value={user.role || "student"} disabled={uid === currentUserId} onChange={(event) => onUpdateUser(uid, { role: event.target.value })}>
            <option value="student">学生</option><option value="admin">管理者</option>
          </select></td>
          <td><input type="color" value={user.color || "#fff176"} onChange={(event) => onUpdateUser(uid, { color: event.target.value })} /></td>
          <td>{user.loginId || "未設定"}</td><td className="uid-cell">{uid}</td>
          <td><button type="button" onClick={() => openEditor(uid)}>コード再発行</button></td>
          <td><button type="button" disabled={uid === currentUserId || user.disabled} onClick={() => onDeleteUser(uid)}>{user.disabled ? "無効" : "無効化"}</button></td>
        </tr>)}</tbody>
      </table>
      </>}
    </div>
  );
}
