import { useEffect, useRef, useState } from "react";
import { MAX_BOARD_ZOOM, MIN_BOARD_ZOOM } from "../constants/appConstants";

function getDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

/**
 * ボタン操作と2本指ピンチによるボード倍率変更を管理する。
 */
export default function useBoardZoom({
  boardId,
  boardTool,
  boardRef,
  onPinchStart
}) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pinchGestureRef = useRef({ active: false });

  const zoomIn = () => setZoom((value) =>
    Math.min(MAX_BOARD_ZOOM, Number((value + 0.1).toFixed(2)))
  );
  const zoomOut = () => setZoom((value) =>
    Math.max(MIN_BOARD_ZOOM, Number((value - 0.1).toFixed(2)))
  );
  const resetZoom = () => setZoom(1);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const scrollElement = boardRef.current;
    if (!scrollElement || !boardId) return undefined;

    const handleTouchStart = (event) => {
      if (boardTool !== "move" || event.touches.length !== 2) return;
      event.preventDefault();
      onPinchStart?.();

      const rect = scrollElement.getBoundingClientRect();
      const midpoint = getMidpoint(event.touches);
      const localX = midpoint.x - rect.left;
      const localY = midpoint.y - rect.top;
      const currentZoom = zoomRef.current;

      pinchGestureRef.current = {
        active: true,
        startDistance: Math.max(1, getDistance(event.touches)),
        startZoom: currentZoom,
        contentX: (scrollElement.scrollLeft + localX) / currentZoom,
        contentY: (scrollElement.scrollTop + localY) / currentZoom
      };
    };

    const handleTouchMove = (event) => {
      const gesture = pinchGestureRef.current;
      if (!gesture.active || event.touches.length !== 2) return;
      event.preventDefault();

      const rect = scrollElement.getBoundingClientRect();
      const midpoint = getMidpoint(event.touches);
      const localX = midpoint.x - rect.left;
      const localY = midpoint.y - rect.top;
      const ratio = getDistance(event.touches) / gesture.startDistance;
      const nextZoom = Math.min(
        MAX_BOARD_ZOOM,
        Math.max(MIN_BOARD_ZOOM, gesture.startZoom * ratio)
      );

      zoomRef.current = nextZoom;
      setZoom(Number(nextZoom.toFixed(3)));

      window.requestAnimationFrame(() => {
        scrollElement.scrollLeft = gesture.contentX * nextZoom - localX;
        scrollElement.scrollTop = gesture.contentY * nextZoom - localY;
      });
    };

    const handleTouchEnd = (event) => {
      if (event.touches.length < 2) {
        pinchGestureRef.current = { active: false };
      }
    };

    const options = { passive: false, capture: true };
    scrollElement.addEventListener("touchstart", handleTouchStart, options);
    scrollElement.addEventListener("touchmove", handleTouchMove, options);
    scrollElement.addEventListener("touchend", handleTouchEnd, options);
    scrollElement.addEventListener("touchcancel", handleTouchEnd, options);

    return () => {
      scrollElement.removeEventListener("touchstart", handleTouchStart, options);
      scrollElement.removeEventListener("touchmove", handleTouchMove, options);
      scrollElement.removeEventListener("touchend", handleTouchEnd, options);
      scrollElement.removeEventListener("touchcancel", handleTouchEnd, options);
      pinchGestureRef.current = { active: false };
    };
  }, [boardId, boardTool, boardRef, onPinchStart]);

  return {
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom
  };
}
