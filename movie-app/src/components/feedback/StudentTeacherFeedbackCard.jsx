export default function StudentTeacherFeedbackCard({
  feedback,
  formatTimestamp
}) {
  if (!feedback?.comment) return null;

  return (
    <section className="student-teacher-feedback-card">
      <div className="student-teacher-feedback-heading">
        <strong>先生からのコメント</strong>
        <span>{feedback.teacherName || "管理者"}</span>
      </div>

      <p>{feedback.comment}</p>

      {feedback.updatedAt && (
        <small>{formatTimestamp(feedback.updatedAt)}</small>
      )}
    </section>
  );
}
