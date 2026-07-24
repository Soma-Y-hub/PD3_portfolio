import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import {
  ref,
  onValue,
  get,
  push,
  update,
  set,
  remove,
  onDisconnect,
  serverTimestamp
} from "firebase/database";

import RealtimeDrawingCanvas from "./components/RealtimeDrawingCanvas";
import PlaybackDrawingCanvas from "./components/PlaybackDrawingCanvas";
import LoginPage from "./components/LoginPage";
import AdminPage from "./components/AdminPage";
import BoardSelectionPage from "./components/BoardSelectionPage";
import BoardHeader from "./components/BoardHeader";
import { db } from "./firebase/firebase";
import {
  DRAWING_COLOR,
  DRAWING_WIDTH_PX,
  DRAWING_FLUSH_INTERVAL_MS,
  REFLECTION_PROMPT,
  CARD_TYPE_LABELS
} from "./constants/appConstants";
import { clamp } from "./utils/commonUtils";
import {
  getTimestampValue,
  formatTimestamp,
  formatTimeOnly,
  formatDuration
} from "./utils/timeUtils";
import {
  getCardTypeLabel,
  getShortCardId,
  getCardDisplayName,
  createCardLabelMap,
  getActivityChangeDetail,
  getActivityTechnicalDetail,
  getActivityDescription,
  getKeypointMeta
} from "./utils/activityUtils";
import { createPlaybackState } from "./utils/playbackUtils";
import { drawSegmentOnCanvas, resizeCanvasToDisplaySize } from "./utils/drawingUtils";
import { uploadMedia, deleteMediaFile } from "./services/mediaService";
import AdminFeedbackFeature from "./components/feedback/AdminFeedbackFeature";
import ReflectionWritingPanel from "./components/reflection/ReflectionWritingPanel";
import ActivityKeypointList from "./components/reflection/ActivityKeypointList";

export default function App() {
  const boardRef = useRef(null);
  const drawingRef = useRef({ isDrawing: false });
  const moveHistoryRef = useRef(null);
  const mediaMoveRef = useRef(null);
  const mediaResizeRef = useRef(null);
  const resizeHistoryRef = useRef(null);
  const animationFrameRef = useRef(null);
  const previousFrameTimeRef = useRef(null);
  const reflectionAnimationFrameRef = useRef(null);
  const reflectionPreviousFrameTimeRef = useRef(null);
  const reflectionStartedAtRef = useRef(null);
  const reflectionAccumulatedDurationRef = useRef(0);

  const [zoom, setZoom] = useState(1);
  const [loginName, setLoginName] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [users, setUsers] = useState({});
  const [boardInput, setBoardInput] = useState("");
  const [boardId, setBoardId] = useState("");

  const [cards, setCards] = useState({});
  const [mediaItems, setMediaItems] = useState({});
  const [members, setMembers] = useState({});
  const [connections, setConnections] = useState({});
  const [allBoards, setAllBoards] = useState({});

  const [screen, setScreen] = useState("board");
  const [movingCard, setMovingCard] = useState(null);
  const [movingMedia, setMovingMedia] = useState(null);
  const [resizingMedia, setResizingMedia] = useState(null);
  const [resizingCard, setResizingCard] = useState(null);

  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState(null);

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState("members");

  const [timelapseOpen, setTimelapseOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(300);
  const [isPlaying, setIsPlaying] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 活動全体を振り返るための時系列の目印と自由記述
  const [activityEvents, setActivityEvents] = useState([]);
  // 振り返り開始時点の履歴を固定して提示する。
  // 振り返り中に他の参加者が操作しても、提示条件が変化しないようにする。
  const [reflectionActivityEvents, setReflectionActivityEvents] = useState([]);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionText, setReflectionText] = useState("");
  const [reflectionRecord, setReflectionRecord] = useState(null);
  const [reflectionSubmitting, setReflectionSubmitting] = useState(false);
  const [reflectionPlaybackPosition, setReflectionPlaybackPosition] = useState(0);
  const [reflectionPlaybackSpeed, setReflectionPlaybackSpeed] = useState(300);
  const [reflectionIsPlaying, setReflectionIsPlaying] = useState(false);
  const [selectedReflectionKeypointId, setSelectedReflectionKeypointId] = useState(null);

  useEffect(() => {
    return onValue(ref(db, "users"), (snapshot) => {
      setUsers(snapshot.val() || {});
    });
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;

    return onValue(ref(db, "boards"), (snapshot) => {
      setAllBoards(snapshot.val() || {});
    });
  }, [currentUser]);

  useEffect(() => {
    if (!boardId) return;

    const unsubCards = onValue(ref(db, `boards/${boardId}/cards`), (snapshot) => {
      setCards(snapshot.val() || {});
    });

    const unsubMembers = onValue(ref(db, `boards/${boardId}/members`), (snapshot) => {
      setMembers(snapshot.val() || {});
    });

    const unsubConnections = onValue(ref(db, `boards/${boardId}/connections`), (snapshot) => {
      setConnections(snapshot.val() || {});
    });

    const unsubMedia = onValue(ref(db, `boards/${boardId}/media`), (snapshot) => {
      setMediaItems(snapshot.val() || {});
    });

    const unsubActivities = onValue(ref(db, `boards/${boardId}/activityEvents`), (snapshot) => {
      const events = [];
      snapshot.forEach((child) => {
        const value = child.val();
        if (value && typeof value.timestamp === "number") {
          events.push({ id: child.key, ...value });
        }
      });
      events.sort((a, b) => {
        const diff = (a.timestamp || 0) - (b.timestamp || 0);
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });
      setActivityEvents(events);
    });

    const reflectionPath = currentUserId
      ? `boards/${boardId}/reflections/${currentUserId}`
      : null;

    const unsubReflection = reflectionPath
      ? onValue(ref(db, reflectionPath), (snapshot) => {
        const value = snapshot.val();
        setReflectionRecord(value || null);
        if (value?.responseText && !reflectionOpen) {
          setReflectionText(value.responseText);
        }
      })
      : () => { };

    return () => {
      unsubCards();
      unsubMembers();
      unsubConnections();
      unsubMedia();
      unsubActivities();
      unsubReflection();
    };
  }, [boardId, currentUserId, reflectionOpen]);

  const playbackDuration = useMemo(() => {
    if (historyEvents.length < 2) return 0;
    return (historyEvents[historyEvents.length - 1].timestamp || 0) -
      (historyEvents[0].timestamp || 0);
  }, [historyEvents]);

  const playbackState = useMemo(() => {
    return createPlaybackState(historyEvents, playbackPosition);
  }, [historyEvents, playbackPosition]);

  const playbackTimestamp = historyEvents.length > 0
    ? (historyEvents[0].timestamp || 0) + playbackPosition
    : null;

  // タイムラプス上へ表示する活動の流れの目印。
  // historyとactivityEventsは同じ操作時刻を持つため、
  // historyの開始時刻を基準にスライダー上の位置を求める。
  const timelapseKeypoints = useMemo(() => {
    if (historyEvents.length === 0) return [];

    const startTime = historyEvents[0].timestamp || 0;
    const endTime = historyEvents[historyEvents.length - 1].timestamp || startTime;
    const duration = Math.max(0, endTime - startTime);

    return activityEvents
      .filter((event) => typeof event.timestamp === "number")
      .map((event) => ({
        ...event,
        positionMs: clamp(event.timestamp - startTime, 0, duration),
        percentage: duration > 0
          ? clamp(((event.timestamp - startTime) / duration) * 100, 0, 100)
          : 0
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [historyEvents, activityEvents]);

  // 現在の再生位置に最も近い直前の目印。
  const activeTimelapseKeypoint = useMemo(() => {
    if (!playbackTimestamp || timelapseKeypoints.length === 0) return null;

    let active = null;
    for (const keypoint of timelapseKeypoints) {
      if (keypoint.timestamp <= playbackTimestamp) {
        active = keypoint;
      } else {
        break;
      }
    }
    return active;
  }, [playbackTimestamp, timelapseKeypoints]);

  const reflectionPlaybackDuration = useMemo(() => {
    if (historyEvents.length < 2) return 0;
    return (historyEvents[historyEvents.length - 1].timestamp || 0) -
      (historyEvents[0].timestamp || 0);
  }, [historyEvents]);

  const reflectionPlaybackState = useMemo(() => {
    return createPlaybackState(historyEvents, reflectionPlaybackPosition);
  }, [historyEvents, reflectionPlaybackPosition]);

  const reflectionPlaybackTimestamp = historyEvents.length > 0
    ? (historyEvents[0].timestamp || 0) + reflectionPlaybackPosition
    : null;

  const reflectionKeypoints = useMemo(() => {
    if (historyEvents.length === 0) return [];

    const startTime = historyEvents[0].timestamp || 0;
    const endTime = historyEvents[historyEvents.length - 1].timestamp || startTime;
    const duration = Math.max(0, endTime - startTime);

    return reflectionActivityEvents
      .filter((event) => typeof event.timestamp === "number")
      .map((event) => ({
        ...event,
        positionMs: clamp(event.timestamp - startTime, 0, duration),
        percentage: duration > 0
          ? clamp(((event.timestamp - startTime) / duration) * 100, 0, 100)
          : 0
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [historyEvents, reflectionActivityEvents]);

  const activityCardLabelMap = useMemo(() => {
    return createCardLabelMap(activityEvents);
  }, [activityEvents]);

  const reflectionCardLabelMap = useMemo(() => {
    return createCardLabelMap(reflectionActivityEvents);
  }, [reflectionActivityEvents]);

  const activeReflectionKeypoint = useMemo(() => {
    if (!reflectionPlaybackTimestamp || reflectionKeypoints.length === 0) return null;

    let active = null;
    for (const keypoint of reflectionKeypoints) {
      if (keypoint.timestamp <= reflectionPlaybackTimestamp) {
        active = keypoint;
      } else {
        break;
      }
    }
    return active;
  }, [reflectionPlaybackTimestamp, reflectionKeypoints]);

  const selectedReflectionKeypoint = useMemo(() => {
    if (!selectedReflectionKeypointId) return null;
    return reflectionKeypoints.find((event) => event.id === selectedReflectionKeypointId) || null;
  }, [selectedReflectionKeypointId, reflectionKeypoints]);

  const displayedReflectionKeypoint = selectedReflectionKeypoint || activeReflectionKeypoint;

  useEffect(() => {
    if (!reflectionIsPlaying || historyEvents.length === 0 || reflectionPlaybackDuration <= 0) {
      return undefined;
    }

    const animate = (frameTime) => {
      if (reflectionPreviousFrameTimeRef.current === null) {
        reflectionPreviousFrameTimeRef.current = frameTime;
      }

      const delta = frameTime - reflectionPreviousFrameTimeRef.current;
      reflectionPreviousFrameTimeRef.current = frameTime;

      setReflectionPlaybackPosition((previous) => {
        const next = previous + delta * reflectionPlaybackSpeed;
        if (next >= reflectionPlaybackDuration) {
          setReflectionIsPlaying(false);
          return reflectionPlaybackDuration;
        }
        return next;
      });

      reflectionAnimationFrameRef.current = requestAnimationFrame(animate);
    };

    reflectionAnimationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (reflectionAnimationFrameRef.current !== null) {
        cancelAnimationFrame(reflectionAnimationFrameRef.current);
      }
      reflectionAnimationFrameRef.current = null;
      reflectionPreviousFrameTimeRef.current = null;
    };
  }, [reflectionIsPlaying, reflectionPlaybackSpeed, reflectionPlaybackDuration, historyEvents]);

  useEffect(() => {
    if (!isPlaying || historyEvents.length === 0 || playbackDuration <= 0) {
      return undefined;
    }

    const animate = (frameTime) => {
      if (previousFrameTimeRef.current === null) {
        previousFrameTimeRef.current = frameTime;
      }

      const delta = frameTime - previousFrameTimeRef.current;
      previousFrameTimeRef.current = frameTime;

      setPlaybackPosition((previous) => {
        const next = previous + delta * playbackSpeed;
        if (next >= playbackDuration) {
          setIsPlaying(false);
          return playbackDuration;
        }
        return next;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      previousFrameTimeRef.current = null;
    };
  }, [isPlaying, playbackSpeed, playbackDuration, historyEvents]);

  const addHistoryEvent = async ({
    type,
    cardId = null,
    connectionId = null,
    payload = {},
    includeInActivity = false
  }) => {
    if (!boardId || !currentUserId || !currentUser) return;

    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();
    const eventData = {
      type,
      cardId,
      connectionId,
      userId: currentUserId,
      userName: currentUser.name,
      payload,
      timestamp
    };

    if (!includeInActivity) {
      await set(historyRef, eventData);
      return;
    }

    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    await update(ref(db, `boards/${boardId}`), {
      [`history/${historyRef.key}`]: eventData,
      [`activityEvents/${activityRef.key}`]: eventData
    });
  };

  const openTimelapse = async () => {
    setHistoryLoading(true);
    setIsPlaying(false);
    setPlaybackPosition(0);

    try {
      const snapshot = await get(ref(db, `boards/${boardId}/history`));
      const events = [];
      snapshot.forEach((child) => {
        const value = child.val();
        if (value && typeof value.timestamp === "number") {
          events.push({ id: child.key, ...value });
        }
      });
      events.sort((a, b) => {
        const diff = (a.timestamp || 0) - (b.timestamp || 0);
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });
      setHistoryEvents(events);
      setTimelapseOpen(true);
    } catch (error) {
      console.error("タイムラプス履歴を取得できませんでした", error);
      alert("タイムラプス履歴を取得できませんでした");
    } finally {
      setHistoryLoading(false);
    }
  };

  const resetBoardStates = () => {
    setBoardId("");
    setBoardInput("");
    setCards({});
    setMediaItems({});
    setMembers({});
    setConnections({});
    setActivityEvents([]);
    setReflectionActivityEvents([]);
    setReflectionOpen(false);
    setReflectionText("");
    setReflectionRecord(null);
    setReflectionPlaybackPosition(0);
    setReflectionIsPlaying(false);
    reflectionStartedAtRef.current = null;
    reflectionAccumulatedDurationRef.current = 0;
    setMovingCard(null);
    setMovingMedia(null);
    setResizingMedia(null);
    setResizingCard(null);
    setConnectMode(false);
    setConnectFrom(null);
    setSidePanelOpen(false);
    setSidePanelMode("members");
    setZoom(1);
    drawingRef.current = { isDrawing: false };
  };

  const zoomIn = () => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(1))));
  const zoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))));
  const resetZoom = () => setZoom(1);

  const login = () => {
    const name = loginName.trim();
    if (!name) return;

    const found = Object.entries(users).find(([, user]) => user.name === name);

    if (!found) {
      alert("登録されていないユーザーです");
      return;
    }

    setCurrentUserId(found[0]);
    setCurrentUser(found[1]);
  };

  const logout = () => {
    if (boardId && currentUserId) {
      remove(ref(db, `boards/${boardId}/members/${currentUserId}`));
    }

    resetBoardStates();
    setCurrentUserId(null);
    setCurrentUser(null);
    setLoginName("");
    setScreen("board");
  };

  const enterBoard = async (value) => {
    if (!value || !currentUserId || !currentUser) return;

    const memberRef = ref(db, `boards/${value}/members/${currentUserId}`);

    onDisconnect(memberRef).update({
      status: "offline",
      lastActive: serverTimestamp()
    });

    await update(ref(db, `boards/${value}`), {
      [`members/${currentUserId}`]: {
        name: currentUser.name,
        role: currentUser.role,
        color: currentUser.color || "#fff176",
        status: "online",
        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp()
      }
    });

    setBoardId(value);
  };

  const joinBoard = async () => {
    const value = boardInput.trim();
    if (!value) return;
    await enterBoard(value);
  };

  const leaveBoard = () => {
    if (boardId && currentUserId) {
      remove(ref(db, `boards/${boardId}/members/${currentUserId}`));
    }
    resetBoardStates();
  };

  const addCard = async () => {
    if (!boardId || !currentUserId || !currentUser) return;

    const cardRef = push(ref(db, `boards/${boardId}/cards`));
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    const timestamp = serverTimestamp();
    const cardData = {
      text: "新しい考え",
      x: 120,
      y: 120,
      width: 260,
      height: 360,
      owner: currentUserId,
      ownerName: currentUser.name,
      color: currentUser.color || "#fff176",
      type: "idea"
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
    if (connectMode || resizingCard || drawingRef.current.isDrawing) return;
    e.preventDefault();
    if (!boardRef.current) return;

    const rect = boardRef.current.getBoundingClientRect();
    setMovingCard({
      id,
      offsetX: (e.clientX - rect.left) / zoom - card.x,
      offsetY: (e.clientY - rect.top) / zoom - card.y
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
    if (!movingCard || !boardRef.current) return;

    const card = cards[movingCard.id];
    if (!card) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom - movingCard.offsetX;
    const y = (e.clientY - rect.top) / zoom - movingCard.offsetY;

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
    if (connectMode || movingCard || resizingCard || drawingRef.current.isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    if (!boardRef.current) return;

    const rect = boardRef.current.getBoundingClientRect();
    const startX = Number(media.x) || 150;
    const startY = Number(media.y) || 150;

    setMovingMedia({
      id: mediaId,
      offsetX: (e.clientX - rect.left) / zoom - startX,
      offsetY: (e.clientY - rect.top) / zoom - startY
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
    if (!movingMedia || !boardRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const media = mediaItems[movingMedia.id];
    if (!media) return;

    const rect = boardRef.current.getBoundingClientRect();
    const width = Number(media.width) || 500;
    const height = Number(media.height) || 300;
    const canvasWidth = 2200;
    const canvasHeight = 1400;

    const rawX = (e.clientX - rect.left) / zoom - movingMedia.offsetX;
    const rawY = (e.clientY - rect.top) / zoom - movingMedia.offsetY;
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
    const width = Math.max(180, resizingMedia.startWidth + (e.clientX - resizingMedia.startX) / zoom);
    const height = Math.max(120, resizingMedia.startHeight + (e.clientY - resizingMedia.startY) / zoom);
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
      `${fileLabel}を削除しますか？\nこの操作は元に戻せません。`
    );

    if (!confirmed) return;

    try {
      // 先にSupabase Storage上の実ファイルを削除する
      if (media.storagePath) {
        await deleteMediaFile(media.storagePath);
      }

      // 次にFirebase上のメディア情報を削除する
      await remove(ref(db, `boards/${boardId}/media/${mediaId}`));

      await addHistoryEvent({
        type: "media_deleted",
        includeInActivity: true,
        payload: {
          mediaId,
          fileName: media.fileName || "",
          mediaType: media.type || "",
          storagePath: media.storagePath || "",
          media: { id: mediaId, ...media }
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
    if (connectMode || drawingRef.current.isDrawing) return;
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
    const width = Math.max(220, resizingCard.startWidth + (e.clientX - resizingCard.startX) / zoom);
    const height = Math.max(280, resizingCard.startHeight + (e.clientY - resizingCard.startY) / zoom);

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

  const openReflection = async () => {
    if (!boardId || !currentUserId || !currentUser) return;

    reflectionStartedAtRef.current = Date.now();
    setReflectionText((currentText) =>
      currentText || reflectionRecord?.responseText || ""
    );
    setReflectionIsPlaying(false);
    setSelectedReflectionKeypointId(null);
    setReflectionPlaybackPosition(0);

    // 振り返り開始時点までの活動の目印を固定して提示する。
    setReflectionActivityEvents([...activityEvents]);

    try {
      const historySnapshot = await get(ref(db, `boards/${boardId}/history`));
      const events = [];
      historySnapshot.forEach((child) => {
        const value = child.val();
        if (value && typeof value.timestamp === "number") {
          events.push({ id: child.key, ...value });
        }
      });
      events.sort((a, b) => {
        const diff = (a.timestamp || 0) - (b.timestamp || 0);
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });
      setHistoryEvents(events);
    } catch (error) {
      console.error("振り返り用タイムラプス履歴を取得できませんでした", error);
    }

    setReflectionOpen(true);

    const usageRef = ref(
      db,
      `boards/${boardId}/researchUsage/${currentUserId}`
    );
    const usageSnapshot = await get(usageRef);
    const usage = usageSnapshot.val() || {};

    await update(usageRef, {
      userId: currentUserId,
      userName: currentUser.name,
      reflectionOpenCount: (Number(usage.reflectionOpenCount) || 0) + 1,
      lastOpenedAt: serverTimestamp()
    });
  };

  const closeReflection = () => {
    setReflectionIsPlaying(false);
    if (reflectionStartedAtRef.current !== null) {
      reflectionAccumulatedDurationRef.current += Math.max(
        0,
        Date.now() - reflectionStartedAtRef.current
      );
    }

    reflectionStartedAtRef.current = null;
    setReflectionOpen(false);
  };

  const submitReflection = async () => {
    const responseText = reflectionText.trim();

    if (!responseText) {
      alert("振り返りを入力してください");
      return;
    }

    if (!boardId || !currentUserId || !currentUser) return;

    setReflectionSubmitting(true);
    setReflectionIsPlaying(false);

    try {
      const submittedAtClient = Date.now();
      const currentSessionDuration =
        reflectionStartedAtRef.current === null
          ? 0
          : Math.max(
            0,
            submittedAtClient - reflectionStartedAtRef.current
          );
      const durationMs =
        reflectionAccumulatedDurationRef.current + currentSessionDuration;
      const startedAtClient = submittedAtClient - durationMs;

      // update()を使うことで、既存のteacherFeedbackを消さずに
      // 生徒の振り返り部分だけを更新する。
      await update(
        ref(db, `boards/${boardId}/reflections/${currentUserId}`),
        {
          userId: currentUserId,
          userName: currentUser.name,
          promptVersion: "free_description_v1",
          promptText: REFLECTION_PROMPT,
          responseText,
          startedAtClient,
          submittedAtClient,
          durationMs,
          submittedAt: serverTimestamp(),
          responseLength: responseText.length,
          activityEventCountShown: reflectionActivityEvents.length,
          activityEventIdsShown: reflectionActivityEvents.map((event) => event.id),
          boardStateAtSubmit: {
            cardCount: Object.keys(cards).length,
            connectionCount: Object.keys(connections).length
          }
        }
      );

      setReflectionOpen(false);
      setReflectionActivityEvents([]);
      setReflectionPlaybackPosition(0);
      setReflectionIsPlaying(false);
      reflectionStartedAtRef.current = null;
      reflectionAccumulatedDurationRef.current = 0;
      alert("振り返りを保存しました");
    } catch (error) {
      console.error("振り返りを保存できませんでした", error);
      alert("振り返りを保存できませんでした");
    } finally {
      setReflectionSubmitting(false);
    }
  };


  const deleteCurrentReflection = async () => {
    if (!boardId || !currentUserId || !reflectionRecord) return;

    const confirmed = window.confirm(
      "保存済みの振り返りを削除しますか？\n先生からのコメントも同時に削除されます。\nこの操作は元に戻せません。"
    );

    if (!confirmed) return;

    setReflectionSubmitting(true);
    setReflectionIsPlaying(false);

    try {
      await remove(
        ref(db, `boards/${boardId}/reflections/${currentUserId}`)
      );

      setReflectionText("");
      setReflectionRecord(null);
      setReflectionActivityEvents([]);
      setReflectionPlaybackPosition(0);
      setSelectedReflectionKeypointId(null);
      reflectionStartedAtRef.current = Date.now();
      reflectionAccumulatedDurationRef.current = 0;

      alert("振り返りを削除しました");
    } catch (error) {
      console.error("振り返りを削除できませんでした", error);
      alert("振り返りを削除できませんでした");
    } finally {
      setReflectionSubmitting(false);
    }
  };

  const exportReflectionCsv = async () => {
    if (currentUser?.role !== "admin" || !boardId) return;

    const snapshot = await get(ref(db, `boards/${boardId}/reflections`));
    const rows = [
      [
        "boardId",
        "userId",
        "userName",
        "responseText",
        "responseLength",
        "durationMs",
        "submittedAt",
        "activityEventCountShown",
        "finalCardCount",
        "finalConnectionCount"
      ]
    ];

    snapshot.forEach((child) => {
      const value = child.val() || {};
      rows.push([
        boardId,
        value.userId || child.key,
        value.userName || "",
        value.responseText || "",
        value.responseLength || String(value.responseText || "").length,
        value.durationMs || 0,
        value.submittedAt || "",
        value.activityEventCountShown || 0,
        value.boardStateAtSubmit?.cardCount || 0,
        value.boardStateAtSubmit?.connectionCount || 0
      ]);
    });

    const escapeCsv = (value) => {
      const stringValue = String(value ?? "");
      return `"${stringValue.replaceAll('"', '""')}"`;
    };

    const csv = rows
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${boardId}_reflections.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const addUser = () => {
    set(push(ref(db, "users")), {
      name: "新規ユーザー",
      role: "student",
      color: "#fff176",
      createdAt: serverTimestamp()
    });
  };

  const updateUser = (uid, data) => {
    update(ref(db, `users/${uid}`), data);

    if (uid === currentUserId) {
      setCurrentUser({
        ...currentUser,
        ...data
      });
    }
  };

  const deleteUser = (uid) => {
    if (uid === currentUserId) {
      alert("自分自身は削除できません");
      return;
    }

    remove(ref(db, `users/${uid}`));
  };

  const importUsersFromCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (event) => {
      const text = event.target.result;

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length <= 1) {
        alert("CSVにデータがありません");
        return;
      }

      const header = lines[0].split(",").map((h) => h.trim());

      const nameIndex = header.indexOf("name");
      const roleIndex = header.indexOf("role");
      const colorIndex = header.indexOf("color");

      if (nameIndex === -1) {
        alert("CSVに name 列が必要です");
        return;
      }

      let count = 0;

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(",").map((c) => c.trim());

        const name = columns[nameIndex];
        const role = roleIndex !== -1 ? columns[roleIndex] : "student";
        const color = colorIndex !== -1 ? columns[colorIndex] : "#fff176";

        if (!name) continue;

        await set(push(ref(db, "users")), {
          name,
          role: role === "admin" ? "admin" : "student",
          color: color || "#fff176",
          createdAt: serverTimestamp()
        });

        count++;
      }

      alert(`${count}人のメンバーを追加しました`);
      e.target.value = "";
    };

    reader.readAsText(file, "UTF-8");
  };

  if (!currentUser) {
    return (
      <LoginPage
        loginName={loginName}
        onLoginNameChange={setLoginName}
        onLogin={login}
      />
    );
  }

  if (screen === "admin" && currentUser.role === "admin") {
    return (
      <AdminPage
        users={users}
        currentUserId={currentUserId}
        onAddUser={addUser}
        onImportUsers={importUsersFromCsv}
        onUpdateUser={updateUser}
        onDeleteUser={deleteUser}
        onBack={() => setScreen("board")}
      />
    );
  }

  if (!boardId) {
    return (
      <BoardSelectionPage
        currentUser={currentUser}
        boardInput={boardInput}
        allBoards={allBoards}
        onBoardInputChange={setBoardInput}
        onJoinBoard={joinBoard}
        onOpenAdmin={() => setScreen("admin")}
        onEnterBoard={(groupName) => {
          setBoardInput(groupName);
          enterBoard(groupName);
        }}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="app">
      <BoardHeader
        boardId={boardId}
        currentUser={currentUser}
        connectMode={connectMode}
        reflectionRecord={reflectionRecord}
        historyLoading={historyLoading}
        onAddCard={addCard}
        onUploadMedia={handleUpload}
        onToggleConnectMode={() => {
          setConnectMode(!connectMode);
          setConnectFrom(null);
        }}
        onOpenMembers={() => {
          setSidePanelMode("members");
          setSidePanelOpen(true);
        }}
        onOpenCards={() => {
          setSidePanelMode("cards");
          setSidePanelOpen(true);
        }}
        onOpenConnections={() => {
          setSidePanelMode("connections");
          setSidePanelOpen(true);
        }}
        onOpenReflection={openReflection}
        onExportReflectionCsv={exportReflectionCsv}
        onOpenTimelapse={openTimelapse}
        onOpenAdmin={() => setScreen("admin")}
        onLeaveBoard={leaveBoard}
        onLogout={logout}
      />

      <main className="layout">
        <section className="board">
          <div className="board-scroll" ref={boardRef}>
            <div className="zoom-controls">
              <button onClick={zoomOut}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn}>＋</button>
              <button onClick={resetZoom}>100%</button>
            </div>

            <div
              className="board-canvas"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left"
              }}
            >
              <svg className="connection-layer">
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
                  </marker>
                </defs>

                {Object.entries(connections).map(([id, connection]) => {
                  const fromCard = cards[connection.from];
                  const toCard = cards[connection.to];

                  if (!fromCard || !toCard) return null;

                  const x1 = fromCard.x + (fromCard.width || 260) / 2;
                  const y1 = fromCard.y + (fromCard.height || 360) / 2;
                  const x2 = toCard.x + (toCard.width || 260) / 2;
                  const y2 = toCard.y + (toCard.height || 360) / 2;

                  return (
                    <line
                      key={id}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={connection.color || "#333"}
                      strokeWidth="4"
                      markerEnd="url(#arrowhead)"
                    />
                  );
                })}
              </svg>

              {Object.entries(cards).map(([id, card]) => {
                const isOwner = card.owner === currentUserId;
                const isAdmin = currentUser.role === "admin";
                const selectedConnect = connectFrom === id;

                return (
                  <div
                    key={id}
                    className={`card ${isOwner ? "my-card" : "other-card"} ${selectedConnect ? "connect-selected" : ""
                      }`}
                    style={{
                      left: card.x,
                      top: card.y,
                      width: card.width || 260,
                      height: card.height || 360,
                      background: card.color || "#fff176"
                    }}
                    onClick={() => handleConnectCard(id)}
                    onPointerDown={(e) => handlePointerDown(e, id, card)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    {(isOwner || isAdmin) && (
                      <button
                        className="delete-button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCard(id, card);
                        }}
                      >
                        ×
                      </button>
                    )}

                    {!isOwner && <div className="lock-label">他の人</div>}

                    <div className="owner-name">{card.ownerName}</div>


                    <select
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      value={card.type || "idea"}
                      onChange={(e) => changeCardType(id, card, e.target.value)}
                    >
                      <option value="idea">アイデア</option>
                      <option value="problem">課題</option>
                      <option value="reason">理由</option>
                      <option value="solution">解決案</option>
                      <option value="evidence">根拠</option>
                    </select>


                    <div
                      className="drawing-area drawing-area-full"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="drawing-toolbar">
                        <span>手書き</span>
                        <button
                          disabled={!isOwner && !isAdmin}
                          onClick={(e) =>
                            clearCardDrawing(e, id, isOwner || isAdmin)
                          }
                        >
                          消去
                        </button>
                      </div>

                      <RealtimeDrawingCanvas
                        boardId={boardId}
                        cardId={id}
                        canEdit={isOwner || isAdmin}
                        startDrawOnCard={startDrawOnCard}
                        drawOnCard={drawOnCard}
                        stopDrawOnCard={stopDrawOnCard}
                      />
                    </div>

                    {!connectMode && (
                      <div
                        className="resize-handle"
                        onPointerDown={(e) => startResizeCard(e, id, card)}
                        onPointerMove={moveResizeCard}
                        onPointerUp={endResizeCard}
                        onPointerCancel={endResizeCard}
                      />
                    )}
                  </div>
                );
              })}

              {Object.entries(mediaItems).map(([mediaId, media]) => {
                const x = Number(media.x) || 150;
                const y = Number(media.y) || 150;
                const width = Number(media.width) || 500;
                const height = Number(media.height) || 300;

                return (
                  <div
                    key={mediaId}
                    className={`board-media-item ${media.isReflectionPoint ? "is-reflection-point" : ""}`}
                    style={{
                      left: x,
                      top: y,
                      width,
                      height
                    }}
                  >
                    <div
                      className="board-media-drag-handle"
                      title="ドラッグして移動"
                      onPointerDown={(e) =>
                        handleMediaPointerDown(e, mediaId, media)
                      }
                      onPointerMove={handleMediaPointerMove}
                      onPointerUp={handleMediaPointerUp}
                      onPointerCancel={handleMediaPointerUp}
                    >
                      <span>移動</span>
                    </div>


                    <button
                      type="button"
                      className={`media-reflection-button ${media.isReflectionPoint ? "active" : ""}`}
                      title={media.isReflectionPoint ? "振り返りポイントを解除" : "振り返りポイントに指定"}
                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={(e) => toggleMediaReflectionPoint(e, mediaId, media)}
                    >
                      {media.isReflectionPoint ? "★ 振り返り" : "☆ 振り返り"}
                    </button>

                    <button
                      type="button"
                      className="board-media-delete-button"
                      title="メディアを削除"
                      aria-label={`${media.fileName || "メディア"}を削除`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) =>
                        handleDeleteMedia(e, mediaId, media)
                      }
                    >
                      ×
                    </button>

                    {media.type === "image" ? (
                      <img
                        src={media.url}
                        alt={media.fileName || "アップロード画像"}
                        draggable={false}
                      />
                    ) : (
                      <video
                        src={media.url}
                        controls
                        preload="metadata"
                        onPlay={() => handleVideoPlayed(mediaId, media)}
                      >
                        お使いのブラウザでは動画を再生できません。
                      </video>
                    )}

                    <div className="board-media-caption">
                      {media.fileName || "メディア"}
                      {media.isReflectionPoint && media.reflectionReason && (
                        <small>{media.reflectionReason}</small>
                      )}
                    </div>

                    <div
                      className="board-media-resize-handle"
                      title="ドラッグしてサイズ変更"
                      onPointerDown={(e) => startResizeMedia(e, mediaId, media)}
                      onPointerMove={moveResizeMedia}
                      onPointerUp={endResizeMedia}
                      onPointerCancel={endResizeMedia}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {sidePanelOpen && (
          <aside className="side-panel">
            <div className="side-panel-header">
              <h2>
                {sidePanelMode === "members" && "参加中ユーザー"}
                {sidePanelMode === "cards" && "付箋一覧"}
                {sidePanelMode === "connections" && "矢印一覧"}
              </h2>

              <button onClick={() => setSidePanelOpen(false)}>×</button>
            </div>

            {sidePanelMode === "members" &&
              Object.entries(members).map(([uid, member]) => (
                <div className="member-item" key={uid}>
                  <span
                    className="member-color"
                    style={{ background: member.color || "#fff176" }}
                  />
                  <div>
                    <div className="member-name">{member.name}</div>
                    <div className="member-role">
                      {member.role === "admin" ? "管理者" : "学生"}
                    </div>
                  </div>
                </div>
              ))}

            {sidePanelMode === "cards" &&
              Object.entries(cards)
                .sort(([, cardA], [, cardB]) => {
                  return getTimestampValue(cardB.updatedAt) - getTimestampValue(cardA.updatedAt);
                })
                .map(([id, card]) => (
                  <div className="timeline-item" key={id}>
                    <div className="timeline-type">{card.type}</div>
                    <div className="timeline-text">
                      {card.ownerName}の手書き付箋
                    </div>
                  </div>
                ))}

            {sidePanelMode === "connections" &&
              Object.entries(connections)
                .sort(([, connectionA], [, connectionB]) => {
                  return getTimestampValue(connectionB.createdAt) - getTimestampValue(connectionA.createdAt);
                })
                .map(([id, connection]) => (
                  <div className="timeline-item" key={id}>
                    <div className="timeline-text">
                      {cards[connection.from]?.text || "削除済み"} →{" "}
                      {cards[connection.to]?.text || "削除済み"}
                    </div>
                    <button
                      className="small-delete-button"
                      onClick={() => deleteConnection(id)}
                    >
                      矢印削除
                    </button>
                  </div>
                ))}
          </aside>
        )}
      </main>

      {currentUser?.role === "admin" && (
        <AdminFeedbackFeature
          boardId={boardId}
          currentUserId={currentUserId}
          currentUser={currentUser}
        />
      )}

      {reflectionOpen && (
        <div className="reflection-overlay">
          <div className="reflection-dialog with-activity-history three-column-reflection">
            <div className="reflection-header">
              <div>
                <h2>活動の振り返り</h2>
                <p>{REFLECTION_PROMPT}</p>
              </div>
              <button
                aria-label="振り返り画面を閉じる"
                onClick={closeReflection}
              >
                ×
              </button>
            </div>

            <div className="reflection-content">
              <section className="reflection-timelapse-column">
                <div className="reflection-mini-timelapse-panel left-side-timelapse">
                  <div className="reflection-mini-timelapse-header">
                    <div>
                      <strong>ボード全体のタイムラプス</strong>
                      <span>{reflectionPlaybackTimestamp ? formatTimestamp(reflectionPlaybackTimestamp) : "履歴がありません"}</span>
                    </div>
                    <button
                      type="button"
                      disabled={historyEvents.length === 0}
                      onClick={() => {
                        setSelectedReflectionKeypointId(null);
                        if (reflectionPlaybackPosition >= reflectionPlaybackDuration) {
                          setReflectionPlaybackPosition(0);
                        }
                        setReflectionIsPlaying((value) => !value);
                      }}
                    >
                      {reflectionIsPlaying ? "停止" : "再生"}
                    </button>
                  </div>

                  <div className="reflection-mini-timelapse-controls">
                    <button
                      type="button"
                      disabled={historyEvents.length === 0}
                      onClick={() => {
                        setReflectionIsPlaying(false);
                        setSelectedReflectionKeypointId(null);
                        setReflectionPlaybackPosition(0);
                      }}
                    >
                      最初
                    </button>
                    <select
                      value={reflectionPlaybackSpeed}
                      onChange={(e) => setReflectionPlaybackSpeed(Number(e.target.value))}
                    >
                      <option value={60}>1秒＝1分</option>
                      <option value={300}>1秒＝5分</option>
                      <option value={600}>1秒＝10分</option>
                      <option value={1800}>1秒＝30分</option>
                    </select>
                    <div className="reflection-mini-range-wrap">
                      <input
                        type="range"
                        min="0"
                        max={Math.max(reflectionPlaybackDuration, 0)}
                        value={Math.min(reflectionPlaybackPosition, reflectionPlaybackDuration)}
                        onChange={(e) => {
                          setReflectionIsPlaying(false);
                          setSelectedReflectionKeypointId(null);
                          setReflectionPlaybackPosition(Number(e.target.value));
                        }}
                        aria-label="振り返り用タイムラプス再生位置"
                      />
                      <div className="reflection-mini-keypoint-track">
                        {reflectionKeypoints.map((event) => {
                          const meta = getKeypointMeta(event);
                          const isActive = displayedReflectionKeypoint?.id === event.id;
                          const isDeleteEvent =
                            event.type === "card_deleted" ||
                            event.type === "media_deleted";
                          const seekPosition = isDeleteEvent
                            ? Math.max(0, event.positionMs - 1)
                            : event.positionMs;

                          return (
                            <button
                              key={event.id}
                              type="button"
                              className={`timelapse-keypoint-dot ${meta.className} ${isActive ? "active" : ""}`}
                              style={{ left: `${event.percentage}%` }}
                              title={`${formatTimeOnly(event.timestamp)} ${meta.label}：${getActivityDescription(event, reflectionCardLabelMap)}`}
                              aria-label={`${formatTimeOnly(event.timestamp)} ${meta.label}`}
                              onClick={() => {
                                setReflectionIsPlaying(false);
                                setSelectedReflectionKeypointId(event.id);
                                setReflectionPlaybackPosition(seekPosition);
                              }}
                            >
                              <span>{meta.icon}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {displayedReflectionKeypoint && (() => {
                    const meta = getKeypointMeta(displayedReflectionKeypoint);
                    return (
                      <div className={`reflection-mini-keypoint-banner ${meta.className}`}>
                        <strong>{meta.label}</strong>
                        <span>{formatTimeOnly(displayedReflectionKeypoint.timestamp)}</span>
                        <p>{getActivityDescription(displayedReflectionKeypoint, reflectionCardLabelMap)}</p>
                      </div>
                    );
                  })()}

                  <div className="reflection-mini-timelapse-board">
                    <div className="reflection-mini-timelapse-canvas">
                      <svg className="connection-layer">
                        <defs>
                          <marker id="reflection-mini-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
                          </marker>
                        </defs>
                        {Object.entries(reflectionPlaybackState.connections).map(([id, connection]) => {
                          const fromCard = reflectionPlaybackState.cards[connection.from];
                          const toCard = reflectionPlaybackState.cards[connection.to];
                          if (!fromCard || !toCard) return null;
                          return (
                            <line
                              key={id}
                              x1={fromCard.x + (fromCard.width || 260) / 2}
                              y1={fromCard.y + (fromCard.height || 360) / 2}
                              x2={toCard.x + (toCard.width || 260) / 2}
                              y2={toCard.y + (toCard.height || 360) / 2}
                              stroke={connection.color || "#333"}
                              strokeWidth="4"
                              markerEnd="url(#reflection-mini-arrowhead)"
                            />
                          );
                        })}
                      </svg>

                      {Object.entries(reflectionPlaybackState.cards).map(([id, card]) => (
                        <div
                          key={id}
                          className={`card timelapse-card reflection-mini-card ${displayedReflectionKeypoint?.cardId === id
                            ? `timelapse-keypoint-card-active ${getKeypointMeta(displayedReflectionKeypoint).className}`
                            : ""
                            }`}
                          style={{
                            left: card.x,
                            top: card.y,
                            width: card.width || 260,
                            height: card.height || 360,
                            background: card.color || "#fff176"
                          }}
                        >
                          <div className="owner-name">{card.ownerName}</div>
                          <div className="timelapse-card-type">{getCardTypeLabel(card.type || "idea")}</div>
                          <div className="drawing-area drawing-area-full">
                            <PlaybackDrawingCanvas segments={reflectionPlaybackState.drawings[id] || []} />
                          </div>
                        </div>
                      ))}

                      {historyEvents.length === 0 && (
                        <div className="reflection-mini-empty">履歴がありません</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="activity-history-panel activity-flow-column">
                <div className="activity-history-heading compact-heading">
                  <div>
                    <h3>活動の流れの目印</h3>
                    <p>付箋・写真・動画の登場や削除を、活動全体を思い出すための時系列の目印として表示します。</p>
                  </div>
                  <span>{reflectionActivityEvents.length}件</span>
                </div>

                <div className="keypoint-summary">
                  {[
                    ["card_created", "付箋登場"],
                    ["card_deleted", "付箋削除"],
                    ["card_type_changed", "分類"],
                    ["card_resized", "注目"],
                    ["media_created", "写真・動画登場"],
                    ["media_deleted", "写真・動画削除"]
                  ].map(([type, label]) => (
                    <div className={`keypoint-summary-item ${getKeypointMeta({ type }).className}`} key={type}>
                      <strong>{reflectionActivityEvents.filter((event) => event.type === type).length}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                <div className="activity-keypoint-help">
                  <span aria-hidden="true">☝</span>
                  <p>
                    目印をタップすると、左のタイムラプスがその時刻へ移動し、
                    対象の付箋を枠で強調します。
                  </p>
                </div>

                <ActivityKeypointList
                  events={reflectionKeypoints}
                  selectedEventId={selectedReflectionKeypointId}
                  currentPlaybackTimestamp={reflectionPlaybackTimestamp}
                  cardLabelMap={reflectionCardLabelMap}
                  getKeypointMeta={getKeypointMeta}
                  getDescription={getActivityDescription}
                  getChangeDetail={getActivityChangeDetail}
                  formatTime={formatTimeOnly}
                  onSelect={(event) => {
                    const seekPosition =
                      event.type === "card_deleted" || event.type === "media_deleted"
                        ? Math.max(0, event.positionMs - 1)
                        : event.positionMs;

                    setReflectionIsPlaying(false);
                    setSelectedReflectionKeypointId(event.id);
                    setReflectionPlaybackPosition(seekPosition);
                  }}
                />
              </section>

              <ReflectionWritingPanel
                prompt={REFLECTION_PROMPT}
                reflectionText={reflectionText}
                onReflectionTextChange={setReflectionText}
                reflectionRecord={reflectionRecord}
                reflectionSubmitting={reflectionSubmitting}
                boardId={boardId}
                currentUserId={currentUserId}
                onClose={closeReflection}
                onSubmit={submitReflection}
                onDelete={deleteCurrentReflection}
              />
            </div>
          </div>
        </div>
      )}

      {timelapseOpen && (
        <div className="timelapse-overlay">
          <div className="timelapse-dialog">
            <div className="timelapse-header">
              <div>
                <h2>タイムラプス</h2>
                <p>{playbackTimestamp ? formatTimestamp(playbackTimestamp) : "履歴がありません"}</p>
              </div>
              <button onClick={() => { setIsPlaying(false); setTimelapseOpen(false); }}>×</button>
            </div>

            <div className="timelapse-controls">
              <button
                disabled={historyEvents.length === 0}
                onClick={() => {
                  if (playbackPosition >= playbackDuration) setPlaybackPosition(0);
                  setIsPlaying((value) => !value);
                }}
              >
                {isPlaying ? "一時停止" : "再生"}
              </button>
              <button onClick={() => { setIsPlaying(false); setPlaybackPosition(0); }}>最初から</button>
              <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}>
                <option value={60}>1秒＝1分</option>
                <option value={300}>1秒＝5分</option>
                <option value={600}>1秒＝10分</option>
                <option value={1800}>1秒＝30分</option>
              </select>
              <div className="timelapse-range-wrap">
                <input
                  type="range"
                  min="0"
                  max={Math.max(playbackDuration, 0)}
                  value={Math.min(playbackPosition, playbackDuration)}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setPlaybackPosition(Number(e.target.value));
                  }}
                  aria-label="タイムラプス再生位置"
                />

                <div className="timelapse-keypoint-track" aria-label="キーポイント一覧">
                  {timelapseKeypoints.map((event) => {
                    const meta = getKeypointMeta(event);
                    const isActive = activeTimelapseKeypoint?.id === event.id;

                    return (
                      <button
                        key={event.id}
                        type="button"
                        className={`timelapse-keypoint-dot ${meta.className} ${isActive ? "active" : ""}`}
                        style={{ left: `${event.percentage}%` }}
                        title={`${formatTimeOnly(event.timestamp)} ${meta.label}：${getActivityDescription(event, activityCardLabelMap)}`}
                        aria-label={`${formatTimeOnly(event.timestamp)} ${meta.label}`}
                        onClick={() => {
                          setIsPlaying(false);
                          setPlaybackPosition(event.positionMs);
                        }}
                      >
                        <span>{meta.icon}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <span>{historyEvents.length}件</span>
            </div>

            {activeTimelapseKeypoint && (() => {
              const meta = getKeypointMeta(activeTimelapseKeypoint);
              const payload = activeTimelapseKeypoint.payload || {};
              return (
                <div className={`timelapse-keypoint-banner ${meta.className}`}>
                  <div className={`timelapse-keypoint-banner-icon ${meta.className}`}>
                    {meta.icon}
                  </div>
                  <div>
                    <strong>{meta.label}</strong>
                    <span>{formatTimeOnly(activeTimelapseKeypoint.timestamp)}</span>
                    <p className="timelapse-keypoint-fact">記録された事実：{getActivityDescription(activeTimelapseKeypoint, activityCardLabelMap)}</p>
                    <p className="timelapse-keypoint-target">対象：{getCardDisplayName(activeTimelapseKeypoint, activityCardLabelMap)}</p>
                    <p className="timelapse-keypoint-change">{getActivityChangeDetail(activeTimelapseKeypoint)}</p>
                    <p className="timelapse-keypoint-hint">{meta.hint}</p>
                    {activeTimelapseKeypoint.type === "card_resized" && (
                      <small>操作時間：{formatDuration(payload.durationMs)}</small>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setPlaybackPosition(activeTimelapseKeypoint.positionMs);
                    }}
                  >
                    この時点へ
                  </button>
                </div>
              );
            })()}

            <div className="timelapse-keypoint-legend">
              {["card_created", "card_deleted", "card_type_changed", "card_resized"].map((type) => {
                const meta = getKeypointMeta({ type });
                return (
                  <span key={type} className={meta.className}>
                    <b>{meta.icon}</b>{meta.label}
                  </span>
                );
              })}
            </div>

            <div className="timelapse-board">
              <svg className="connection-layer">
                <defs>
                  <marker id="timelapse-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
                  </marker>
                </defs>
                {Object.entries(playbackState.connections).map(([id, connection]) => {
                  const fromCard = playbackState.cards[connection.from];
                  const toCard = playbackState.cards[connection.to];
                  if (!fromCard || !toCard) return null;
                  return (
                    <line
                      key={id}
                      x1={fromCard.x + (fromCard.width || 260) / 2}
                      y1={fromCard.y + (fromCard.height || 360) / 2}
                      x2={toCard.x + (toCard.width || 260) / 2}
                      y2={toCard.y + (toCard.height || 360) / 2}
                      stroke={connection.color || "#333"}
                      strokeWidth="4"
                      markerEnd="url(#timelapse-arrowhead)"
                    />
                  );
                })}
              </svg>

              {Object.entries(playbackState.cards).map(([id, card]) => (
                <div
                  key={id}
                  className={`card timelapse-card ${activeTimelapseKeypoint?.cardId === id
                    ? `timelapse-keypoint-card-active ${getKeypointMeta(activeTimelapseKeypoint).className}`
                    : ""
                    }`}
                  style={{
                    left: card.x,
                    top: card.y,
                    width: card.width || 260,
                    height: card.height || 360,
                    background: card.color || "#fff176"
                  }}
                >
                  <div className="owner-name">{card.ownerName}</div>
                  <div className="timelapse-card-type">{getCardTypeLabel(card.type || "idea")} ／ ID:{getShortCardId(id)}</div>
                  <div className="drawing-area drawing-area-full">
                    <PlaybackDrawingCanvas segments={playbackState.drawings[id] || []} />
                  </div>
                </div>
              ))}

              {historyEvents.length === 0 && (
                <div className="timelapse-empty">履歴がありません。統合版導入後の操作から記録されます。</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
