import { useEffect, useMemo, useState } from "react";

import {
  deleteReflection,
  deleteTeacherFeedback,
  saveTeacherFeedback
} from "../../services/feedbackService";

export default function TeacherFeedbackPanel({
  open,
  onClose,
  boardId,
  reflections,
  users,
  currentUserId,
  currentUser,
  formatTimestamp
}) {
  const sortedReflections = useMemo(() => {
    return Object.entries(reflections || {}).sort(([, a], [, b]) => {
      return Number(b?.submittedAt || 0) - Number(a?.submittedAt || 0);
    });
  }, [reflections]);

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const firstAvailableUserId =
      selectedUserId && reflections?.[selectedUserId]
        ? selectedUserId
        : sortedReflections[0]?.[0] || null;

    setSelectedUserId(firstAvailableUserId);
    setComment(
      firstAvailableUserId
        ? reflections[firstAvailableUserId]?.teacherFeedback?.comment || ""
        : ""
    );
  }, [open, reflections, selectedUserId, sortedReflections]);

  const selectedReflection = selectedUserId
    ? reflections?.[selectedUserId] || null
    : null;

  const handleSelectStudent = (userId) => {
    setSelectedUserId(userId);
    setComment(reflections[userId]?.teacherFeedback?.comment || "");
  };

  const handleSave = async () => {
    if (!selectedUserId || !currentUser || currentUser.role !== "admin") return;

    setSaving(true);

    try {
      await saveTeacherFeedback({
        boardId,
        userId: selectedUserId,
        teacherId: currentUserId,
        teacherName: currentUser.name,
        comment,
        previousFeedback: selectedReflection?.teacherFeedback || {}
      });

      alert("コメントを保存しました");
    } catch (error) {
      console.error("コメントを保存できませんでした", error);
      alert(error instanceof Error ? error.message : "コメントを保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUserId || !window.confirm("このコメントを削除しますか？")) return;

    try {
      await deleteTeacherFeedback({ boardId, userId: selectedUserId });
      setComment("");
    } catch (error) {
      console.error("コメントを削除できませんでした", error);
      alert("コメントを削除できませんでした");
    }
  };

  const handleDeleteReflection = async () => {
    if (!selectedUserId) return;

    const confirmed = window.confirm(
      "この生徒の振り返りを削除しますか？\n管理者コメントも同時に削除されます。"
    );

    if (!confirmed) return;

    try {
      await deleteReflection({ boardId, userId: selectedUserId });
      setSelectedUserId(null);
      setComment("");
      alert("振り返りを削除しました");
    } catch (error) {
      console.error("振り返りを削除できませんでした", error);
      alert("振り返りを削除できませんでした");
    }
  };

  if (!open) return null;

  return (
    <div className="feedback-overlay" role="presentation">
      <div
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-feedback-dialog-title"
      >
        <header className="feedback-dialog-header">
          <div>
            <h2 id="teacher-feedback-dialog-title">
              生徒の振り返りへのコメント
            </h2>
            <p>ボード：{boardId}</p>
          </div>

          <button type="button" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>

        <div className="feedback-dialog-body">
          <aside className="feedback-student-list">
            <h3>提出者</h3>

            {sortedReflections.length === 0 ? (
              <p className="feedback-empty">
                振り返りはまだ提出されていません。
              </p>
            ) : (
              sortedReflections.map(([userId, reflection]) => (
                <button
                  type="button"
                  key={userId}
                  className={`feedback-student-item ${
                    selectedUserId === userId ? "active" : ""
                  }`}
                  onClick={() => handleSelectStudent(userId)}
                >
                  <strong>
                    {reflection.userName || users[userId]?.name || userId}
                  </strong>
                  <span>
                    {reflection.teacherFeedback?.comment
                      ? reflection.teacherFeedback.isRead
                        ? "確認済み"
                        : "未読コメントあり"
                      : "未コメント"}
                  </span>
                  <small>
                    {reflection.submittedAt
                      ? formatTimestamp(reflection.submittedAt)
                      : "保存日時なし"}
                  </small>
                </button>
              ))
            )}
          </aside>

          <main className="feedback-editor">
            {!selectedReflection ? (
              <p className="feedback-empty">
                左側から生徒を選択してください。
              </p>
            ) : (
              <>
                <section className="feedback-reflection-card">
                  <div>
                    <h3>
                      {selectedReflection.userName ||
                        users[selectedUserId]?.name ||
                        "生徒"}
                      の振り返り
                    </h3>
                    <span>
                      {selectedReflection.responseLength ||
                        String(selectedReflection.responseText || "").length}
                      文字
                    </span>
                  </div>
                  <p>
                    {selectedReflection.responseText ||
                      "振り返り本文がありません。"}
                  </p>
                </section>

                <label htmlFor="teacher-feedback-textarea">
                  管理者コメント
                </label>
                <textarea
                  id="teacher-feedback-textarea"
                  value={comment}
                  maxLength={1000}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="生徒の記述を具体化する質問や、次の活動につながるコメントを入力してください。"
                />

                <div className="feedback-editor-footer">
                  <span>{comment.length} / 1000文字</span>
                  <div>
                    <button
                      type="button"
                      className="feedback-delete-reflection-button"
                      onClick={handleDeleteReflection}
                    >
                      振り返りを削除
                    </button>
                    {selectedReflection.teacherFeedback?.comment && (
                      <button
                        type="button"
                        className="feedback-delete-button"
                        onClick={handleDelete}
                      >
                        コメント削除
                      </button>
                    )}
                    <button
                      type="button"
                      className="feedback-save-button"
                      onClick={handleSave}
                      disabled={saving || !comment.trim()}
                    >
                      {saving
                        ? "保存中…"
                        : selectedReflection.teacherFeedback?.comment
                          ? "コメントを更新"
                          : "コメントを送信"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
