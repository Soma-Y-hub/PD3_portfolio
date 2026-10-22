export default function ReflectionWritingPanel({
  reflectionText,
  readOnly = false,
  allowDelete = true,
  onReflectionTextChange,
  reflectionRecord,
  reflectionSubmitting,
  onSubmit,
  onDelete
}) {
  const hasSavedReflection = Boolean(reflectionRecord?.responseText);

  return (
    <section className="reflection-simple-write-panel">
      <div className="reflection-simple-prompt">
        <h3>今回の活動を振り返る</h3>
        <p>活動を思い出しながら、気付いたことや次に改善したいことを書きましょう。</p>
      </div>

      <label htmlFor="reflection-textarea">振り返り</label>
      <textarea
        id="reflection-textarea"
        readOnly={readOnly}
        value={reflectionText}
        onChange={(event) => onReflectionTextChange(event.target.value)}
        placeholder="活動で気付いたこと、考えが変わった場面、次に改善したいこと"
        autoFocus
      />

      <div className="reflection-simple-footer">
        <span>{reflectionText.length}文字</span>
        <div>
          {hasSavedReflection && (
            <button
              type="button"
              className="reflection-delete-button"
              onClick={onDelete}
              disabled={readOnly || !allowDelete || reflectionSubmitting}
            >
              削除
            </button>
          )}
          <button
            type="button"
            className="reflection-submit-button"
            onClick={onSubmit}
            disabled={readOnly || reflectionSubmitting || !reflectionText.trim()}
          >
            {reflectionSubmitting
              ? "保存中…"
              : hasSavedReflection
                ? "提出内容を更新"
                : "先生に提出"}
          </button>
        </div>
      </div>
    </section>
  );
}
