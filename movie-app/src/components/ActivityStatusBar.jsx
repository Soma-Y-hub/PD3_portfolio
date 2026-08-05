export default function ActivityStatusBar({
  groupName,
  boardNumber,
  status,
  previousNextAction,
  currentNextAction,
  isAdmin,
  ending,
  onOpenNextAction,
  onEndActivity
}) {
  const isCompleted = status === "completed";

  return (
    <section className={`activity-status-bar ${isCompleted ? "completed" : "active"}`}>
      <div className="activity-status-main">
        <div className="activity-status-title-row">
          <strong>{groupName}・第{boardNumber}回</strong>
          <span>{isCompleted ? "活動終了・閲覧専用" : "活動中"}</span>
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
        <button type="button" onClick={onOpenNextAction}>
          {currentNextAction ? "次回することを編集" : "次回することを決める"}
        </button>

        {isAdmin && !isCompleted && (
          <button
            type="button"
            className="end-activity-button"
            disabled={ending}
            onClick={onEndActivity}
          >
            {ending ? "終了処理中…" : "活動を終了"}
          </button>
        )}
      </div>
    </section>
  );
}
