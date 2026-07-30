import { useEffect, useRef } from "react";
import {
  onChildAdded,
  onChildRemoved,
  push,
  ref,
  remove,
  serverTimestamp,
  update
} from "firebase/database";
import { db } from "../../firebase/firebase";
import {
  clearCanvas,
  drawSegmentOnCanvas,
  normalizeStoredPoints,
  resizeCanvasToDisplaySize
} from "../../utils/drawingUtils";
import { DRAWING_COLOR, DRAWING_WIDTH_PX } from "../../constants/appConstants";

const ERASER_RADIUS = 24;

function getCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const layoutWidth = canvas.clientWidth;
  const layoutHeight = canvas.clientHeight;

  if (
    rect.width === 0 ||
    rect.height === 0 ||
    layoutWidth === 0 ||
    layoutHeight === 0
  ) {
    return { x: 0, y: 0 };
  }

  // board-canvas は CSS transform: scale(...) で拡大縮小されるため、
  // 画面上の座標を拡大前のボード座標へ戻す。
  const scaleX = layoutWidth / rect.width;
  const scaleY = layoutHeight / rect.height;

  return {
    x: Math.max(0, Math.min(layoutWidth, (event.clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(layoutHeight, (event.clientY - rect.top) * scaleY))
  };
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))
  );
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function convertPoints(segment, canvas) {
  const points = normalizeStoredPoints(segment?.points);
  if (segment?.coordinateMode === "pixel") {
    return points.map((point) => ({
      x: Number(point.x) || 0,
      y: Number(point.y) || 0
    }));
  }

  return points.map((point) => ({
    x: (Number(point.x) || 0) * canvas.clientWidth,
    y: (Number(point.y) || 0) * canvas.clientHeight
  }));
}

function distanceToSegment(point, segment, canvas) {
  const points = convertPoints(segment, canvas);
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);

  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    distance = Math.min(distance, pointToSegmentDistance(point, points[index - 1], points[index]));
  }
  return distance;
}

export default function BoardDrawingCanvas({
  boardId,
  currentUserId,
  currentUser,
  tool
}) {
  const canvasRef = useRef(null);
  const storedSegmentsRef = useRef(new Map());
  const gestureRef = useRef({ active: false });
  const lastErasedStrokeRef = useRef("");

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    clearCanvas(canvas);
    storedSegmentsRef.current.forEach((segment) => drawSegmentOnCanvas(canvas, segment));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !boardId) return undefined;

    storedSegmentsRef.current.clear();
    resizeCanvasToDisplaySize(canvas);
    clearCanvas(canvas);

    const resizeObserver = new ResizeObserver(() => {
      if (resizeCanvasToDisplaySize(canvas)) redraw();
    });
    resizeObserver.observe(canvas);

    const segmentsRef = ref(db, `boards/${boardId}/boardDrawing/segments`);
    const unsubscribeAdded = onChildAdded(segmentsRef, (snapshot) => {
      const segment = snapshot.val();
      if (!segment) return;
      storedSegmentsRef.current.set(snapshot.key, segment);
      redraw();
    });
    const unsubscribeRemoved = onChildRemoved(segmentsRef, (snapshot) => {
      storedSegmentsRef.current.delete(snapshot.key);
      redraw();
    });

    return () => {
      resizeObserver.disconnect();
      unsubscribeAdded();
      unsubscribeRemoved();
      storedSegmentsRef.current.clear();
    };
  }, [boardId]);

  const eraseNearestStroke = async (event) => {
    const canvas = canvasRef.current;
    if (!canvas || !boardId) return;
    const point = getCanvasPoint(event, canvas);

    let targetKey = null;
    /** @type {any} */
    let targetSegment = null;
    let bestDistance = ERASER_RADIUS;

    storedSegmentsRef.current.forEach((segment, key) => {
      const distance = distanceToSegment(point, segment, canvas);
      if (distance <= bestDistance) {
        bestDistance = distance;
        targetKey = key;
        targetSegment = segment;
      }
    });

    if (!targetKey || !targetSegment) return;
    const strokeId = targetSegment.strokeId || targetKey;
    if (lastErasedStrokeRef.current === strokeId) return;
    lastErasedStrokeRef.current = strokeId;

    const segmentEntries = [...storedSegmentsRef.current.entries()].filter(
      ([key, segment]) => (segment.strokeId || key) === strokeId
    );

    const updates = {};
    segmentEntries.forEach(([key]) => {
      updates[`boardDrawing/segments/${key}`] = null;
    });

    const historyRef = push(ref(db, `boards/${boardId}/history`));
    updates[`history/${historyRef.key}`] = {
      type: "board_drawing_stroke_erased",
      userId: currentUserId,
      userName: currentUser?.name || "",
      payload: {
        strokeId,
        segmentIds: segmentEntries.map(([key]) => key)
      },
      timestamp: serverTimestamp()
    };

    await update(ref(db, `boards/${boardId}`), updates);
  };

  const handlePointerDown = (event) => {
    if (tool === "move" || !currentUserId || !currentUser) return;
    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;
    resizeCanvasToDisplaySize(canvas);
    canvas.setPointerCapture?.(event.pointerId);

    if (tool === "eraser") {
      gestureRef.current = { active: true, mode: "eraser", pointerId: event.pointerId };
      lastErasedStrokeRef.current = "";
      eraseNearestStroke(event).catch(console.error);
      return;
    }

    const point = getCanvasPoint(event, canvas);
    const strokeId = push(ref(db, `boards/${boardId}/boardDrawing/segments`)).key;
    gestureRef.current = {
      active: true,
      mode: "pen",
      pointerId: event.pointerId,
      strokeId,
      points: [point],
      lastPoint: point
    };

    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = DRAWING_COLOR;
    ctx.beginPath();
    ctx.arc(point.x, point.y, DRAWING_WIDTH_PX / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    if (gesture.mode === "eraser") {
      eraseNearestStroke(event).catch(console.error);
      return;
    }

    const canvas = canvasRef.current;
    const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;

    events.forEach((pointerEvent) => {
      const point = getCanvasPoint(pointerEvent, canvas);
      const previous = gestureRef.current.lastPoint;
      ctx.save();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.strokeStyle = DRAWING_COLOR;
      ctx.lineWidth = DRAWING_WIDTH_PX;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.restore();
      gestureRef.current.points.push(point);
      gestureRef.current.lastPoint = point;
    });
  };

  const handlePointerEnd = async (event) => {
    const gesture = gestureRef.current;
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    try {
      canvasRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Android WebViewでは既に解放されている場合がある。
    }

    gestureRef.current = { active: false };
    lastErasedStrokeRef.current = "";
    if (gesture.mode !== "pen" || !gesture.strokeId || gesture.points.length === 0) return;

    const segment = {
      strokeId: gesture.strokeId,
      coordinateMode: "pixel",
      baseWidth: canvasRef.current?.clientWidth || 2200,
      baseHeight: canvasRef.current?.clientHeight || 1400,
      points: gesture.points,
      color: DRAWING_COLOR,
      widthPx: DRAWING_WIDTH_PX,
      owner: currentUserId,
      ownerName: currentUser?.name || ""
    };
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();

    await update(ref(db, `boards/${boardId}`), {
      [`boardDrawing/segments/${gesture.strokeId}`]: {
        ...segment,
        createdAt: timestamp
      },
      [`history/${historyRef.key}`]: {
        type: "board_drawing_segment",
        userId: currentUserId,
        userName: currentUser?.name || "",
        payload: {
          segmentId: gesture.strokeId,
          segment
        },
        timestamp
      }
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className={`board-drawing-canvas board-tool-${tool} ${tool === "move" ? "board-drawing-disabled" : "board-drawing-enabled"}`}
      aria-label="ボード全体の手書き入力"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    />
  );
}
