export default function NextActionDialog({
  open,
  value,
  saving,
  onChange,
  onClose,
  onSave
}) {
  if (!open) return null;

  return (
    <div className="next-action-overlay" role="dialog" aria-modal="true">
      <section className="next-action-dialog">
        <header>
          <div>
            <h2>次回すること</h2>
            <p>今回の振り返りを、次の活動につなげます。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>

        <label htmlFor="next-action-text">次の活動で取り組むこと</label>
        <textarea
          id="next-action-text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例：似ている意見をグループ分けしてから比較する"
          autoFocus
        />

        <footer>
          <span>{value.length}文字</span>
          <div>
            <button type="button" onClick={onClose} disabled={saving}>
              キャンセル
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={saving || !value.trim()}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
