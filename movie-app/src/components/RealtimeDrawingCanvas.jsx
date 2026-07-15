import { useEffect, useRef } from "react";
import { onChildAdded, onChildRemoved, ref } from "firebase/database";
import { db } from "../firebase/firebase";
import { clearCanvas, drawSegmentOnCanvas, resizeCanvasToDisplaySize } from "../utils/drawingUtils";

export default function RealtimeDrawingCanvas({
  boardId,
  cardId,
  canEdit,
  startDrawOnCard,
  drawOnCard,
  stopDrawOnCard
}) {
  const canvasRef = useRef(null);

  /*
   * Firebaseから受信済みの線分を保持する。
   * canvasのサイズ変更後、このデータから再描画する。
   */
  const storedSegmentsRef = useRef(new Map());

  const redrawAllSegments = () => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    clearCanvas(canvas);

    storedSegmentsRef.current.forEach(
      (segment) => {
        drawSegmentOnCanvas(canvas, segment);
      }
    );
  };

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !boardId || !cardId) {
      return undefined;
    }

    storedSegmentsRef.current.clear();

    resizeCanvasToDisplaySize(canvas);
    clearCanvas(canvas);

    /*
     * 付箋のリサイズによってcanvasの表示サイズが変わったら、
     * 内部サイズを変更して全線分を描き直す。
     */
    const resizeObserver = new ResizeObserver(() => {
      const resized =
        resizeCanvasToDisplaySize(canvas);

      if (resized) {
        redrawAllSegments();
      }
    });

    resizeObserver.observe(canvas);

    const segmentsDbRef = ref(
      db,
      `boards/${boardId}/drawings/${cardId}/segments`
    );

    /*
     * Firebaseに線分が追加されたとき、
     * 受信した線分だけを追加描画する。
     */
    const unsubscribeAdded = onChildAdded(
      segmentsDbRef,
      (snapshot) => {
        const segment = snapshot.val();

        if (!segment) return;

        storedSegmentsRef.current.set(
          snapshot.key,
          segment
        );

        drawSegmentOnCanvas(
          canvasRef.current,
          segment
        );
      }
    );

    /*
     * 線分が削除された場合、
     * 残っている線分をすべて描き直す。
     */
    const unsubscribeRemoved = onChildRemoved(
      segmentsDbRef,
      (snapshot) => {
        storedSegmentsRef.current.delete(
          snapshot.key
        );

        redrawAllSegments();
      }
    );

    return () => {
      resizeObserver.disconnect();
      unsubscribeAdded();
      unsubscribeRemoved();

      storedSegmentsRef.current.clear();
    };
  }, [boardId, cardId]);

  return (
    <canvas
      ref={canvasRef}
      className={`card-drawing-canvas ${canEdit ? "" : "read-only"
        }`}
      aria-label="手書き入力欄"
      onPointerDown={(e) =>
        startDrawOnCard(e, cardId, canEdit)
      }
      onPointerMove={(e) =>
        drawOnCard(e, cardId, canEdit)
      }
      onPointerUp={(e) =>
        stopDrawOnCard(e, cardId)
      }
      onPointerCancel={(e) =>
        stopDrawOnCard(e, cardId)
      }
      onLostPointerCapture={(e) =>
        stopDrawOnCard(e, cardId)
      }
    />
  );
}

