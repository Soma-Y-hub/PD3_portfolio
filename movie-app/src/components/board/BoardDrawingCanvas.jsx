import { useCallback, useEffect, useRef } from "react";
import {
  onChildAdded,
  onChildRemoved,
  push,
  ref,
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
const MIN_POINT_DISTANCE = 1.2;
const ERASER_INTERVAL_MS = 55;

function getCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const layoutWidth = canvas.clientWidth;
  const layoutHeight = canvas.clientHeight;

  if (!rect.width || !rect.height || !layoutWidth || !layoutHeight) {
    return { x: 0, y: 0 };
  }

  return {
    x: Math.max(0, Math.min(layoutWidth, (event.clientX - rect.left) * (layoutWidth / rect.width))),
    y: Math.max(0, Math.min(layoutHeight, (event.clientY - rect.top) * (layoutHeight / rect.height)))
  };
}

function pointDistance(a, b) {
  return Math.hypot((b?.x || 0) - (a?.x || 0), (b?.y || 0) - (a?.y || 0));
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);

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
    return points.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }));
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
  tool,
  disabled = false
}) {
  const canvasRef = useRef(null);
  const storedSegmentsRef = useRef(new Map());
  const gestureRef = useRef({ active: false });
  const animationFrameRef = useRef(null);
  const lastErasedStrokeRef = useRef("");
  const lastEraseAtRef = useRef(0);
  const locallyCommittedStrokeIdsRef = useRef(new Set());

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    clearCanvas(canvas);
    storedSegmentsRef.current.forEach((segment) => drawSegmentOnCanvas(canvas, segment));
  }, []);

  const drawQueuedPoints = useCallback(() => {
    animationFrameRef.current = null;
    const canvas = canvasRef.current;
    const gesture = gestureRef.current;
    if (!canvas || !gesture.active || gesture.mode !== "pen") return;

    const points = gesture.queuedPoints.splice(0);
    if (points.length === 0) return;

    const segmentPoints = gesture.lastRenderedPoint
      ? [gesture.lastRenderedPoint, ...points]
      : points;

    drawSegmentOnCanvas(canvas, {
      coordinateMode: "pixel",
      widthPx: DRAWING_WIDTH_PX,
      color: DRAWING_COLOR,
      points: segmentPoints
    });

    gesture.lastRenderedPoint = segmentPoints[segmentPoints.length - 1];
  }, []);

  const scheduleQueuedDraw = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(drawQueuedPoints);
  }, [drawQueuedPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !boardId) return undefined;

    const storedSegments = storedSegmentsRef.current;
    storedSegments.clear();
    // 4000×2000の巨大CanvasではDPRを1に制限してメモリと再描画負荷を抑える。
    resizeCanvasToDisplaySize(canvas, { maxPixelRatio: 1 });
    clearCanvas(canvas);

    const resizeObserver = new ResizeObserver(() => {
      if (resizeCanvasToDisplaySize(canvas, { maxPixelRatio: 1 })) redraw();
    });
    resizeObserver.observe(canvas);

    const segmentsRef = ref(db, `boards/${boardId}/boardDrawing/segments`);
    const unsubscribeAdded = onChildAdded(segmentsRef, (snapshot) => {
      const segment = snapshot.val();
      if (!segment) return;
      storedSegments.set(snapshot.key, segment);

      if (locallyCommittedStrokeIdsRef.current.has(snapshot.key)) {
        locallyCommittedStrokeIdsRef.current.delete(snapshot.key);
        return;
      }

      // 追加時は全体再描画せず、新しい線だけを描く。
      drawSegmentOnCanvas(canvas, segment);
    });

    const unsubscribeRemoved = onChildRemoved(segmentsRef, (snapshot) => {
      storedSegments.delete(snapshot.key);
      redraw();
    });

    return () => {
      resizeObserver.disconnect();
      unsubscribeAdded();
      unsubscribeRemoved();
      storedSegments.clear();
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      gestureRef.current = { active: false };
    };
  }, [boardId, redraw]);

  const eraseNearestStroke = async (event) => {
    const now = performance.now();
    if (now - lastEraseAtRef.current < ERASER_INTERVAL_MS) return;
    lastEraseAtRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas || !boardId) return;
    const point = getCanvasPoint(event, canvas);

    /** @type {string | null} */
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
      payload: { strokeId, segmentIds: segmentEntries.map(([key]) => key) },
      timestamp: serverTimestamp()
    };

    await update(ref(db, `boards/${boardId}`), updates);
  };

  const handlePointerDown = (event) => {
    if (disabled || tool === "move" || !currentUserId || !currentUser) return;
    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;
    resizeCanvasToDisplaySize(canvas, { maxPixelRatio: 1 });
    canvas.setPointerCapture?.(event.pointerId);

    if (tool === "eraser") {
      gestureRef.current = { active: true, mode: "eraser", pointerId: event.pointerId };
      lastErasedStrokeRef.current = "";
      lastEraseAtRef.current = 0;
      eraseNearestStroke(event).catch(console.error);
      return;
    }

    const point = getCanvasPoint(event, canvas);
    const strokeId = push(ref(db, `boards/${boardId}/boardDrawing/segments`)).key;
    if (!strokeId) return;

    gestureRef.current = {
      active: true,
      mode: "pen",
      pointerId: event.pointerId,
      strokeId,
      points: [point],
      queuedPoints: [point],
      lastAcceptedPoint: point,
      lastRenderedPoint: null
    };
    scheduleQueuedDraw();
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
    if (!canvas) return;
    const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];

    events.forEach((pointerEvent) => {
      const point = getCanvasPoint(pointerEvent, canvas);
      if (pointDistance(gestureRef.current.lastAcceptedPoint, point) < MIN_POINT_DISTANCE) return;
      gestureRef.current.points.push(point);
      gestureRef.current.queuedPoints.push(point);
      gestureRef.current.lastAcceptedPoint = point;
    });

    scheduleQueuedDraw();
  };

  const handlePointerEnd = async (event) => {
    const gesture = gestureRef.current;
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    drawQueuedPoints();

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
      baseWidth: canvasRef.current?.clientWidth || 4000,
      baseHeight: canvasRef.current?.clientHeight || 2000,
      points: gesture.points,
      color: DRAWING_COLOR,
      widthPx: DRAWING_WIDTH_PX,
      owner: currentUserId,
      ownerName: currentUser?.name || ""
    };
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();

    locallyCommittedStrokeIdsRef.current.add(gesture.strokeId);
    await update(ref(db, `boards/${boardId}`), {
      [`boardDrawing/segments/${gesture.strokeId}`]: { ...segment, createdAt: timestamp },
      [`history/${historyRef.key}`]: {
        type: "board_drawing_segment",
        userId: currentUserId,
        userName: currentUser?.name || "",
        payload: { segmentId: gesture.strokeId, segment },
        timestamp
      }
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className={`board-drawing-canvas board-tool-${tool} ${disabled || tool === "move" ? "board-drawing-disabled" : "board-drawing-enabled"}`}
      aria-label="ボード全体の手書き入力"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      style={{ touchAction: disabled || tool === "move" ? "auto" : "none" }}
    />
  );
}
