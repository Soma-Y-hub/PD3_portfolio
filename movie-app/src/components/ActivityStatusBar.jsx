export default function ActivityStatusBar({
  groupName,
  boardNumber,
  status,
  previousNextAction,
  currentNextAction,
  isAdmin,
  submitting,
  ending,
  onOpenNextAction,
  onSubmitActivity,
  onFinalizeActivity
}) {
  const isSubmitted = status === "submitted";
  const isCompleted = status === "completed";

  const statusLabel = isCompleted
    ? "活動終了・閲覧専用"
    : isSubmitted
      ? "先生の最終確認待ち"
      : "活動中";

  return (
    <section className={`activity-status-bar ${status}`}>
      <div className="activity-status-main">
        <div className="activity-status-title-row">
          <strong>{groupName}・第{boardNumber}回</strong>
          <span>{statusLabel}</span>
        </div>

        {previousNextAction && (
          <p className="previous-next-action">
            <b>前回決めたこと：</b>{previousNextAction}
          </p>
        )}

        {currentNextAction && (
          <p className="current-next-action">
            <b>次回すること：</b>{currentNextAction}
          </p>
        )}
      </div>

      <div className="activity-status-actions">
        {!isCompleted && (
          <button type="button" onClick={onOpenNextAction}>
            {currentNextAction ? "次回することを編集" : "次回することを決める"}
          </button>
        )}

        {!isAdmin && status === "active" && (
          <button
            type="button"
            className="submit-activity-button"
            disabled={submitting}
            onClick={onSubmitActivity}
          >
            {submitting ? "提出中…" : "活動を終了して先生に提出"}
          </button>
        )}

        {!isAdmin && isSubmitted && (
          <button type="button" disabled>先生の確認待ち</button>
        )}

        {isAdmin && status === "active" && (
          <span className="teacher-waiting-label">生徒の終了待ち</span>
        )}

        {isAdmin && isSubmitted && (
          <button
            type="button"
            className="end-activity-button"
            disabled={ending}
            onClick={onFinalizeActivity}
          >
            {ending ? "終了処理中…" : "最終確認して活動を終了"}
          </button>
        )}
      </div>
    </section>
  );
}
