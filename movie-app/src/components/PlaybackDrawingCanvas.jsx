import { useEffect, useRef } from "react";
import { clearCanvas, drawSegmentOnCanvas, resizeCanvasToDisplaySize } from "../utils/drawingUtils";

export default function PlaybackDrawingCanvas({
  segments = []
}) {
  const canvasRef = useRef(null);

  /*
   * ResizeObserver内でも最新のsegmentsを使用できるようにする。
   */
  const segmentsRef = useRef(segments);

  const redraw = () => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    resizeCanvasToDisplaySize(canvas);
    clearCanvas(canvas);

    segmentsRef.current.forEach((segment) => {
      drawSegmentOnCanvas(canvas, segment);
    });
  };

  /*
   * タイムラプスの再生位置が変わり、
   * segmentsが変化したときに描き直す。
   */
  useEffect(() => {
    segmentsRef.current = segments;
    redraw();
  }, [segments]);

  /*
   * タイムラプス内の付箋サイズが変わった場合にも
   * canvasを描き直す。
   */
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return undefined;

    const resizeObserver =
      new ResizeObserver(() => {
        redraw();
      });

    resizeObserver.observe(canvas);
    redraw();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="card-drawing-canvas read-only"
      aria-label="タイムラプス手書き表示"
    />
  );
}
