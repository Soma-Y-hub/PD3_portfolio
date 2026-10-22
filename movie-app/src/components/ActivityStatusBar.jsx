export default function ActivityStatusBar({
  groupName,
  readOnly = false,
  boardNumber,
  status,
  previousNextActions = [],
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
  const isClosing = status === "closing";
  const actionsToShow = Array.isArray(previousNextActions) ? previousNextActions : [];

  return (
    <section className={`activity-status-bar ${status}`}>
      <div className="activity-status-main">
        <div className="activity-status-title-row">
          <strong>{groupName}・第{boardNumber}回</strong>
          <span>{isCompleted ? "活動終了・閲覧専用" : isClosing ? "活動の終了処理中" : isSubmitted ? "先生の最終確認待ち" : "活動中"}</span>
        </div>

        {actionsToShow.length > 0 && (
          <div className="previous-next-actions" aria-label="前回決めたこと">
            <b>前回決めたこと：</b>
            <ul>
              {actionsToShow.map((action, index) => (
                <li key={action.userId || `${action.text}-${index}`}>
                  {action.userName && <strong>{action.userName}：</strong>}
                  {action.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {currentNextAction && (
          <p className="current-next-action">
            <b>次回すること：</b>{currentNextAction}
          </p>
        )}
      </div>

      <div className="activity-status-actions">
        {!readOnly && !isCompleted && !isSubmitted && !isClosing && <button type="button" onClick={onOpenNextAction}>
          {currentNextAction ? "次回することを編集" : "次回することを決める"}
        </button>}

        {!isAdmin && status === "active" && (
          <button type="button" className="submit-activity-button" disabled={submitting || !onSubmitActivity} onClick={onSubmitActivity}>
            {submitting ? "提出中…" : "活動を終了して先生に提出"}
          </button>
        )}
        {!isAdmin && isSubmitted && <button type="button" disabled>先生の確認待ち</button>}
        {isAdmin && status === "active" && <span className="teacher-waiting-label">生徒の終了待ち</span>}
        {isAdmin && (isSubmitted || isClosing) && (
          <button
            type="button"
            className="end-activity-button"
            disabled={ending || !onFinalizeActivity}
            onClick={onFinalizeActivity}
          >
            {ending ? "終了処理中…" : isClosing ? "終了処理を再試行" : "最終確認して活動を終了"}
          </button>
        )}
      </div>
    </section>
  );
}
