import { useMemo, useState } from "react";

function formatSessionDate(value) {
  if (!value) return "日時未設定";

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "object" && value !== null
        ? Number(value.seconds) * 1000
        : Number(value);

  if (!Number.isFinite(numericValue)) return "日時未設定";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(numericValue));
}

export default function ActivitySessionPage({
  projectId,
  sessions,
  loading,
  isAdmin,
  onCreateSession,
  onOpenSession,
  onOpenLegacyBoard,
  onBack,
  onLogout
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");

  const sessionEntries = useMemo(() => {
    return Object.entries(sessions || {}).sort(([, a], [, b]) => {
      return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
    });
  }, [sessions]);

  const submit = async (event) => {
    event.preventDefault();
    await onCreateSession({ title, goal });
    setTitle("");
    setGoal("");
    setCreating(false);
  };

  return (
    <div className="activity-session-page">
      <header className="activity-session-header">
        <div>
          <button type="button" className="session-back-button" onClick={onBack}>
            ← ボード一覧
          </button>
          <h1>{projectId}</h1>
          <p>活動の区切りごとに、使用するボードを選びます。</p>
        </div>

        <button type="button" className="session-logout-button" onClick={onLogout}>
          ログアウト
        </button>
      </header>

      <main className="activity-session-main">
        <section className="session-guide-card">
          <div>
            <span className="session-guide-number">1</span>
            <strong>活動回を選択</strong>
            <p>履歴・タイムラプス・振り返りは活動回ごとに分けて保存されます。</p>
          </div>

          {isAdmin && (
            <button
              type="button"
              className="new-session-button"
              onClick={() => setCreating((current) => !current)}
            >
              ＋ 新しい活動を始める
            </button>
          )}
        </section>

        {creating && (
          <form className="new-session-form" onSubmit={submit}>
            <label>
              活動名
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例：第2回　アイデアを整理する"
                autoFocus
              />
            </label>

            <label>
              今回の目標
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="例：似ている意見をまとめ、次に検討する案を決める"
              />
            </label>

            <div className="new-session-form-actions">
              <button type="button" onClick={() => setCreating(false)}>
                キャンセル
              </button>
              <button type="submit">活動を作成して開く</button>
            </div>
          </form>
        )}

        <section className="session-list-section">
          <div className="session-list-heading">
            <h2>活動一覧</h2>
            <span>{sessionEntries.length}件</span>
          </div>

          {loading && <div className="session-empty">読み込み中です…</div>}

          {!loading && sessionEntries.length === 0 && (
            <div className="session-empty">
              <strong>活動回がまだありません</strong>
              <p>
                管理者が「新しい活動を始める」から最初の活動回を作成してください。
              </p>
            </div>
          )}

          <div className="session-card-list">
            {sessionEntries.map(([id, session], index) => (
              <button
                type="button"
                className="session-card"
                key={id}
                onClick={() => onOpenSession(id, session)}
              >
                <div className="session-card-index">
                  第{sessionEntries.length - index}回
                </div>

                <div className="session-card-content">
                  <div className="session-card-title-row">
                    <strong>{session.title || "名称未設定の活動"}</strong>
                    <span className={`session-status ${session.status || "active"}`}>
                      {session.status === "completed" ? "終了" : "活動中"}
                    </span>
                  </div>

                  {session.goal && (
                    <p className="session-card-goal">目標：{session.goal}</p>
                  )}

                  <small>
                    作成：{formatSessionDate(session.createdAt)}
                    {session.createdByName ? ` ／ ${session.createdByName}` : ""}
                  </small>
                </div>

                <span className="session-card-arrow">›</span>
              </button>
            ))}
          </div>
        </section>

        <section className="legacy-board-section">
          <button type="button" onClick={onOpenLegacyBoard}>
            これまでのボードを開く
          </button>
          <p>
            活動回機能を導入する前のデータを確認するための互換入口です。
          </p>
        </section>
      </main>
    </div>
  );
}
