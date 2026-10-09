import { useRef, useState } from "react";

const BOARD_WIDTH = 2200;
const BOARD_HEIGHT = 1400;

const getCardAtPoint = (cards, point) => {
  const entries = Object.entries(cards || {}).sort(
    ([, a], [, b]) => (Number(b.zIndex) || 1) - (Number(a.zIndex) || 1)
  );

  for (const [id, card] of entries) {
    const x = Number(card.x) || 0;
    const y = Number(card.y) || 0;
    const width = Number(card.width) || 260;
    const height = Number(card.height) || 360;
    if (
      point.x >= x &&
      point.x <= x + width &&
      point.y >= y &&
      point.y <= y + height
    ) {
      return id;
    }
  }
  return null;
};

const getSvgPoint = (event, svg) => {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT
  };
};

// Keep the original stroke unchanged; derive its geometry from the current cards.
const getCardRect = (card) => ({
  x: Number(card?.x) || 0,
  y: Number(card?.y) || 0,
  width: Number(card?.width) > 0 ? Number(card.width) : 260,
  height: Number(card?.height) > 0 ? Number(card.height) : 360
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const interpolatePoint = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
});
const centerOf = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const inflateRect = (rect, padding) => ({
  x: rect.x - padding, y: rect.y - padding,
  width: rect.width + padding * 2, height: rect.height + padding * 2
});

// The interval of a line segment lying inside a rectangle (including its border).
const segmentRectInterval = (a, b, rect) => {
  let entry = 0;
  let exit = 1;
  for (const [axis, size] of [["x", "width"], ["y", "height"]]) {
    const delta = b[axis] - a[axis];
    const low = rect[axis];
    const high = low + rect[size];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < low || a[axis] > high) return null;
      continue;
    }
    const t1 = (low - a[axis]) / delta;
    const t2 = (high - a[axis]) / delta;
    entry = Math.max(entry, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (entry > exit) return null;
  }
  return { entry, exit };
};

const removeDuplicatePoints = (points) => points.filter((point, index) =>
  index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.01
);

// One light corner-cutting pass preserves the hand-drawn bends and avoids sharp kinks.
const smoothStroke = (points) => {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    result.push(interpolatePoint(points[index - 1], points[index], 0.25));
    result.push(interpolatePoint(points[index - 1], points[index], 0.75));
  }
  result.push(points.at(-1));
  return removeDuplicatePoints(result);
};

const clipBetweenCards = (points, from, to) => {
  if (points.length < 2) return [];
  // Overlapping cards retain the connection data; show the arrow again when separated.
  if (from.x < to.x + to.width && from.x + from.width > to.x &&
      from.y < to.y + to.height && from.y + from.height > to.y) return [];

  const fromBounds = inflateRect(from, 5);
  const toBounds = inflateRect(to, 5);
  let start = null;
  for (let index = 1; index < points.length; index += 1) {
    const interval = segmentRectInterval(points[index - 1], points[index], fromBounds);
    if (interval) start = index - 1 + interval.exit;
  }
  if (start === null || start >= points.length - 1) return [];

  let end = null;
  for (let index = 1; index < points.length; index += 1) {
    const interval = segmentRectInterval(points[index - 1], points[index], toBounds);
    if (!interval || index - 1 + interval.exit < start) continue;
    end = Math.max(start, index - 1 + interval.entry);
    break;
  }
  if (end === null || end - start < 1e-6) return [];

  const pointAt = (position) => {
    const index = Math.min(Math.floor(position), points.length - 2);
    return interpolatePoint(points[index], points[index + 1], position - index);
  };
  const visible = [pointAt(start)];
  for (let index = Math.floor(start) + 1; index < end; index += 1) {
    visible.push(points[index]);
  }
  visible.push(pointAt(end));
  return removeDuplicatePoints(visible);
};

const getCurrentPoints = (connection, cards) => {
  if (!cards?.[connection.from] || !cards?.[connection.to]) return [];
  const from = getCardRect(cards[connection.from]);
  const to = getCardRect(cards[connection.to]);
  const storedPoints = Array.isArray(connection.points)
    ? connection.points
    : Object.values(connection.points || {});
  const points = removeDuplicatePoints(storedPoints
    .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const straight = () => clipBetweenCards([centerOf(from), centerOf(to)], from, to);
  if (points.length < 2) return straight();

  const first = points[0];
  const last = points.at(-1);
  // Legacy connections did not store width/height. Use the original default sizes.
  const originalFrom = getCardRect(connection.fromPosition || { x: first.x - 130, y: first.y - 180 });
  const originalTo = getCardRect(connection.toPosition || { x: last.x - 130, y: last.y - 180 });
  const resizeAnchor = (point, original, current) => ({
    x: current.x + clamp01((point.x - original.x) / original.width) * current.width,
    y: current.y + clamp01((point.y - original.y) / original.height) * current.height
  });
  const start = resizeAnchor(first, originalFrom, from);
  const end = resizeAnchor(last, originalTo, to);
  const oldLength = Math.hypot(last.x - first.x, last.y - first.y);
  const newLength = Math.hypot(end.x - start.x, end.y - start.y);
  if (oldLength < 0.01 || newLength < 0.01) return straight();

  const oldAxis = { x: (last.x - first.x) / oldLength, y: (last.y - first.y) / oldLength };
  const newAxis = { x: (end.x - start.x) / newLength, y: (end.y - start.y) / newLength };
  // Rotate with the cards, reduce bends when close, and limit excessive sideways stretching.
  const bendScale = Math.min(2, newLength / oldLength);
  const transformed = points.map((point) => {
    const dx = point.x - first.x;
    const dy = point.y - first.y;
    const progress = (dx * oldAxis.x + dy * oldAxis.y) / oldLength;
    const bend = (-dx * oldAxis.y + dy * oldAxis.x) * bendScale;
    return {
      x: start.x + progress * newLength * newAxis.x - bend * newAxis.y,
      y: start.y + progress * newLength * newAxis.y + bend * newAxis.x
    };
  });
  const visible = clipBetweenCards(smoothStroke(transformed), from, to);
  return visible.length >= 2 ? visible : straight();
};

const getArrowHeadPoints = (points) => {
  const tip = points.at(-1);
  let previous = points[0];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalLength += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  for (let index = points.length - 2; index >= 0; index -= 1) {
    previous = points[index];
    if (Math.hypot(tip.x - previous.x, tip.y - previous.y) >= 8) break;
  }
  const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
  const headLength = Math.min(18, totalLength * 0.4);
  const left = angle + Math.PI * 0.82;
  const right = angle - Math.PI * 0.82;
  return [
    { x: tip.x + Math.cos(left) * headLength, y: tip.y + Math.sin(left) * headLength },
    tip,
    { x: tip.x + Math.cos(right) * headLength, y: tip.y + Math.sin(right) * headLength }
  ];
};

const getArrowPath = (points) => {
  if (points.length < 2) return "";
  const line = `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}`;
  return `${line} M ${getArrowHeadPoints(points).map((point) => `${point.x} ${point.y}`).join(" L ")}`;
};

const distanceToSegment = (point, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  ));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
};

const findNearestConnection = (connections, cards, point, radius) => {
  let nearest = null;
  let bestDistance = radius;
  for (const [id, connection] of Object.entries(connections || {})) {
    const points = getCurrentPoints(connection, cards);
    if (points.length < 2) continue;
    for (const line of [points, getArrowHeadPoints(points)]) {
      for (let index = 1; index < line.length; index += 1) {
        const distance = distanceToSegment(point, line[index - 1], line[index]);
        if (distance <= bestDistance) {
          bestDistance = distance;
          nearest = { id, connection };
        }
      }
    }
  }
  return nearest;
};

export default function CardConnectionLayer({
  cards,
  connections,
  tool,
  onCreateConnection,
  onDeleteConnection
}) {
  const svgRef = useRef(null);
  const gestureRef = useRef(null);
  const pendingDeletesRef = useRef(new Set());
  const [draft, setDraft] = useState(null);

  const deleteConnection = async (id, connection) => {
    if (pendingDeletesRef.current.has(id)) return;
    pendingDeletesRef.current.add(id);
    try {
      if (typeof onDeleteConnection !== "function") {
        throw new Error("App.jsxに矢印の削除処理が設定されていません。");
      }
      await onDeleteConnection(id, connection);
    } catch (error) {
      console.error("矢印の削除に失敗しました", error);
      alert(`矢印を削除できませんでした: ${error.message}`);
    } finally {
      pendingDeletesRef.current.delete(id);
    }
  };

  const startDrawing = (event) => {
    if (!["arrow", "arrow-erase"].includes(tool) || event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = getSvgPoint(event, svg);
    if (!point) return;
    if (tool === "arrow-erase") {
      event.preventDefault();
      event.stopPropagation();
      const radius = 18 * BOARD_WIDTH / svg.getBoundingClientRect().width;
      const target = findNearestConnection(connections, cards, point, radius);
      if (target) void deleteConnection(target.id, target.connection);
      return;
    }
    const fromId = point && getCardAtPoint(cards, point);
    if (!point || !fromId) return;

    event.preventDefault();
    event.stopPropagation();
    svg.setPointerCapture?.(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      fromId,
      fromPosition: getCardRect(cards[fromId]),
      points: [point]
    };
    setDraft([point]);
  };

  const continueDrawing = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = getSvgPoint(event, svgRef.current);
    if (!point) return;
    event.preventDefault();
    const previous = gesture.points.at(-1);
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 3) return;
    gesture.points.push(point);
    setDraft([...gesture.points]);
  };

  const finishDrawing = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = getSvgPoint(event, svgRef.current);
    const toId = point && getCardAtPoint(cards, point);
    if (point) gesture.points.push(point);

    if (toId && cards[gesture.fromId] && toId !== gesture.fromId && gesture.points.length >= 2) {
      onCreateConnection({
        from: gesture.fromId,
        to: toId,
        points: gesture.points,
        fromPosition: gesture.fromPosition,
        toPosition: getCardRect(cards[toId]),
        color: "#333333"
      });
    }

    try {
      svgRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released by Android WebView.
    }
    gestureRef.current = null;
    setDraft(null);
  };

  return (
    <svg
      ref={svgRef}
      className={`card-connection-layer ${["arrow", "arrow-erase"].includes(tool) ? "card-connection-layer-active" : ""} ${tool === "eraser" ? "card-connection-layer-eraser" : ""}`}
      style={tool === "arrow-erase" ? { pointerEvents: "all", touchAction: "none", cursor: "cell" } : undefined}
      viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
      aria-label="付箋を手書き矢印でつなぐ"
      onPointerDown={startDrawing}
      onPointerMove={continueDrawing}
      onPointerUp={finishDrawing}
      onPointerCancel={finishDrawing}
      onLostPointerCapture={(event) => {
        if (gestureRef.current?.pointerId === event.pointerId) {
          gestureRef.current = null;
          setDraft(null);
        }
      }}
    >
      {Object.entries(connections || {}).map(([id, connection]) => {
        const points = getCurrentPoints(connection, cards);
        if (points.length < 2) return null;
        return (
          <g key={id}>
            {tool === "eraser" && (
              <path
                d={getArrowPath(points)}
                fill="none"
                stroke="transparent"
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="stroke"
                className="card-connection-delete-target"
                aria-label="この矢印を削除"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  void deleteConnection(id, connection);
                }}
              />
            )}
            <path
              d={getArrowPath(points)}
              fill="none"
              stroke={connection.color || "#333333"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          </g>
        );
      })}
      {draft && (
        <path
          d={getArrowPath(draft)}
          fill="none"
          stroke="#333333"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="8 6"
        />
      )}
    </svg>
  );
}
