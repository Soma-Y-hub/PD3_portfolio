import { useRef, useState } from "react";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function ImageCropDialog({ src, initialCrop, onCancel, onCrop }) {
  const overlayRef = useRef(null);
  const pointerStartRef = useRef(null);
  const [imageSize, setImageSize] = useState(null);
  const [crop, setCrop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleImageLoad = (event) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    if (!width || !height) {
      setError("画像サイズを読み取れませんでした。");
      return;
    }
    setImageSize({ width, height });
    const initial = initialCrop && initialCrop.naturalWidth === width && initialCrop.naturalHeight === height
      ? initialCrop
      : { x: 0, y: 0, width, height };
    setCrop({ x: initial.x, y: initial.y, width: initial.width, height: initial.height });
  };

  const getPoint = (event) => {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds || !imageSize) return null;
    return {
      x: clamp((event.clientX - bounds.left) * imageSize.width / bounds.width, 0, imageSize.width),
      y: clamp((event.clientY - bounds.top) * imageSize.height / bounds.height, 0, imageSize.height)
    };
  };

  const startSelection = (event) => {
    if (busy || !imageSize) return;
    const point = getPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerStartRef.current = { ...point, pointerId: event.pointerId };
    setCrop({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const updateSelection = (event) => {
    const start = pointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const point = getPoint(event);
    if (!point) return;
    setCrop({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y)
    });
  };

  const finishSelection = (event) => {
    if (pointerStartRef.current?.pointerId !== event.pointerId) return;
    updateSelection(event);
    pointerStartRef.current = null;
  };

  const saveCrop = async () => {
    if (!imageSize || !crop || busy) return;
    if (crop.width < 2 || crop.height < 2) {
      setError("切り抜く範囲を画像上でドラッグして選択してください。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCrop({ ...crop, naturalWidth: imageSize.width, naturalHeight: imageSize.height });
    } catch (cropError) {
      setError(cropError?.message || "切り抜き範囲を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const selection = crop || (imageSize && { x: 0, y: 0, width: imageSize.width, height: imageSize.height });

  return (
    <div className="image-crop-overlay" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="image-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="image-crop-title">
        <header>
          <div>
            <h2 id="image-crop-title">選択した画像をトリミング</h2>
            <p>下の画像をドラッグして、残したい範囲を選んでください。</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="閉じる">×</button>
        </header>

        <div className="image-crop-stage">
          <img src={src} alt="切り抜き対象の写真" onLoad={handleImageLoad} onError={() => setError("画像を読み込めませんでした。")} />
          {imageSize && selection && (
            <svg
              ref={overlayRef}
              className="image-crop-selection"
              viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
              preserveAspectRatio="none"
              onPointerDown={startSelection}
              onPointerMove={updateSelection}
              onPointerUp={finishSelection}
              onPointerCancel={finishSelection}
            >
              <defs>
                <mask id="image-crop-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={selection.x} y={selection.y} width={selection.width} height={selection.height} fill="black" />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#image-crop-mask)" />
              <rect
                x={selection.x}
                y={selection.y}
                width={selection.width}
                height={selection.height}
                fill="transparent"
                stroke="white"
                strokeWidth={Math.max(imageSize.width, imageSize.height) / 400}
                strokeDasharray={`${Math.max(imageSize.width, imageSize.height) / 100} ${Math.max(imageSize.width, imageSize.height) / 160}`}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {!imageSize && !error && <p className="image-crop-loading">画像を読み込んでいます…</p>}
        </div>

        {error && <p className="image-crop-error" role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>キャンセル</button>
          <button type="button" className="image-crop-primary" onClick={saveCrop} disabled={!imageSize || busy}>
            {busy ? "保存中…" : "トリミングを保存"}
          </button>
        </footer>
      </section>
    </div>
  );
}
