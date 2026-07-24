import { useEffect, useMemo, useState } from "react";
import {
  deleteReflection,
  deleteTeacherFeedback,
  saveTeacherFeedback
} from "../../services/feedbackService";
import useBoardReflections from "./useBoardReflections";

function formatDate(value) {
  if (!Number.isFinite(value) || value <= 0) return "日時不明";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function TeacherFeedbackPanel({
  boardId,
  currentUserId,
  currentUser,
  onClose
}) {
  const { reflections, loading } = useBoardReflections(boardId);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedReflection = useMemo(() => {
    return reflections.find((item) => item.userId === selectedUserId) || null;
  }, [reflections, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId && reflections.length > 0) {
      setSelectedUserId(reflections[0].userId);
    }
  }, [reflections, selectedUserId]);

  useEffect(() => {
    setComment(selectedReflection?.teacherFeedback?.comment || "");
  }, [selectedReflection]);

  const handleSave = async () => {
    if (!selectedReflection) return;

    setSaving(true);
    try {
      await saveTeacherFeedback({
        boardId,
        userId: selectedReflection.userId,
        teacherId: currentUserId,
        teacherName: currentUser?.name || "管理者",
        comment
      });
      alert("コメントを保存しました");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "コメントを保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteComment = async () => {
    if (!selectedReflection?.teacherFeedback?.comment) return;
    if (!window.confirm("先生のコメントを削除しますか？")) return;

    setSaving(true);
    try {
      await deleteTeacherFeedback({
        boardId,
        userId: selectedReflection.userId
      });
      setComment("");
    } catch (error) {
      console.error(error);
      alert("コメントを削除できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReflection = async () => {
    if (!selectedReflection) return;

    const confirmed = window.confirm(
      `${selectedReflection.userName || "この生徒"}の振り返りを削除しますか？
先生のコメントも同時に削除されます。
この操作は元に戻せません。`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteReflection({
        boardId,
        userId: selectedReflection.userId
      });
      setSelectedUserId("");
      setComment("");
    } catch (error) {
      console.error(error);
      alert("振り返りを削除できませんでした");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-feedback-overlay" role="dialog" aria-modal="true">
      <div className="admin-feedback-dialog">
        <header className="admin-feedback-header">
          <div>
            <h2>振り返りコメント管理</h2>
            <p>生徒の振り返りを確認してコメントを返します。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる">×</button>
        </header>

        <div className="admin-feedback-content">
          <aside className="admin-feedback-list">
            {loading && <p>読み込み中…</p>}
            {!loading && reflections.length === 0 && (
              <p>保存済みの振り返りはありません。</p>
            )}

            {reflections.map((reflection) => (
              <button
                type="button"
                key={reflection.userId}
                className={reflection.userId === selectedUserId ? "active" : ""}
                onClick={() => setSelectedUserId(reflection.userId)}
              >
                <strong>{reflection.userName || reflection.userId}</strong>
                <span>{formatDate(Number(reflection.submittedAtClient || reflection.submittedAt || 0))}</span>
                <small>
                  {reflection.teacherFeedback?.comment
                    ? reflection.teacherFeedback.isRead
                      ? "コメント確認済み"
                      : "コメント未読"
                    : "未コメント"}
                </small>
              </button>
            ))}
          </aside>

          <section className="admin-feedback-detail">
            {!selectedReflection ? (
              <p>左側から生徒を選択してください。</p>
            ) : (
              <>
                <div className="admin-reflection-view">
                  <h3>{selectedReflection.userName || "生徒"}の振り返り</h3>
                  <p>{selectedReflection.responseText || "振り返り本文がありません。"}</p>
                </div>

                <label htmlFor="teacher-feedback-textarea">先生からのコメント</label>
                <textarea
                  id="teacher-feedback-textarea"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="生徒へのコメントを入力してください"
                  maxLength={1000}
                />

                <div className="admin-feedback-footer">
                  <span>{comment.length} / 1000文字</span>
                  <div>
                    {selectedReflection.teacherFeedback?.comment && (
                      <button
                        type="button"
                        className="admin-comment-delete-button"
                        onClick={handleDeleteComment}
                        disabled={saving}
                      >
                        コメントを削除
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-reflection-delete-button"
                      onClick={handleDeleteReflection}
                      disabled={saving}
                    >
                      振り返りを削除
                    </button>
                    <button
                      type="button"
                      className="admin-feedback-save-button"
                      onClick={handleSave}
                      disabled={saving || !comment.trim()}
                    >
                      {saving ? "処理中…" : "コメントを保存"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
