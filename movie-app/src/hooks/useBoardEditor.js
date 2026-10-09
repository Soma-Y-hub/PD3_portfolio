import { useCallback, useRef, useState } from "react";
import { push, ref, serverTimestamp, update } from "firebase/database";
import { db } from "../firebase/firebase";
import {
  DRAWING_COLOR,
  DRAWING_WIDTH_PX,
  DRAWING_FLUSH_INTERVAL_MS
} from "../constants/appConstants";
import { clamp } from "../utils/commonUtils";
import { drawSegmentOnCanvas, resizeCanvasToDisplaySize } from "../utils/drawingUtils";
import { uploadMedia } from "../services/mediaService";

export default function useBoardEditor({
  boardId,
  currentUserId,
  currentUser,
  cards,
  mediaItems,
  connections,
  zoomRef,
  boardRef,
  boardCanvasRef,
  addHistoryEvent,
  onCloseSidePanel
}) {
  const drawingRef = useRef({ isDrawing: false });
  const moveHistoryRef = useRef(null);
  const mediaMoveRef = useRef(null);
  const mediaResizeRef = useRef(null);
  const resizeHistoryRef = useRef(null);
  const focusedCardTimerRef = useRef(null);

  const [movingCard, setMovingCard] = useState(null);
  const [movingMedia, setMovingMedia] = useState(null);
  const [resizingMedia, setResizingMedia] = useState(null);
  const [resizingCard, setResizingCard] = useState(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState(null);
  const [boardTool, setBoardTool] = useState("move");
  const [cardDrawingTool, setCardDrawingTool] = useState("pen");
  const [cardMenuId, setCardMenuId] = useState(null);
  const [focusedCardId, setFocusedCardId] = useState(null);

  /**
   * 画面上のポインター座標を、拡大前のボード座標へ変換する。
   * スクロール量・ヘッダー位置・zoomの影響をまとめて補正する。
   */
  const getBoardPoint = (event) => {
    const canvas = boardCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const layoutWidth = canvas.clientWidth;
    const layoutHeight = canvas.clientHeight;

    if (
      rect.width === 0 ||
      rect.height === 0 ||
      layoutWidth === 0 ||
      layoutHeight === 0
    ) {
      return null;
    }

    return {
      x: (event.clientX - rect.left) * (layoutWidth / rect.width),
      y: (event.clientY - rect.top) * (layoutHeight / rect.height)
    };
  };

  const addCard = async () => {
    if (!boardId || !currentUserId || !currentUser) return;

    const cardRef = push(ref(db, `boards/${boardId}/cards`));
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    const timestamp = serverTimestamp();
    const nextZIndex = Math.max(
      0,
      ...Object.values(cards).map((card) => Number(card?.zIndex) || 0)
    ) + 1;
    const cardData = {
      text: "新しい考え",
      x: 120,
      y: 120,
      width: 260,
      height: 360,
      owner: currentUserId,
      ownerName: currentUser.name,
      color: currentUser.color || "#fff176",
      type: "idea",
      zIndex: nextZIndex
    };

    

    await update(ref(db, `boards/${boardId}`), {
      [`cards/${cardRef.key}`]: {
        ...cardData,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      [`history/${historyRef.key}`]: {
        type: "card_created",
        cardId: cardRef.key,
        userId: currentUserId,
        userName: currentUser.name,
        payload: { card: { ...cardData, id: cardRef.key } },
        timestamp
      },
      [`activityEvents/${activityRef.key}`]: {
        type: "card_created",
        cardId: cardRef.key,
        userId: currentUserId,
        userName: currentUser.name,
        payload: { card: { ...cardData, id: cardRef.key } },
        timestamp
      }
    });
  };
const handleUpload = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const result = await uploadMedia({ boardId, file });
    const mediaRef = push(ref(db, `boards/${boardId}/media`));
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    const timestamp = serverTimestamp();
    const mediaData = {
      type: result.type,
      url: result.url,
      storagePath: result.storagePath,
      fileName: result.fileName,
      width: result.type === "image" ? 420 : 500,
      height: result.type === "image" ? 300 : 320,
      x: 150,
      y: 150,
      owner: currentUserId,
      ownerName: currentUser.name,
      isReflectionPoint: false,
      reflectionReason: "",
      deleted: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const payload = { mediaId: mediaRef.key, media: { id: mediaRef.key, ...mediaData } };

    await update(ref(db, `boards/${boardId}`), {
      [`media/${mediaRef.key}`]: mediaData,
      [`history/${historyRef.key}`]: {
        type: "media_created",
        userId: currentUserId,
        userName: currentUser.name,
        payload,
        timestamp
      },
      [`activityEvents/${activityRef.key}`]: {
        type: "media_created",
        userId: currentUserId,
        userName: currentUser.name,
        payload,
        timestamp
      }
    });

    alert("アップロードしました");
  } catch (error) {
    console.error(error);
    alert(error instanceof Error ? error.message : "アップロードに失敗しました");
  } finally {
    event.target.value = "";
  }
};
  const updateCard = (id, data) => {
    update(ref(db, `boards/${boardId}/cards/${id}`), {
      ...data,
      updatedAt: serverTimestamp()
    });
  };

  const changeCardType = async (cardId, card, newType) => {
    if ((card.type || "idea") === newType) return;

    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    const timestamp = serverTimestamp();
    const payload = {
      beforeType: card.type || "idea",
      afterType: newType,
      card: {
        id: cardId,
        owner: card.owner,
        ownerName: card.ownerName,
        color: card.color,
        type: card.type || "idea",
        width: card.width || 260,
        height: card.height || 360,
        createdAt: card.createdAt || null,
        updatedAt: card.updatedAt || null
      },
      beforeCard: {
        id: cardId,
        owner: card.owner,
        ownerName: card.ownerName,
        color: card.color,
        type: card.type || "idea",
        width: card.width || 260,
        height: card.height || 360
      },
      afterCard: {
        id: cardId,
        owner: card.owner,
        ownerName: card.ownerName,
        color: card.color,
        type: newType,
        width: card.width || 260,
        height: card.height || 360
      }
    };

    await update(ref(db, `boards/${boardId}`), {
      [`cards/${cardId}/type`]: newType,
      [`cards/${cardId}/updatedAt`]: timestamp,
      [`history/${historyRef.key}`]: {
        type: "card_type_changed",
        cardId,
        userId: currentUserId,
        userName: currentUser.name,
        payload,
        timestamp
      },
      [`activityEvents/${activityRef.key}`]: {
        type: "card_type_changed",
        cardId,
        userId: currentUserId,
        userName: currentUser.name,
        payload,
        timestamp
      }
    });
  };

  const deleteCard = async (id, card) => {
    const isAdmin = currentUser?.role === "admin";
    if (!isAdmin && card.owner !== currentUserId) {
      alert("他のユーザーの付箋は削除できません");
      return;
    }

    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    const timestamp = serverTimestamp();
    const deletedCard = {
      id,
      text: card.text || "",
      x: card.x,
      y: card.y,
      width: card.width || 260,
      height: card.height || 360,
      owner: card.owner,
      ownerName: card.ownerName,
      color: card.color,
      type: card.type || "idea",
      createdAt: card.createdAt || null,
      updatedAt: card.updatedAt || null
    };
    const payload = { card: deletedCard };
    const updates = {
      [`cards/${id}`]: null,
      [`drawings/${id}`]: null,
      [`history/${historyRef.key}`]: {
        type: "card_deleted",
        cardId: id,
        userId: currentUserId,
        userName: currentUser.name,
        payload,
        timestamp
      },
      [`activityEvents/${activityRef.key}`]: {
        type: "card_deleted",
        cardId: id,
        userId: currentUserId,
        userName: currentUser.name,
        payload,
        timestamp
      }
    };

    Object.entries(connections).forEach(([connectionId, connection]) => {
      if (connection.from === id || connection.to === id) {
        updates[`connections/${connectionId}`] = null;
      }
    });

    await update(ref(db, `boards/${boardId}`), updates);
  };

  const handlePointerDown = (e, id, card) => {
    if (boardTool !== "move" || connectMode || resizingCard || drawingRef.current.isDrawing) return;
    e.preventDefault();

    const point = getBoardPoint(e);
    if (!point) return;

    setMovingCard({
      id,
      offsetX: point.x - Number(card.x || 0),
      offsetY: point.y - Number(card.y || 0)
    });
    moveHistoryRef.current = {
      cardId: id,
      startX: card.x,
      startY: card.y,
      lastX: card.x,
      lastY: card.y
    };

    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (connectMode || resizingCard || drawingRef.current.isDrawing) return;
    if (!movingCard) return;

    const card = cards[movingCard.id];
    const point = getBoardPoint(e);
    if (!card || !point) return;

    const width = Number(card.width) || 260;
    const height = Number(card.height) || 360;
    const canvasWidth = boardCanvasRef.current?.clientWidth || 2200;
    const canvasHeight = boardCanvasRef.current?.clientHeight || 1400;
    const x = clamp(point.x - movingCard.offsetX, 0, Math.max(0, canvasWidth - width));
    const y = clamp(point.y - movingCard.offsetY, 0, Math.max(0, canvasHeight - height));

    if (moveHistoryRef.current?.cardId === movingCard.id) {
      moveHistoryRef.current.lastX = x;
      moveHistoryRef.current.lastY = y;
    }

    updateCard(movingCard.id, { ...card, x, y });
  };

  const handlePointerUp = async () => {
    const move = moveHistoryRef.current;
    setMovingCard(null);
    moveHistoryRef.current = null;
    if (!move) return;

    const moved = Math.abs(move.startX - move.lastX) > 1 || Math.abs(move.startY - move.lastY) > 1;
    if (moved) {
      await addHistoryEvent({
        type: "card_moved",
        cardId: move.cardId,
        payload: { x: move.lastX, y: move.lastY }
      });
    }
  };

  const updateMediaItem = (mediaId, data) => {
    update(ref(db, `boards/${boardId}/media/${mediaId}`), {
      ...data,
      updatedAt: serverTimestamp()
    });
  };

  const handleMediaPointerDown = (e, mediaId, media) => {
    if (boardTool !== "move" || connectMode || movingCard || resizingCard || drawingRef.current.isDrawing) return;
    e.preventDefault();
    e.stopPropagation();

    const point = getBoardPoint(e);
    if (!point) return;

    const parsedStartX = Number(media.x);
    const parsedStartY = Number(media.y);
    const startX = Number.isFinite(parsedStartX) ? parsedStartX : 150;
    const startY = Number.isFinite(parsedStartY) ? parsedStartY : 150;

    setMovingMedia({
      id: mediaId,
      offsetX: point.x - startX,
      offsetY: point.y - startY
    });

    mediaMoveRef.current = {
      mediaId,
      startX,
      startY,
      lastX: startX,
      lastY: startY
    };

    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleMediaPointerMove = (e) => {
    if (!movingMedia) return;
    e.preventDefault();
    e.stopPropagation();

    const media = mediaItems[movingMedia.id];
    const point = getBoardPoint(e);
    if (!media || !point) return;

    const width = Number(media.width) || 500;
    const height = Number(media.height) || 300;
    const canvasWidth = boardCanvasRef.current?.clientWidth || 2200;
    const canvasHeight = boardCanvasRef.current?.clientHeight || 1400;

    const rawX = point.x - movingMedia.offsetX;
    const rawY = point.y - movingMedia.offsetY;
    const x = clamp(rawX, 0, Math.max(0, canvasWidth - width));
    const y = clamp(rawY, 0, Math.max(0, canvasHeight - height));

    if (mediaMoveRef.current?.mediaId === movingMedia.id) {
      mediaMoveRef.current.lastX = x;
      mediaMoveRef.current.lastY = y;
    }

    updateMediaItem(movingMedia.id, { x, y });
  };

  const handleMediaPointerUp = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    const move = mediaMoveRef.current;
    setMovingMedia(null);
    mediaMoveRef.current = null;

    if (!move) return;

    const moved =
      Math.abs(move.startX - move.lastX) > 1 ||
      Math.abs(move.startY - move.lastY) > 1;

    if (moved) {
      const media = mediaItems[move.mediaId] || {};
      await addHistoryEvent({
        type: "media_moved",
        includeInActivity: true,
        payload: {
          mediaId: move.mediaId,
          beforeX: move.startX,
          beforeY: move.startY,
          afterX: move.lastX,
          afterY: move.lastY,
          media: { id: move.mediaId, ...media, x: move.lastX, y: move.lastY }
        }
      });
    }
  };


  const startResizeMedia = (e, mediaId, media) => {
    if (boardTool !== "move") return;
    e.preventDefault();
    e.stopPropagation();
    const width = Number(media.width) || 500;
    const height = Number(media.height) || 300;
    setResizingMedia({ id: mediaId, startX: e.clientX, startY: e.clientY, startWidth: width, startHeight: height });
    mediaResizeRef.current = { mediaId, startWidth: width, startHeight: height, lastWidth: width, lastHeight: height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const moveResizeMedia = (e) => {
    if (!resizingMedia) return;
    e.preventDefault();
    e.stopPropagation();
    const width = Math.max(180, resizingMedia.startWidth + (e.clientX - resizingMedia.startX) / Math.max(0.01, zoomRef.current));
    const height = Math.max(120, resizingMedia.startHeight + (e.clientY - resizingMedia.startY) / Math.max(0.01, zoomRef.current));
    if (mediaResizeRef.current?.mediaId === resizingMedia.id) {
      mediaResizeRef.current.lastWidth = width;
      mediaResizeRef.current.lastHeight = height;
    }
    updateMediaItem(resizingMedia.id, { width, height });
  };

  const endResizeMedia = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const resize = mediaResizeRef.current;
    setResizingMedia(null);
    mediaResizeRef.current = null;
    if (!resize) return;
    const changed = Math.abs(resize.startWidth - resize.lastWidth) > 1 || Math.abs(resize.startHeight - resize.lastHeight) > 1;
    if (!changed) return;
    const media = mediaItems[resize.mediaId] || {};
    await addHistoryEvent({
      type: "media_resized",
      includeInActivity: true,
      payload: {
        mediaId: resize.mediaId,
        beforeWidth: resize.startWidth,
        beforeHeight: resize.startHeight,
        afterWidth: resize.lastWidth,
        afterHeight: resize.lastHeight,
        media: { id: resize.mediaId, ...media, width: resize.lastWidth, height: resize.lastHeight }
      }
    });
  };

  const toggleMediaReflectionPoint = async (e, mediaId, media) => {
    e.preventDefault();
    e.stopPropagation();
    const nextValue = !media.isReflectionPoint;
    let reason = media.reflectionReason || "";
    if (nextValue) {
      const input = window.prompt("この写真・動画を振り返りのポイントにする理由を入力してください。", reason);
      if (input === null) return;
      reason = input.trim();
    }

    await update(ref(db, `boards/${boardId}/media/${mediaId}`), {
      isReflectionPoint: nextValue,
      reflectionReason: nextValue ? reason : "",
      reflectionMarkedAt: nextValue ? serverTimestamp() : null,
      updatedAt: serverTimestamp()
    });

    await addHistoryEvent({
      type: nextValue ? "media_marked_as_reflection_point" : "media_unmarked_as_reflection_point",
      includeInActivity: true,
      payload: {
        mediaId,
        reason: nextValue ? reason : "",
        media: { id: mediaId, ...media, isReflectionPoint: nextValue, reflectionReason: reason }
      }
    });
  };

  const handleVideoPlayed = async (mediaId, media) => {
    if (media.lastPlayedBy === currentUserId && Date.now() - Number(media.lastPlayedAt || 0) < 30000) return;
    await update(ref(db, `boards/${boardId}/media/${mediaId}`), {
      lastPlayedBy: currentUserId,
      lastPlayedAt: serverTimestamp()
    });
    await addHistoryEvent({
      type: "media_played",
      payload: { mediaId, media: { id: mediaId, ...media } }
    });
  };

  const handleDeleteMedia = async (e, mediaId, media) => {
    e.preventDefault();
    e.stopPropagation();

    if (!mediaId || !media) return;

    const fileLabel = media.fileName || "このメディア";
    const confirmed = window.confirm(
      `${fileLabel}をボードから取り除きますか？\nタイムラプスで再現できるよう、元データは保管されます。`
    );

    if (!confirmed) return;

    try {
      // Supabase上の実ファイルは削除せず、通常ボードからだけ非表示にする。
      await update(ref(db, `boards/${boardId}/media/${mediaId}`), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: currentUserId,
        deletedByName: currentUser?.name || "",
        updatedAt: serverTimestamp()
      });

      await addHistoryEvent({
        type: "media_deleted",
        includeInActivity: true,
        payload: {
          mediaId,
          fileName: media.fileName || "",
          mediaType: media.type || "",
          storagePath: media.storagePath || "",
          media: { id: mediaId, ...media, deleted: true }
        }
      });
    } catch (error) {
      console.error("メディアの削除に失敗しました:", error);
      alert(
        error instanceof Error
          ? error.message
          : "メディアの削除に失敗しました。"
      );
    }
  };

  const startResizeCard = (e, id, card) => {
    if (boardTool !== "move" || connectMode || drawingRef.current.isDrawing) return;
    e.preventDefault();
    e.stopPropagation();

    const width = card.width || 260;
    const height = card.height || 360;
    setResizingCard({
      id,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: width,
      startHeight: height
    });
    resizeHistoryRef.current = {
      cardId: id,
      cardType: card.type || "idea",
      cardOwner: card.owner,
      cardOwnerName: card.ownerName,
      startWidth: width,
      startHeight: height,
      lastWidth: width,
      lastHeight: height,
      startedAtClient: Date.now(),
      startedAtPerformance: performance.now()
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const moveResizeCard = (e) => {
    if (!resizingCard) return;
    e.preventDefault();
    e.stopPropagation();

    const card = cards[resizingCard.id];
    if (!card) return;
    const width = Math.max(220, resizingCard.startWidth + (e.clientX - resizingCard.startX) / Math.max(0.01, zoomRef.current));
    const height = Math.max(280, resizingCard.startHeight + (e.clientY - resizingCard.startY) / Math.max(0.01, zoomRef.current));

    if (resizeHistoryRef.current?.cardId === resizingCard.id) {
      resizeHistoryRef.current.lastWidth = width;
      resizeHistoryRef.current.lastHeight = height;
    }

    updateCard(resizingCard.id, { ...card, width, height });
  };

  const endResizeCard = async () => {
    const resize = resizeHistoryRef.current;
    setResizingCard(null);
    resizeHistoryRef.current = null;
    if (!resize) return;

    const changed =
      Math.abs(resize.startWidth - resize.lastWidth) > 1 ||
      Math.abs(resize.startHeight - resize.lastHeight) > 1;

    if (!changed) return;

    const endedAtClient = Date.now();
    const durationMs = Math.max(
      0,
      performance.now() - resize.startedAtPerformance
    );
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    const timestamp = serverTimestamp();
    const payload = {
      width: resize.lastWidth,
      height: resize.lastHeight,
      beforeWidth: resize.startWidth,
      beforeHeight: resize.startHeight,
      afterWidth: resize.lastWidth,
      afterHeight: resize.lastHeight,
      cardType: resize.cardType,
      card: {
        id: resize.cardId,
        owner: resize.cardOwner,
        ownerName: resize.cardOwnerName,
        type: resize.cardType,
        width: resize.startWidth,
        height: resize.startHeight
      },
      beforeCard: {
        id: resize.cardId,
        owner: resize.cardOwner,
        ownerName: resize.cardOwnerName,
        type: resize.cardType,
        width: resize.startWidth,
        height: resize.startHeight
      },
      afterCard: {
        id: resize.cardId,
        owner: resize.cardOwner,
        ownerName: resize.cardOwnerName,
        type: resize.cardType,
        width: resize.lastWidth,
        height: resize.lastHeight
      },
      startedAtClient: resize.startedAtClient,
      endedAtClient,
      durationMs
    };

    await update(ref(db, `boards/${boardId}`), {
      [`history/${historyRef.key}`]: {
        type: "card_resized",
        cardId: resize.cardId,
        userId: currentUserId,
        userName: currentUser.name,
        payload,
        timestamp
      },
      [`activityEvents/${activityRef.key}`]: {
        type: "card_resized",
        cardId: resize.cardId,
        userId: currentUserId,
        userName: currentUser.name,
        payload,
        timestamp
      }
    });
  };

  /**
 * ポインター位置を、canvas左上を原点とした
 * CSSピクセル座標で取得する。
 */
  const getCanvasPosition = (pointerEvent, canvas) => {
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

    const scaleX = layoutWidth / rect.width;
    const scaleY = layoutHeight / rect.height;

    return {
      x: Number(
        clamp(
          (pointerEvent.clientX - rect.left) * scaleX,
          0,
          layoutWidth
        ).toFixed(2)
      ),
      y: Number(
        clamp(
          (pointerEvent.clientY - rect.top) * scaleY,
          0,
          layoutHeight
        ).toFixed(2)
      )
    };
  };

  const drawLocalLine = (
    canvas,
    fromPoint,
    toPoint
  ) => {
    drawSegmentOnCanvas(canvas, {
      coordinateMode: "pixel",
      widthPx: DRAWING_WIDTH_PX,
      color: DRAWING_COLOR,
      points: [
        fromPoint,
        toPoint
      ]
    });
  };

  const flushDrawingSegment = () => {
    const drawing = drawingRef.current;

    if (
      !drawing.isDrawing ||
      !drawing.cardId ||
      !Array.isArray(drawing.pendingPoints) ||
      drawing.pendingPoints.length === 0
    ) {
      return;
    }

    /*
     * 前回送信後に追加された座標を取り出す。
     */
    const newPoints =
      drawing.pendingPoints.splice(0);

    /*
     * 前の線分の終点を今回の先頭に追加し、
     * 線分間に隙間ができないようにする。
     */
    const points = drawing.lastSentPoint
      ? [
        drawing.lastSentPoint,
        ...newPoints
      ]
      : newPoints;

    /*
     * 点だけの場合も描画できるように、
     * 同じ点を2つ登録する。
     */
    if (points.length === 1) {
      points.push({
        ...points[0]
      });
    }

    const lastPoint =
      points[points.length - 1];

    drawing.lastSentPoint = {
      ...lastPoint
    };

    drawing.lastFlushAt = performance.now();

    const segmentRef = push(
      ref(
        db,
        `boards/${boardId}/drawings/${drawing.cardId}/segments`
      )
    );

    if (!segmentRef.key) {
      console.error(
        "手書きデータ用のIDを作成できませんでした"
      );

      return;
    }

    const historyRef = push(
      ref(db, `boards/${boardId}/history`)
    );

    const timestamp = serverTimestamp();

    /*
     * ピクセル座標形式としてFirebaseへ保存する。
     */
    const segmentData = {
      strokeId: drawing.strokeId,
      sequence: drawing.sequence,

      coordinateMode: "pixel",

      /*
       * 書き始めたときの描画エリアサイズ。
       * 現在の描画では直接使用しないが、
       * 将来の変換やデータ確認に使用できる。
       */
      baseWidth: drawing.baseWidth,
      baseHeight: drawing.baseHeight,

      points,

      color: DRAWING_COLOR,
      widthPx: DRAWING_WIDTH_PX,

      owner: currentUserId,
      ownerName: currentUser?.name || ""
    };

    const updates = {
      /*
       * 通常表示用の手書きデータ。
       */
      [`drawings/${drawing.cardId}/segments/${segmentRef.key}`]:
      {
        ...segmentData,
        createdAt: timestamp
      },

      /*
       * 付箋の最終更新日時。
       */
      [`cards/${drawing.cardId}/updatedAt`]:
        timestamp,

      /*
       * タイムラプス用の操作履歴。
       */
      [`history/${historyRef.key}`]: {
        type: "drawing_segment",
        cardId: drawing.cardId,
        userId: currentUserId,
        userName: currentUser?.name || "",
        payload: {
          segmentId: segmentRef.key,
          segment: segmentData
        },
        timestamp
      }
    };

    update(
      ref(db, `boards/${boardId}`),
      updates
    ).catch((error) => {
      console.error(
        "手書きデータを保存できませんでした",
        error
      );
    });

    drawing.sequence += 1;
  };

  const startDrawOnCard = (e, cardId, canEdit) => {
    if (!canEdit || connectMode || resizingCard) return;
    if (!boardId || !currentUserId || !currentUser) return;

    e.preventDefault();
    e.stopPropagation();

    const canvas = e.currentTarget;
    resizeCanvasToDisplaySize(canvas);

    const point = getCanvasPosition(e, canvas);
    const strokeId = push(
      ref(db, `boards/${boardId}/drawings/${cardId}/segments`)
    ).key;

    if (!strokeId) {
      console.error("手書きストローク用のIDを作成できませんでした");
      return;
    }

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (error) {
      console.warn("ポインターを固定できませんでした", error);
    }

    drawingRef.current = {
      isDrawing: true,
      pointerId: e.pointerId,
      cardId,
      strokeId,
      sequence: 0,
      baseWidth: canvas.clientWidth,
      baseHeight: canvas.clientHeight,
      pendingPoints: [point],
      lastLocalPoint: point,
      lastSentPoint: null,
      lastFlushAt: 0
    };

    drawLocalLine(canvas, point, point);
    flushDrawingSegment();
  };

  const drawOnCard = (
    e,
    cardId,
    canEdit
  ) => {
    const drawing = drawingRef.current;

    if (!canEdit || !drawing.isDrawing) {
      return;
    }

    if (
      drawing.cardId !== cardId ||
      drawing.pointerId !== e.pointerId
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const canvas = e.currentTarget;

    /*
     * ブラウザーがまとめた細かいPointerEventを取得する。
     * 対応していない場合は通常のイベントだけを使う。
     */
    const events = e.getCoalescedEvents
      ? e.getCoalescedEvents()
      : [e];

    events.forEach((pointerEvent) => {
      const point = getCanvasPosition(
        pointerEvent,
        canvas
      );

      const previousPoint =
        drawingRef.current.lastLocalPoint;

      if (previousPoint) {
        drawLocalLine(
          canvas,
          previousPoint,
          point
        );
      }

      drawingRef.current.pendingPoints.push(
        point
      );

      drawingRef.current.lastLocalPoint =
        point;
    });

    /*
     * 約40ミリ秒ごとにFirebaseへ送信する。
     */
    if (
      performance.now() -
      drawingRef.current.lastFlushAt >=
      DRAWING_FLUSH_INTERVAL_MS
    ) {
      flushDrawingSegment();
    }
  };

  const stopDrawOnCard = (
    e,
    cardId
  ) => {
    const drawing = drawingRef.current;

    if (!drawing.isDrawing) return;

    if (
      drawing.cardId !== cardId ||
      drawing.pointerId !== e.pointerId
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    /*
     * 送信されていない最後の座標をFirebaseへ保存する。
     */
    flushDrawingSegment();

    const canvas = e.currentTarget;

    try {
      if (
        canvas.hasPointerCapture?.(
          e.pointerId
        )
      ) {
        canvas.releasePointerCapture(
          e.pointerId
        );
      }
    } catch (error) {
      console.warn(
        "ポインター固定を解除できませんでした",
        error
      );
    }

    drawingRef.current = {
      isDrawing: false
    };
  };

  const clearCardDrawing = async (e, cardId, canEdit) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;

    if (drawingRef.current.isDrawing && drawingRef.current.cardId === cardId) {
      drawingRef.current = { isDrawing: false };
    }

    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();
    await update(ref(db, `boards/${boardId}`), {
      [`drawings/${cardId}/segments`]: null,
      [`cards/${cardId}/updatedAt`]: timestamp,
      [`history/${historyRef.key}`]: {
        type: "drawing_cleared",
        cardId,
        userId: currentUserId,
        userName: currentUser.name,
        payload: {},
        timestamp
      }
    });
  };

  const eraseCardStroke = async ({ cardId, strokeId, segmentIds }) => {
    if (!boardId || !cardId || !strokeId || segmentIds.length === 0) return;

    const updates = {};
    segmentIds.forEach((segmentId) => {
      updates[`drawings/${cardId}/segments/${segmentId}`] = null;
    });

    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();
    updates[`cards/${cardId}/updatedAt`] = timestamp;
    updates[`history/${historyRef.key}`] = {
      type: "drawing_stroke_erased",
      cardId,
      userId: currentUserId,
      userName: currentUser?.name || "",
      payload: { strokeId, segmentIds },
      timestamp
    };

    await update(ref(db, `boards/${boardId}`), updates);
  };

  const changeCardLayer = async (cardId, direction) => {
    const card = cards[cardId];
    if (!card) return;

    const orderedIds = Object.entries(cards)
      .sort(([, a], [, b]) => (Number(a?.zIndex) || 0) - (Number(b?.zIndex) || 0))
      .map(([id]) => id)
      .filter((id) => id !== cardId);

    const reorderedIds = direction === "front"
      ? [...orderedIds, cardId]
      : [cardId, ...orderedIds];

    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();
    const updates = {};
    reorderedIds.forEach((id, index) => {
      updates[`cards/${id}/zIndex`] = index + 1;
    });
    const zIndex = direction === "front" ? reorderedIds.length : 1;
    updates[`cards/${cardId}/updatedAt`] = timestamp;
    updates[`history/${historyRef.key}`] = {
      type: "card_layer_changed",
      cardId,
      userId: currentUserId,
      userName: currentUser?.name || "",
      payload: { zIndex, direction },
      timestamp
    };

    await update(ref(db, `boards/${boardId}`), updates);
    setCardMenuId(null);
  };

  const clearBoardDrawing = async () => {
    if (!boardId) return;
    if (!window.confirm("ボード全体の書き込みを消去しますか？")) return;

    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();
    await update(ref(db, `boards/${boardId}`), {
      boardDrawing: null,
      [`history/${historyRef.key}`]: {
        type: "board_drawing_cleared",
        userId: currentUserId,
        userName: currentUser?.name || "",
        payload: {},
        timestamp
      }
    });
  };

  const focusCardFromList = (cardId, card) => {
    if (!boardRef.current || !card) return;

    const targetLeft = Math.max(
      0,
      (Number(card.x) || 0) * zoomRef.current - boardRef.current.clientWidth / 2 + ((Number(card.width) || 260) * zoomRef.current) / 2
    );
    const targetTop = Math.max(
      0,
      (Number(card.y) || 0) * zoomRef.current - boardRef.current.clientHeight / 2 + ((Number(card.height) || 360) * zoomRef.current) / 2
    );

    boardRef.current.scrollTo({ left: targetLeft, top: targetTop, behavior: "smooth" });
    setFocusedCardId(cardId);
    onCloseSidePanel?.();

    if (focusedCardTimerRef.current) window.clearTimeout(focusedCardTimerRef.current);
    focusedCardTimerRef.current = window.setTimeout(() => setFocusedCardId(null), 2200);
  };

  const connectCards = async (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;

    const connectionRef = push(ref(db, `boards/${boardId}/connections`));
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const connection = {
      from: fromId,
      to: toId,
      color: "#333333",
      owner: currentUserId,
      ownerName: currentUser.name
    };
    const timestamp = serverTimestamp();

    await update(ref(db, `boards/${boardId}`), {
      [`connections/${connectionRef.key}`]: { ...connection, createdAt: timestamp },
      [`history/${historyRef.key}`]: {
        type: "connection_created",
        connectionId: connectionRef.key,
        userId: currentUserId,
        userName: currentUser.name,
        payload: { connection },
        timestamp
      }
    });
  };

  const handleConnectCard = (cardId) => {
    if (!connectMode) return;
    if (!connectFrom) {
      setConnectFrom(cardId);
      return;
    }
    connectCards(connectFrom, cardId);
    setConnectFrom(null);
  };

  const deleteConnection = async (connectionId) => {
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();
    await update(ref(db, `boards/${boardId}`), {
      [`connections/${connectionId}`]: null,
      [`history/${historyRef.key}`]: {
        type: "connection_deleted",
        connectionId,
        userId: currentUserId,
        userName: currentUser.name,
        payload: {},
        timestamp
      }
    });
  };


  const cancelGesturesForPinch = useCallback(() => {
    setMovingCard(null);
    setMovingMedia(null);
    setResizingCard(null);
    setResizingMedia(null);
    moveHistoryRef.current = null;
    mediaMoveRef.current = null;
    mediaResizeRef.current = null;
    resizeHistoryRef.current = null;
    setCardMenuId(null);
  }, []);

  const resetEditor = useCallback(() => {
    cancelGesturesForPinch();
    setConnectMode(false);
    setConnectFrom(null);
    setBoardTool("move");
    setCardDrawingTool("pen");
    setFocusedCardId(null);
    if (focusedCardTimerRef.current) {
      window.clearTimeout(focusedCardTimerRef.current);
      focusedCardTimerRef.current = null;
    }
    drawingRef.current = { isDrawing: false };
  }, [cancelGesturesForPinch]);

  return {
    boardTool,
    setBoardTool,
    cardDrawingTool,
    setCardDrawingTool,
    cardMenuId,
    setCardMenuId,
    focusedCardId,
    setFocusedCardId,
    addCard,
    handleUpload,
    changeCardType,
    deleteCard,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleMediaPointerDown,
    handleMediaPointerMove,
    handleMediaPointerUp,
    toggleMediaReflectionPoint,
    handleVideoPlayed,
    handleDeleteMedia,
    startResizeMedia,
    moveResizeMedia,
    endResizeMedia,
    startResizeCard,
    moveResizeCard,
    endResizeCard,
    startDrawOnCard,
    drawOnCard,
    stopDrawOnCard,
    clearCardDrawing,
    eraseCardStroke,
    changeCardLayer,
    clearBoardDrawing,
    focusCardFromList,
    connectCards,
    handleConnectCard,
    deleteConnection,
    cancelGesturesForPinch,
    resetEditor
  };
}
