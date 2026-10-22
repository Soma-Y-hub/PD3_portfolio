import { useMemo, useState } from "react";
import {
  deleteReflection,
  deleteTeacherFeedback,
  saveTeacherFeedback
} from "../../services/feedbackService";
import "./admin-reflection-overview.css";

function toMillis(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const timestamp = toMillis(value);
  if (!timestamp) return "日時未記録";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function ReflectionItem({ boardId, reflection, currentUserId, currentUser, onDelete }) {
  const [comment, setComment] = useState(reflection.teacherFeedback?.comment || "");
  const [saving, setSaving] = useState(false);

  const saveComment = async () => {
    setSaving(true);
    try {
      if (comment.trim()) {
        await saveTeacherFeedback({
          boardId,
          userId: reflection.userId,
          teacherId: currentUserId,
          teacherName: currentUser?.name || "管理者",
          comment
        });
        alert("コメントを保存しました");
      } else if (reflection.teacherFeedback?.comment) {
        await deleteTeacherFeedback({ boardId, userId: reflection.userId });
        alert("コメントを削除しました");
      }
    } catch (error) {
      console.error("先生のコメントを保存できませんでした", error);
      alert(error?.message || "コメントを保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="admin-reflection-entry">
      <div className="admin-reflection-entry-heading">
        <div>
          <h3>{reflection.userName || reflection.userId}</h3>
          <time>{formatDate(reflection.submittedAtClient || reflection.submittedAt)}</time>
        </div>
      </div>
      <div className="admin-reflection-answer">
        <strong>生徒の振り返り</strong>
        <p>{reflection.responseText}</p>
      </div>
      <label className="admin-reflection-comment-field">
        <span>先生からのコメント</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
          placeholder="振り返りへのコメントを入力"
          disabled={saving}
        />
      </label>
      <div className="admin-reflection-entry-actions">
        <button type="button" onClick={saveComment} disabled={saving}>
          {saving ? "保存中…" : reflection.teacherFeedback?.comment ? "コメントを更新" : "コメントを保存"}
        </button>
        <button
          type="button"
          className="admin-reflection-delete"
          disabled={saving}
          onClick={() => onDelete(boardId, reflection)}
        >
          振り返りを削除
        </button>
      </div>
    </article>
  );
}

export default function AdminReflectionOverview({ boards, loading = false, error = "", users, currentUserId, currentUser }) {
  const [groupFilter, setGroupFilter] = useState("all");
  const [search, setSearch] = useState("");

  const sessions = useMemo(() => Object.entries(boards || {}).map(([boardId, board]) => {
    const meta = board?.meta || {};
    const reflections = Object.entries(board?.reflections || {})
      .map(([userId, reflection]) => ({
        userId,
        ...(reflection || {}),
        userName: reflection?.userName || users?.[userId]?.name || userId
      }))
      .filter((reflection) => String(reflection.responseText || "").trim());
    return {
      boardId,
      meta,
      groupId: meta.groupId || meta.groupName || "legacy",
      groupName: meta.groupName || meta.groupId || "旧ボード",
      number: Number(meta.number) || 1,
      title: meta.title || `第${Number(meta.number) || 1}回の活動`,
      timestamp: toMillis(meta.endedAt || meta.submittedAt || meta.startedAt || meta.createdAt),
      reflections
    };
  }).filter((session) => session.reflections.length > 0)
    .sort((a, b) => b.timestamp - a.timestamp || b.number - a.number), [boards, users]);

  const groups = useMemo(() => {
    const byId = new Map();
    for (const session of sessions) byId.set(session.groupId, session.groupName);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ja");
    return sessions.map((session) => ({
      ...session,
      reflections: session.reflections.filter((reflection) => {
        const matchesSearch = !term || [
          reflection.userName,
          reflection.responseText,
          reflection.teacherFeedback?.comment
        ].some((value) => String(value || "").toLocaleLowerCase("ja").includes(term));
        return matchesSearch;
      })
    })).filter((session) => session.reflections.length > 0)
      .filter((session) => groupFilter === "all" || session.groupId === groupFilter);
  }, [sessions, search, groupFilter]);

  const reflectionCount = filteredSessions.reduce((total, session) => total + session.reflections.length, 0);

  const handleDelete = async (boardId, reflection) => {
    if (!window.confirm(`${reflection.userName}さんの振り返りと先生コメントを削除しますか？`)) return;
    try {
      await deleteReflection({ boardId, userId: reflection.userId });
    } catch (error) {
      console.error("振り返りを削除できませんでした", error);
      alert(error?.message || "振り返りを削除できませんでした");
    }
  };

  return (
    <section className="admin-reflection-overview">
      <div className="admin-reflection-overview-heading">
        <div>
          <h2>各回の提出された振り返り</h2>
          <p>ボードを開かずに、活動回ごとの振り返り確認と先生コメントの管理ができます。</p>
        </div>
        <strong>{filteredSessions.length}回 ／ {reflectionCount}件</strong>
      </div>

      <div className="admin-reflection-filters">
        <label>
          グループ
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="all">すべて</option>
            {groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="admin-reflection-search">
          名前・本文で検索
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="生徒名やキーワード" />
        </label>
      </div>

      {loading ? (
        <div className="admin-reflection-empty" role="status">振り返りを読み込んでいます…</div>
      ) : error ? (
        <div className="admin-reflection-empty admin-reflection-error" role="alert">
          振り返りを読み込めませんでした。<br />{error}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="admin-reflection-empty">条件に合う提出済みの振り返りはありません。</div>
      ) : (
        <div className="admin-reflection-session-list">
          {filteredSessions.map((session) => (
            <details className="admin-reflection-session" key={session.boardId} open>
              <summary>
                <span>
                  <strong>{session.groupName}・第{session.number}回</strong>
                  <small>{session.title} ／ {formatDate(session.timestamp)}</small>
                </span>
                <span className="admin-reflection-count">振り返り {session.reflections.length}件</span>
              </summary>
              <div className="admin-reflection-session-entries">
                {session.reflections.map((reflection) => (
                  <ReflectionItem
                    key={`${session.boardId}-${reflection.userId}`}
                    boardId={session.boardId}
                    reflection={reflection}
                    currentUserId={currentUserId}
                    currentUser={currentUser}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
