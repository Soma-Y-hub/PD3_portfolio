export default function CardMenu({
  open,
  onToggle,
  onBringToFront,
  onSendToBack,
  onDelete
}) {
  return (
    <div className="card-menu-wrap">
      <button
        type="button"
        className="card-menu-button"
        aria-label="付箋の操作メニュー"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          className="card-menu-popover"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={onBringToFront}>最前面へ</button>
          <button type="button" onClick={onSendToBack}>最背面へ</button>
          <button type="button" className="danger" onClick={onDelete}>削除</button>
        </div>
      )}
    </div>
  );
}
