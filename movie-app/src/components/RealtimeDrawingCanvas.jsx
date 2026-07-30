import { useEffect, useRef } from "react";
import { onChildAdded, onChildRemoved, ref } from "firebase/database";
import { db } from "../firebase/firebase";
import {
  clearCanvas,
  drawSegmentOnCanvas,
  normalizeStoredPoints,
  resizeCanvasToDisplaySize
} from "../utils/drawingUtils";

const ERASER_RADIUS = 22;

function getCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))
  );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function getDisplayPoints(segment, canvas) {
  const points = normalizeStoredPoints(segment?.points);
  if (segment?.coordinateMode === "pixel") {
    return points.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }));
  }
  return points.map((point) => ({
    x: (Number(point.x) || 0) * canvas.clientWidth,
    y: (Number(point.y) || 0) * canvas.clientHeight
  }));
}

function distanceToStoredSegment(point, segment, canvas) {
  const points = getDisplayPoints(segment, canvas);
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);

  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, pointToSegmentDistance(point, points[index - 1], points[index]));
  }
  return best;
}

export default function RealtimeDrawingCanvas({
  boardId,
  cardId,
  canEdit,
  tool = "pen",
  startDrawOnCard,
  drawOnCard,
  stopDrawOnCard,
  onEraseStroke
}) {
  const canvasRef = useRef(null);
  const storedSegmentsRef = useRef(new Map());
  const eraserGestureRef = useRef({ active: false, pointerId: null, lastStrokeId: "" });

  const redrawAllSegments = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    clearCanvas(canvas);
    storedSegmentsRef.current.forEach((segment) => drawSegmentOnCanvas(canvas, segment));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !boardId || !cardId) return undefined;

    storedSegmentsRef.current.clear();
    resizeCanvasToDisplaySize(canvas);
    clearCanvas(canvas);

    const resizeObserver = new ResizeObserver(() => {
      if (resizeCanvasToDisplaySize(canvas)) redrawAllSegments();
    });
    resizeObserver.observe(canvas);

    const segmentsDbRef = ref(db, `boards/${boardId}/drawings/${cardId}/segments`);
    const unsubscribeAdded = onChildAdded(segmentsDbRef, (snapshot) => {
      const segment = snapshot.val();
      if (!segment) return;
      storedSegmentsRef.current.set(snapshot.key, segment);
      drawSegmentOnCanvas(canvasRef.current, segment);
    });
    const unsubscribeRemoved = onChildRemoved(segmentsDbRef, (snapshot) => {
      storedSegmentsRef.current.delete(snapshot.key);
      redrawAllSegments();
    });

    return () => {
      resizeObserver.disconnect();
      unsubscribeAdded();
      unsubscribeRemoved();
      storedSegmentsRef.current.clear();
    };
  }, [boardId, cardId]);

  const eraseAtPointer = (event) => {
    if (!canEdit || !onEraseStroke) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getCanvasPoint(event, canvas);

    let nearestKey = null;
    /** @type {any} */
    let nearestSegment = null;
    let bestDistance = ERASER_RADIUS;
    storedSegmentsRef.current.forEach((segment, key) => {
      const distance = distanceToStoredSegment(point, segment, canvas);
      if (distance <= bestDistance) {
        bestDistance = distance;
        nearestKey = key;
        nearestSegment = segment;
      }
    });

    if (!nearestKey || !nearestSegment) return;
    const strokeId = nearestSegment.strokeId || nearestKey;
    if (eraserGestureRef.current.lastStrokeId === strokeId) return;
    eraserGestureRef.current.lastStrokeId = strokeId;

    const segmentEntries = [...storedSegmentsRef.current.entries()].filter(
      ([key, segment]) => (segment.strokeId || key) === strokeId
    );

    onEraseStroke({
      cardId,
      strokeId,
      segmentIds: segmentEntries.map(([key]) => key),
      segments: segmentEntries.map(([key, segment]) => ({ id: key, ...segment }))
    });
  };

  const handlePointerDown = (event) => {
    event.stopPropagation();
    if (!canEdit) return;
    if (tool !== "eraser") {
      startDrawOnCard(event, cardId, canEdit);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    eraserGestureRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastStrokeId: ""
    };
    eraseAtPointer(event);
  };

  const handlePointerMove = (event) => {
    event.stopPropagation();
    if (tool !== "eraser") {
      drawOnCard(event, cardId, canEdit);
      return;
    }
    if (!eraserGestureRef.current.active || eraserGestureRef.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    eraseAtPointer(event);
  };

  const handlePointerEnd = (event) => {
    event.stopPropagation();
    if (tool !== "eraser") {
      stopDrawOnCard(event, cardId);
      return;
    }
    if (!eraserGestureRef.current.active) return;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // 解放済みの場合は何もしない。
    }
    eraserGestureRef.current = { active: false, pointerId: null, lastStrokeId: "" };
  };

  return (
    <canvas
      ref={canvasRef}
      className={`card-drawing-canvas ${canEdit ? "card-drawing-enabled" : "read-only card-drawing-disabled"} drawing-tool-${tool}`}
      aria-label={tool === "eraser" ? "手書き消しゴム" : "手書き入力欄"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    />
  );
}
