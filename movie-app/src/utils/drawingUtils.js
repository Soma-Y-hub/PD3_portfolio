import { DRAWING_COLOR, DRAWING_WIDTH, DRAWING_WIDTH_PX } from "../constants/appConstants";

export const normalizeStoredPoints = (rawPoints) => {
  if (!rawPoints) return [];

  if (Array.isArray(rawPoints)) {
    return rawPoints.filter(Boolean);
  }

  return Object.keys(rawPoints)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => rawPoints[key])
    .filter(Boolean);
};

/**
 * canvasの内部解像度を、画面上の表示サイズに合わせる。
 *
 * canvas.width / canvas.heightを書き換えると
 * canvas上の描画内容は一度消える。
 */
export const resizeCanvasToDisplaySize = (canvas) => {
  if (!canvas) return false;

  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  if (displayWidth === 0 || displayHeight === 0) {
    return false;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const nextWidth = Math.max(1, Math.round(displayWidth * pixelRatio));
  const nextHeight = Math.max(1, Math.round(displayHeight * pixelRatio));

  if (canvas.width === nextWidth && canvas.height === nextHeight) {
    return false;
  }

  canvas.width = nextWidth;
  canvas.height = nextHeight;
  return true;
};

/**
 * canvas全体を消去する。
 */
export const clearCanvas = (canvas) => {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  ctx.save();

  // 拡大率などの変換を一度解除する
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.restore();
};

/**
 * Firebaseに保存されている1つの線分を描画する。
 *
 * coordinateMode === "pixel"
 *   新しいピクセル座標形式
 *
 * coordinateModeがない
 *   以前の0～1座標形式
 */
export const drawSegmentOnCanvas = (canvas, segment) => {
  if (!canvas || !segment) return;

  const points = normalizeStoredPoints(segment.points);
  if (points.length === 0) return;

  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  if (displayWidth === 0 || displayHeight === 0) return;

  const pixelRatio = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.strokeStyle = segment.color || DRAWING_COLOR;
  ctx.fillStyle = segment.color || DRAWING_COLOR;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let convertedPoints;

  if (segment.coordinateMode === "pixel") {
    convertedPoints = points.map((point) => ({
      x: Number(point.x) || 0,
      y: Number(point.y) || 0
    }));
    ctx.lineWidth = Number(segment.widthPx) || DRAWING_WIDTH_PX;
  } else {
    convertedPoints = points.map((point) => ({
      x: (Number(point.x) || 0) * displayWidth,
      y: (Number(point.y) || 0) * displayHeight
    }));
    ctx.lineWidth =
      (Number(segment.width) || DRAWING_WIDTH) *
      Math.min(displayWidth, displayHeight);
  }

  if (convertedPoints.length === 1) {
    const point = convertedPoints[0];
    ctx.beginPath();
    ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(convertedPoints[0].x, convertedPoints[0].y);

  for (let i = 1; i < convertedPoints.length; i += 1) {
    ctx.lineTo(convertedPoints[i].x, convertedPoints[i].y);
  }

  ctx.stroke();
  ctx.restore();
};
