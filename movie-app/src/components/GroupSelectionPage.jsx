import { useEffect, useMemo, useState } from "react";
import { PRESENCE_STALE_MS } from "../constants/appConstants";

function getOnlineCount(group, now) {
  return Object.values(group?.presence || {}).filter((presence) => {
    if (presence?.status !== "online") return false;
    const lastActive = Number(presence?.lastActive) || 0;
    return lastActive > 0 && now - lastActive <= PRESENCE_STALE_MS;
  }).length;
}

function getGroupStatus(group, now) {
  const control = group?.boardControl || {};
  const onlineCount = getOnlineCount(group, now);

  if (onlineCount > 0) {
    return {
      label: "活動中",
      className: "active",
      detail: `第${Number(control.currentBoardNumber) || Number(control.boardCount) || 1}回・${onlineCount}人がオンライン`
    };
  }

  if (control.currentStatus === "submitted") {
    return {
      label: "先生の確認待ち",
      className: "submitted",
      detail: `第${Number(control.currentBoardNumber) || 1}回`
    };
  }

  if (control.currentBoardId) {
    return {
      label: "待機中",
      className: "waiting",
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
    detail: "選択すると第1回を開始"
  };
}

export default function GroupSelectionPage({
  currentUser,
  groups,
  opening,
  onSelectGroup,
  onOpenAdmin,
  onLogout
}) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const groupEntries = useMemo(() => {
    return Object.entries(groups || {}).sort(([idA], [idB]) => {
      return Number(idA.replace(/\D/g, "")) - Number(idB.replace(/\D/g, ""));
    });
  }, [groups]);

  return (
    <div className="group-selection-page">
      <header className="group-selection-header">
        <div>
          <h1>グループを選ぶ</h1>
          <p>G1〜G10から参加するグループを選択してください。</p>
        </div>

        <div className="group-selection-header-actions">
          <span>{currentUser.name}</span>
          {currentUser.role === "admin" && (
            <button type="button" onClick={onOpenAdmin}>管理</button>
          )}
          <button type="button" className="danger" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </header>

      <main className="group-selection-main">
        <div className="group-selection-title-row">
          <div>
            <h2>活動グループ</h2>
            <p>管理者が先に入室していなくても、生徒が選択するとボードが準備されます。</p>
          </div>
        </div>

        <div className="group-card-grid">
          {groupEntries.map(([id, group]) => {
            const status = getGroupStatus(group, now);
            return (
              <button
                type="button"
                key={id}
                className="group-card-button"
                disabled={opening}
                onClick={() => onSelectGroup(id, group)}
              >
                <div className="group-card-icon" aria-hidden="true">👥</div>
                <div className="group-card-content">
                  <div className="group-card-heading">
                    <strong>{group?.name || id}</strong>
                    <span className={`group-state ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <p>{status.detail}</p>
                </div>
                <span className="group-card-action">
                  {opening ? "準備中…" : "開く"}
                </span>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
