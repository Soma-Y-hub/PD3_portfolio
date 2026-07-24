import StudentTeacherFeedbackCard from "../feedback/StudentTeacherFeedbackCard";

export default function ReflectionWritingPanel({
  prompt,
  reflectionText,
  onReflectionTextChange,
  reflectionRecord,
  reflectionSubmitting,
  boardId,
  currentUserId,
  onClose,
  onSubmit,
  onDelete
}) {
  const hasSavedReflection = Boolean(reflectionRecord?.responseText);

  return (
    <section className="reflection-writing-panel writing-only-panel">
      <div className="reflection-goal-card reflection-goal-card-wide">
        <h3>目標</h3>
        <p>{prompt}</p>
        <small>
          左のタイムラプスと活動の目印を使って、活動全体の流れを思い出せます。
        </small>
      </div>

      <div className="reflection-textarea-field">
        <label htmlFor="reflection-textarea">振り返り</label>
        <textarea
          id="reflection-textarea"
          value={reflectionText}
          onChange={(event) => onReflectionTextChange(event.target.value)}
          placeholder="ここに自由に記述してください"
          autoFocus
        />
      </div>

      <div className="reflection-writing-footer">
        <span>{reflectionText.length}文字</span>

        <div className="reflection-writing-actions">
          {hasSavedReflection && (
            <button
              type="button"
              className="reflection-delete-button"
              onClick={onDelete}
              disabled={reflectionSubmitting}
            >
              振り返りを削除
            </button>
          )}

          <button
            type="button"
            className="reflection-cancel-button"
            onClick={onClose}
            disabled={reflectionSubmitting}
          >
            閉じる
          </button>

          <button
            type="button"
            className="reflection-submit-button"
            onClick={onSubmit}
            disabled={reflectionSubmitting}
          >
            {reflectionSubmitting
              ? "処理中…"
              : hasSavedReflection
                ? "更新して保存"
                : "保存"}
          </button>
        </div>
      </div>

      <StudentTeacherFeedbackCard
        boardId={boardId}
        userId={currentUserId}
        feedback={reflectionRecord?.teacherFeedback}
      />
    </section>
  );
}
