import { useEffect, useMemo, useState } from "react";

const ONLINE_LIMIT_MS = 45_000;
const AWAY_LIMIT_MS = 120_000;

function getPresence(member, now) {
  const lastActive = Number(member?.lastActive || 0);
  const age = lastActive > 0 ? now - lastActive : Number.POSITIVE_INFINITY;

  if (member?.status === "online" && age <= ONLINE_LIMIT_MS) {
    return { key: "online", label: "オンライン" };
  }
  if ((member?.status === "online" || member?.status === "away") && age <= AWAY_LIMIT_MS) {
    return { key: "away", label: "一時離席" };
  }
  return { key: "offline", label: "オフライン" };
}

export default function MemberPanel({ members }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const entries = useMemo(() => {
    return Object.entries(members || {})
      .map(([userId, member]) => ({
        userId,
        member,
        presence: getPresence(member, now)
      }))
      .sort((a, b) => {
        const rank = { online: 0, away: 1, offline: 2 };
        return rank[a.presence.key] - rank[b.presence.key] ||
          String(a.member?.name || "").localeCompare(String(b.member?.name || ""), "ja");
      });
  }, [members, now]);

  if (entries.length === 0) {
    return <p className="side-panel-empty">参加者はいません。</p>;
  }

  return (
    <div className="member-presence-list">
      {entries.map(({ userId, member, presence }) => (
        <article className="member-presence-item" key={userId}>
          <span className={`presence-dot ${presence.key}`} aria-hidden="true" />
          <div className="member-presence-copy">
            <strong>{member?.name || userId}</strong>
            <small>{member?.role === "admin" ? "管理者" : "学生"}</small>
          </div>
          <span className={`presence-label ${presence.key}`}>{presence.label}</span>
        </article>
      ))}
    </div>
  );
}
