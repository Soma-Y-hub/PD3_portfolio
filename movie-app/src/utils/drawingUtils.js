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

export const getCanvasPixelRatio = (canvas) => {
  if (!canvas || !canvas.clientWidth) return 1;
  const ratio = canvas.width / canvas.clientWidth;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
};

/**
 * canvasの内部解像度を表示サイズに合わせる。
 * 巨大なボードCanvasではmaxPixelRatioを1にすると、
 * 高DPI端末でのメモリ消費と描画遅延を大幅に抑えられる。
 */
export const resizeCanvasToDisplaySize = (canvas, options = {}) => {
  if (!canvas) return false;

  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  if (displayWidth === 0 || displayHeight === 0) {
    return false;
  }

  const requestedRatio = window.devicePixelRatio || 1;
  const maxPixelRatio = Number(options.maxPixelRatio) || requestedRatio;
  const minPixelRatio = Number(options.minPixelRatio) || 1;
  const pixelRatio = Math.max(minPixelRatio, Math.min(requestedRatio, maxPixelRatio));
  const nextWidth = Math.max(1, Math.round(displayWidth * pixelRatio));
  const nextHeight = Math.max(1, Math.round(displayHeight * pixelRatio));

  if (canvas.width === nextWidth && canvas.height === nextHeight) {
    return false;
  }

  canvas.width = nextWidth;
  canvas.height = nextHeight;
  canvas.dataset.pixelRatio = String(pixelRatio);
  return true;
};

export const clearCanvas = (canvas) => {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
};

export const drawSegmentOnCanvas = (canvas, segment) => {
  if (!canvas || !segment) return;

  const points = normalizeStoredPoints(segment.points);
  if (points.length === 0) return;

  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  if (displayWidth === 0 || displayHeight === 0) return;

  const pixelRatio = getCanvasPixelRatio(canvas);
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
    const previous = convertedPoints[i - 1];
    const current = convertedPoints[i];
    const middleX = (previous.x + current.x) / 2;
    const middleY = (previous.y + current.y) / 2;
    ctx.quadraticCurveTo(previous.x, previous.y, middleX, middleY);
  }

  const last = convertedPoints[convertedPoints.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
};
