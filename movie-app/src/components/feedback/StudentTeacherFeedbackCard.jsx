import { useEffect } from "react";
import { markTeacherFeedbackAsRead } from "../../services/feedbackService";

function formatFeedbackDate(value) {
  if (!Number.isFinite(value) || value <= 0) return "";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export default function StudentTeacherFeedbackCard({
  boardId,
  userId,
  feedback
}) {
  useEffect(() => {
    if (!boardId || !userId || !feedback?.comment || feedback.isRead) {
      return;
    }

    markTeacherFeedbackAsRead({ boardId, userId }).catch((error) => {
      console.error("コメントを既読にできませんでした", error);
    });
  }, [boardId, userId, feedback?.comment, feedback?.isRead]);

  if (!feedback?.comment) {
    return (
      <section className="teacher-feedback-card teacher-feedback-empty">
        <h3>先生からのコメント</h3>
        <p>まだコメントはありません。</p>
      </section>
    );
  }

  const feedbackDate = formatFeedbackDate(
    Number(feedback.updatedAt || feedback.createdAt || 0)
  );

  return (
    <section className="teacher-feedback-card">
      <div className="teacher-feedback-heading">
        <h3>先生からのコメント</h3>
        <span>{feedback.teacherName || "管理者"}</span>
      </div>

      <p className="teacher-feedback-comment">{feedback.comment}</p>

      {feedbackDate && (
        <time className="teacher-feedback-date">{feedbackDate}</time>
      )}
    </section>
  );
}
