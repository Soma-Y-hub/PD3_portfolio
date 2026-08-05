import { useMemo, useState } from "react";

function getGroupStatus(group) {
  const control = group?.boardControl || {};
  if (control.currentBoardId) {
    return {
      label: "活動中",
      className: "active",
      detail: `第${Number(control.currentBoardNumber) || Number(control.boardCount) || 1}回`
    };
  }
  if (control.nextBoardId) {
    return {
      label: "次回準備済み",
      className: "draft",
      detail: `第${Number(control.nextBoardNumber) || Number(control.boardCount) || 1}回`
    };
  }
  return {
    label: "未開始",
    className: "empty",
    detail: "選ぶと第1回を開始"
  };
}

export default function GroupSelectionPage({
  currentUser,
  groups,
  opening,
  onSelectGroup,
  onCreateGroup,
  onOpenAdmin,
  onLogout
}) {
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");

  const groupEntries = useMemo(() => {
    return Object.entries(groups || {}).sort(([, a], [, b]) => {
      return String(a?.name || "").localeCompare(
        String(b?.name || ""),
        "ja"
      );
    });
  }, [groups]);

  const submitGroup = async () => {
    await onCreateGroup(groupName);
    setGroupName("");
    setCreating(false);
  };

  return (
    <div className="group-selection-page">
      <header className="group-selection-header">
        <div>
          <h1>活動グループを選ぶ</h1>
          <p>参加するグループを選ぶと、現在の活動ボードが開きます。</p>
        </div>

        <div className="group-selection-header-actions">
          <span>{currentUser.name}</span>
          {currentUser.role === "admin" && (
            <button type="button" onClick={onOpenAdmin}>
              管理
            </button>
          )}
          <button type="button" className="danger" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </header>

      <main className="group-selection-main">
        <div className="group-selection-title-row">
          <div>
            <h2>グループ</h2>
            <p>ボード番号を選ぶ必要はありません。</p>
          </div>

          {currentUser.role === "admin" && (
            <button
              type="button"
              className="group-create-toggle"
              onClick={() => setCreating((current) => !current)}
            >
              ＋ グループを作成
            </button>
          )}
        </div>

        {creating && (
          <section className="group-create-panel">
            <label htmlFor="new-group-name">グループ名</label>
            <div>
              <input
                id="new-group-name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitGroup();
                }}
                placeholder="例：文化祭企画グループ"
                autoFocus
              />
              <button
                type="button"
                disabled={!groupName.trim()}
                onClick={submitGroup}
              >
                作成
              </button>
            </div>
          </section>
        )}

        {groupEntries.length === 0 ? (
          <div className="group-selection-empty">
            <strong>グループがまだありません</strong>
            <p>管理者が最初のグループを作成してください。</p>
          </div>
        ) : (
          <div className="group-card-grid">
            {groupEntries.map(([id, group]) => {
              const status = getGroupStatus(group);
              return (
                <button
                  type="button"
                  key={id}
                  className="group-card-button"
                  disabled={opening}
                  onClick={() => onSelectGroup(id, group)}
                >
                  <div className="group-card-icon" aria-hidden="true">
                    👥
                  </div>
                  <div className="group-card-content">
                    <div className="group-card-heading">
                      <strong>{group?.name || id}</strong>
                      <span className={`group-state ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <p>{status.detail}</p>
                    {group?.isLegacy && (
                      <small>既存ボード：初回選択時にグループへ移行</small>
                    )}
                  </div>
                  <span className="group-card-action">
                    {opening ? "準備中…" : "開く"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
