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
  serverTimestamp,
} from "firebase/database";

import RealtimeDrawingCanvas from "./components/RealtimeDrawingCanvas";
import PlaybackDrawingCanvas from "./components/PlaybackDrawingCanvas";
import LoginPage from "./components/LoginPage";
import AdminPage from "./components/AdminPage";
import BoardHeader from "./components/BoardHeader";
import GroupSelectionPage from "./components/GroupSelectionPage";
import ActivityStatusBar from "./components/ActivityStatusBar";
import NextActionDialog from "./components/NextActionDialog";
import { db, auth } from "./firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { loginWithSchoolCode, logoutSchool, callSchool } from "./services/schoolService";
import { parseSchoolCsv } from "./utils/schoolCsv";
import ArchivedBoardsPage from "./components/ArchivedBoardsPage";
import {
  DRAWING_COLOR,
  DRAWING_WIDTH_PX,
  DRAWING_FLUSH_INTERVAL_MS,
  REFLECTION_PROMPT
} from "./constants/appConstants";
import { clamp } from "./utils/commonUtils";
import {
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
  getActivityDescription,
  getKeypointMeta
} from "./utils/activityUtils";
import { createPlaybackState } from "./utils/playbackUtils";
import { drawSegmentOnCanvas, resizeCanvasToDisplaySize } from "./utils/drawingUtils";
import { uploadMedia, deleteMediaFile } from "./services/mediaService";
import AdminFeedbackFeature from "./components/feedback/AdminFeedbackFeature";
import ReflectionDialog from "./components/reflection/ReflectionDialog";
import BoardDrawingCanvas from "./components/board/BoardDrawingCanvas";
import CardConnectionLayer from "./components/board/CardConnectionLayer";
import ImageCropDialog from "./components/board/ImageCropDialog";
import CardMenu from "./components/board/CardMenu";
import MemberPanel from "./components/board/MemberPanel";
import StickyNoteList from "./components/board/StickyNoteList";

const getImageDimensions = (file) => new Promise((resolve, reject) => {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve({ width: image.naturalWidth, height: image.naturalHeight });
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("画像のサイズを読み取れませんでした。"));
  };
  image.src = objectUrl;
});

const fitImageSize = (width, height, maxWidth = 420, maxHeight = 420) => {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

export default function App() {
  const boardRef = useRef(null);
  const boardCanvasRef = useRef(null);
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
  const focusedCardTimerRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [loginId, setLoginId] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [viewingArchive, setViewingArchive] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [users, setUsers] = useState({});
  const [boardId, setBoardId] = useState("");
  const [groups, setGroups] = useState({});
  const [groupName, setGroupName] = useState("");
  const [boardMeta, setBoardMeta] = useState(null);
  const [allBoardsLoading, setAllBoardsLoading] = useState(false);
  const [allBoardsError, setAllBoardsError] = useState("");
  const [groupOpening, setGroupOpening] = useState(false);
  const [endingActivity, setEndingActivity] = useState(false);
  const [submittingActivity, setSubmittingActivity] = useState(false);

  const [cards, setCards] = useState({});
  const [mediaItems, setMediaItems] = useState({});
  const [imageCropTarget, setImageCropTarget] = useState(null);
  const [members, setMembers] = useState({});
  const [connections, setConnections] = useState({});
  const [allBoards, setAllBoards] = useState({});

  const [screen, setScreen] = useState("board");
  const [movingCard, setMovingCard] = useState(null);
  const [movingMedia, setMovingMedia] = useState(null);
  const [resizingMedia, setResizingMedia] = useState(null);
  const [resizingCard, setResizingCard] = useState(null);

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState("members");

  const [timelapseOpen, setTimelapseOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(300);
  const [isPlaying, setIsPlaying] = useState(false);

  // 活動全体を振り返るための時系列の目印と自由記述
  const [activityEvents, setActivityEvents] = useState([]);
  // 振り返り開始時点の履歴を固定して提示する。
  // 振り返り中に他の参加者が操作しても、提示条件が変化しないようにする。
  const [reflectionActivityEvents, setReflectionActivityEvents] = useState([]);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionText, setReflectionText] = useState("");
  const [reflectionRecord, setReflectionRecord] = useState(null);
  const [reflectionSubmitting, setReflectionSubmitting] = useState(false);
  const [nextActionOpen, setNextActionOpen] = useState(false);
  const [nextActionText, setNextActionText] = useState("");
  const [nextActionSaving, setNextActionSaving] = useState(false);
  const [reflectionPlaybackPosition, setReflectionPlaybackPosition] = useState(0);
  const [reflectionPlaybackSpeed, setReflectionPlaybackSpeed] = useState(300);
  const [reflectionIsPlaying, setReflectionIsPlaying] = useState(false);
  const [selectedReflectionKeypointId, setSelectedReflectionKeypointId] = useState(null);
  const [boardTool, setBoardTool] = useState("move");
  const [cardDrawingTool, setCardDrawingTool] = useState("pen");
  const [cardMenuId, setCardMenuId] = useState(null);
  const [focusedCardId, setFocusedCardId] = useState(null);

  useEffect(() => {
    let stopProfile = () => {};
    const stopAuth = onAuthStateChanged(auth, (authenticatedUser) => {
      stopProfile();
      setCurrentUser(null);
      setCurrentUserId(null);
      setUsers({});
      setAllBoards({});
      setGroups({});
      resetBoardStates();
      setScreen("board");
      if (!authenticatedUser) {
        setAuthReady(true);
        return;
      }
      setAuthReady(false);
      stopProfile = onValue(ref(db, `users/${authenticatedUser.uid}`), (snapshot) => {
        if (auth.currentUser?.uid !== authenticatedUser.uid) return;
        const profile = snapshot.val();
        if (!profile || profile.disabled) {
          setLoginError("このユーザーは利用できません。管理者に確認してください。");
          void logoutSchool();
          return;
        }
        setCurrentUserId(authenticatedUser.uid);
        setCurrentUser(profile);
        setAuthReady(true);
      }, () => {
        setLoginError("ログインの有効期限が切れました。再度ログインしてください。");
        void logoutSchool();
      });
    });
    return () => { stopAuth(); stopProfile(); };
  }, []);

  useEffect(() => {
    if (currentUser?.role !== "admin") return;
    return onValue(ref(db, "users"), snapshot => setUsers(snapshot.val() || {}));
  }, [currentUser?.role]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") {
      setAllBoardsLoading(false);
      return undefined;
    }

    setAllBoardsLoading(true);
    setAllBoardsError("");
    return onValue(ref(db, "boards"), (snapshot) => {
      setAllBoards(snapshot.val() || {});
      setAllBoardsLoading(false);
      setAllBoardsError("");
    }, (error) => {
      console.error("管理者用のボード一覧を読み込めませんでした", error);
      setAllBoardsError(error.message || "ボードの振り返りを読み込めませんでした。");
      setAllBoardsLoading(false);
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUserId) return;
    return onValue(ref(db, "groups"), (snapshot) => {
      setGroups(snapshot.val() || {});
    });
  }, [currentUserId]);

  useEffect(() => {
    if (!boardId) return undefined;

    return onValue(ref(db, `boards/${boardId}/meta`), (snapshot) => {
      setBoardMeta(snapshot.val() || null);
    }, () => {
      resetBoardStates();
      if (auth.currentUser) alert("このボードを閲覧する権限がありません。編集者と管理者のみ閲覧できます。");
    });
  }, [boardId]);

  useEffect(() => {
    if (!boardId) return;

    const unsubCards = onValue(ref(db, `boards/${boardId}/cards`), (snapshot) => {
      setCards(snapshot.val() || {});
    });

    const unsubMembers = currentUser?.role === "admin"
      ? onValue(ref(db, `boards/${boardId}/members`), (snapshot) => {
        setMembers(snapshot.val() || {});
      })
      : () => {};

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
        if (!nextActionOpen) {
          setNextActionText(value?.nextAction || "");
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
  }, [boardId, currentUserId, currentUser?.role, reflectionOpen, nextActionOpen]);

  useEffect(() => {
    if (!boardId || !currentUserId || !currentUser || viewingArchive || ["submitted", "completed", "closing"].includes(boardMeta?.status)) return undefined;

    const memberRef = ref(db, `boards/${boardId}/members/${currentUserId}`);

    const heartbeat = () => {
      update(memberRef, {
        name: currentUser.name,
        role: currentUser.role,
        color: currentUser.color || "#fff176",
        status: document.hidden ? "away" : "online",
        lastActive: serverTimestamp()
      }).catch((error) => {
        console.error("参加状態を更新できませんでした", error);
      });
    };

    onDisconnect(memberRef).update({
      status: "offline",
      lastActive: serverTimestamp()
    });

    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    const handleVisibilityChange = () => heartbeat();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [boardId, currentUserId, currentUser, viewingArchive, boardMeta?.status]);

  const selectableGroups = useMemo(() => {
    const nextGroups = { ...groups };

    if (currentUser?.role === "admin") {
      Object.entries(allBoards).forEach(([legacyBoardId, legacyBoard]) => {
        if (legacyBoard?.meta?.groupId) return;
        if (nextGroups[legacyBoardId]) return;

        nextGroups[legacyBoardId] = {
          name: legacyBoardId,
          legacyBoardId,
          isLegacy: true,
          boardControl: {
            currentBoardId: legacyBoardId,
            currentBoardNumber: 1,
            boardCount: 1
          }
        };
      });
    }

    return nextGroups;
  }, [groups, allBoards, currentUser]);

  const boardIsCompleted = viewingArchive || ["submitted", "completed", "closing"].includes(boardMeta?.status);
  const currentBoardNumber = Number(boardMeta?.number) || 1;
  const previousNextActions = (() => {
    const savedEntries = Array.isArray(boardMeta?.previousNextActionEntries)
      ? boardMeta.previousNextActionEntries
      : Object.entries(boardMeta?.previousNextActions || {}).map(([userId, value]) => ({
        userId,
        userName: typeof value === "object" ? value?.userName || "" : "",
        text: typeof value === "string" ? value : value?.text || ""
      }));
    const entries = savedEntries
      .map((entry) => ({
        userId: entry?.userId || "",
        userName: entry?.userName || "",
        text: String(entry?.text || "").trim()
      }))
      .filter((entry) => entry.text);

    if (entries.length) return entries;
    return boardMeta?.previousNextAction
      ? [{ userId: "", userName: "", text: String(boardMeta.previousNextAction) }]
      : [];
  })();
  const currentNextAction = reflectionRecord?.nextAction || "";

  const runIfBoardEditable = (callback) => (...args) => {
    if (boardIsCompleted) {
      const firstArg = args[0];
      if (firstArg?.target?.type === "file") {
        firstArg.target.value = "";
      }
      alert("この活動は終了しているため、ボードは閲覧専用です");
      return;
    }

    return callback(...args);
  };

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

  function resetBoardStates() {
    setBoardId("");
    setViewingArchive(false);
    setGroupName("");
    setBoardMeta(null);
    setCards({});
    setMediaItems({});
    setMembers({});
    setConnections({});
    setActivityEvents([]);
    setHistoryEvents([]);
    setPlaybackPosition(0);
    setIsPlaying(false);
    setTimelapseOpen(false);
    setReflectionActivityEvents([]);
    setReflectionOpen(false);
    setReflectionText("");
    setReflectionRecord(null);
    setNextActionOpen(false);
    setNextActionText("");
    setReflectionPlaybackPosition(0);
    setReflectionIsPlaying(false);
    setSelectedReflectionKeypointId(null);
    reflectionStartedAtRef.current = null;
    reflectionAccumulatedDurationRef.current = 0;
    setMovingCard(null);
    setMovingMedia(null);
    setResizingMedia(null);
    setResizingCard(null);
    setSidePanelOpen(false);
    setSidePanelMode("members");
    setZoom(1);
    setBoardTool("move");
    setCardDrawingTool("pen");
    setCardMenuId(null);
    setFocusedCardId(null);
    if (focusedCardTimerRef.current) {
      window.clearTimeout(focusedCardTimerRef.current);
      focusedCardTimerRef.current = null;
    }
    drawingRef.current = { isDrawing: false };
  }

  const zoomIn = () => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(1))));
  const zoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))));
  const resetZoom = () => setZoom(1);

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

  const login = async () => {
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      await loginWithSchoolCode(loginId.trim(), loginCode);
      setLoginCode("");
    } catch (error) {
      setLoginError(error.message || "ログインできませんでした。");
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    if (boardId && currentUserId && !boardIsCompleted) {
      await remove(ref(db, `boards/${boardId}/members/${currentUserId}`)).catch(console.error);
    }
    await logoutSchool();
    resetBoardStates();
    setCurrentUserId(null);
    setCurrentUser(null);
    setLoginId("");
    setLoginCode("");
    setScreen("board");
  };

  const createGroup = async (name) => {
    if (currentUser?.role !== "admin" || !currentUserId) return;

    const normalizedName = name.trim();
    if (!normalizedName) {
      alert("グループ名を入力してください");
      return;
    }

    const duplicate = Object.values(groups).some(
      (group) => group?.name?.trim() === normalizedName
    );
    if (duplicate) {
      alert("同じ名前のグループがすでにあります");
      return;
    }

    const groupRef = push(ref(db, "groups"));
    await set(groupRef, {
      name: normalizedName,
      createdBy: currentUserId,
      createdByName: currentUser.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      boardControl: {
        boardCount: 0
      }
    });
  };

  const enterSelectedBoard = async ({
    selectedBoardId,
    selectedGroupName
  }) => {
    if (!selectedBoardId || !currentUserId || !currentUser) return;

    const memberRef = ref(
      db,
      `boards/${selectedBoardId}/members/${currentUserId}`
    );

    const metaRef = ref(db, `boards/${selectedBoardId}/meta`);
    let meta = (await get(metaRef)).val();
    if (!meta) throw new Error("ボード情報を読み込めませんでした。");
    if (meta.status === "active") {
      try {
        await update(memberRef, {
          name: currentUser.name,
          role: currentUser.role,
          color: currentUser.color || "#fff176",
          status: "online",
          joinedAt: serverTimestamp(),
          lastActive: serverTimestamp()
        });
        await onDisconnect(memberRef).update({
          status: "offline",
          lastActive: serverTimestamp()
        });
      } catch (error) {
        // A student may submit while another person is opening the same board.
        meta = (await get(metaRef)).val();
        if (!["submitted", "closing", "completed"].includes(meta?.status)) throw error;
      }
    }

    setGroupName(selectedGroupName);
    setBoardMeta(meta);
    setBoardId(selectedBoardId);
  };

  const selectGroup = async (selectedGroupId) => {
    if (!currentUserId || groupOpening) return;
    setGroupOpening(true);
    try {
      const result = await callSchool("selectSchoolGroup", { groupId: selectedGroupId });
      resetBoardStates();
      await enterSelectedBoard({ selectedBoardId: result.boardId,
        selectedGroupName: result.groupName });
    } catch (error) {
      alert(error.message || "グループを開けませんでした。");
    } finally { setGroupOpening(false); }
  };

  const openArchivedBoard = async (selectedBoardId) => {
    if (groupOpening) return;
    setGroupOpening(true);
    try {
      const result = await callSchool("openArchivedBoard", { boardId: selectedBoardId });
      resetBoardStates();
      setViewingArchive(true);
      setGroupName(result.groupName);
      setBoardMeta({ status: "completed", number: result.number });
      setBoardId(result.id);
      setScreen("board");
    } catch (error) {
      alert(error.message || "このボードを開けませんでした。");
    } finally { setGroupOpening(false); }
  };

  const leaveBoard = () => {
    if (boardId && currentUserId && !boardIsCompleted) {
      void remove(ref(db, `boards/${boardId}/members/${currentUserId}`)).catch(console.error);
    }
    const wasArchive = viewingArchive;
    resetBoardStates();
    if (wasArchive) setScreen("archives");
  };

  const saveNextAction = async () => {
    if (boardIsCompleted) return;
    const nextAction = nextActionText.trim();
    if (!nextAction) {
      alert("次回することを入力してください");
      return;
    }
    if (!boardId || !currentUserId || !currentUser) return;

    setNextActionSaving(true);
    try {
      await update(
        ref(db, `boards/${boardId}/reflections/${currentUserId}`),
        {
          userId: currentUserId,
          userName: currentUser.name,
          nextAction,
          nextActionUpdatedAt: serverTimestamp()
        }
      );
      setNextActionOpen(false);
      alert("次回することを保存しました");
    } catch (error) {
      console.error("次回することを保存できませんでした", error);
      alert("次回することを保存できませんでした");
    } finally {
      setNextActionSaving(false);
    }
  };

  const submitCurrentActivity = async () => {
    if (currentUser?.role !== "student" || !boardId || viewingArchive || boardMeta?.status !== "active" || submittingActivity) return;
    if (!window.confirm("グループの活動を終了して先生に提出しますか？提出後はボードを編集できません。")) return;
    setSubmittingActivity(true);
    try {
      await callSchool("submitSchoolBoard", { boardId });
      setBoardMeta((meta) => ({ ...meta, status: meta?.status === "active" ? "submitted" : meta?.status || "submitted" }));
      setBoardTool("move");
      setImageCropTarget(null);
      setCardMenuId(null);
      alert("先生に提出しました。先生の最終確認をお待ちください。");
    } catch (error) {
      console.error("活動を先生に提出できませんでした", error);
      alert(error.code === "functions/not-found"
        ? "提出処理がサーバーにありません。修正版のCloud Functionsをデプロイしてください。"
        : `${error.message || "先生に提出できませんでした。"}${error.code ? `（${error.code}）` : ""}`);
    } finally { setSubmittingActivity(false); }
  };

  const finalizeCurrentActivity = async () => {
    if (currentUser?.role !== "admin" || !boardId || viewingArchive || !["submitted", "closing"].includes(boardMeta?.status) || endingActivity) return;
    if (!window.confirm("提出されたボードを最終確認し、活動を終了しますか？次回のボードを準備します。")) return;
    setEndingActivity(true);
    try {
      const result = await callSchool("finishSchoolBoard", { boardId });
      setBoardTool("move");
      alert(`活動を終了しました。第${result.nextBoardNumber}回のボードを準備しました。`);
    } catch (error) {
      console.error("活動を終了できませんでした", error);
      alert(`${error.message || "活動を終了できませんでした。"}${error.code ? `（${error.code}）` : ""}`);
    }
    finally { setEndingActivity(false); }
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
const uploadSelectedMedia = async (file, { showSuccess = true } = {}) => {
  try {
    let imageDimensions = null;
    if (file.type.startsWith("image/")) {
      try {
        imageDimensions = await getImageDimensions(file);
      } catch (dimensionError) {
        // Metadata is only used to size the frame. It must not prevent the file upload.
        console.warn("画像サイズを取得できないため、既定サイズで追加します。", dimensionError);
      }
    }
    const result = await uploadMedia({ boardId, file });
    const mediaRef = push(ref(db, `boards/${boardId}/media`));
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    const timestamp = serverTimestamp();
    const imageSize = imageDimensions ? fitImageSize(imageDimensions.width, imageDimensions.height) : null;
    const mediaData = {
      type: result.type,
      url: result.url,
      storagePath: result.storagePath,
      fileName: result.fileName,
      width: imageSize?.width || 500,
      height: imageSize?.height || 320,
      ...(imageDimensions ? { imageAspectRatio: imageDimensions.width / imageDimensions.height } : {}),
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

    if (showSuccess) {
      alert("アップロードしました。");
    }
    return { mediaId: mediaRef.key, media: { id: mediaRef.key, ...mediaData } };
  } catch (error) {
    console.error(error);
    alert(error instanceof Error ? error.message : "アップロードに失敗しました");
    return null;
  }
};

const handleUpload = async (event) => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  input.value = "";

  setBoardTool("move");
  await uploadSelectedMedia(file);
};

const openImageCrop = (mediaId, media) => {
  if (boardIsCompleted || boardTool !== "crop" || media.type !== "image") return;
  setImageCropTarget({ mediaId, media });
  setBoardTool("move");
};

const saveImageCrop = async (crop) => {
  if (!imageCropTarget || boardIsCompleted) return;
  const { mediaId, media } = imageCropTarget;
  const beforeMedia = { id: mediaId, ...media };
  const imageSize = fitImageSize(crop.width, crop.height);
  const nextCrop = {
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
    naturalWidth: crop.naturalWidth,
    naturalHeight: crop.naturalHeight
  };
  const nextMedia = {
    ...media,
    crop: nextCrop,
    width: imageSize.width,
    height: imageSize.height,
    imageAspectRatio: crop.width / crop.height
  };
  try {
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
    const timestamp = serverTimestamp();
    const eventData = {
      type: "media_cropped",
      userId: currentUserId,
      userName: currentUser.name,
      payload: { mediaId, beforeMedia, media: { id: mediaId, ...nextMedia } },
      timestamp
    };
    await update(ref(db, `boards/${boardId}`), {
      [`media/${mediaId}/crop`]: nextCrop,
      [`media/${mediaId}/width`]: nextMedia.width,
      [`media/${mediaId}/height`]: nextMedia.height,
      [`media/${mediaId}/imageAspectRatio`]: nextMedia.imageAspectRatio,
      [`media/${mediaId}/updatedAt`]: timestamp,
      [`history/${historyRef.key}`]: eventData,
      [`activityEvents/${activityRef.key}`]: eventData
    });
    setImageCropTarget(null);
  } catch (error) {
    console.error(error);
    throw new Error(error instanceof Error ? error.message : "切り抜き範囲を保存できませんでした。", { cause: error });
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
    if (boardTool !== "move" || resizingCard || drawingRef.current.isDrawing) return;
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
    if (resizingCard || drawingRef.current.isDrawing) return;
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
    return update(ref(db, `boards/${boardId}/media/${mediaId}`), {
      ...data,
      updatedAt: serverTimestamp()
    });
  };

  const handleBoardImageLoad = (event, mediaId, media) => {
    const image = event.currentTarget;
    if (!image.naturalWidth || !image.naturalHeight) return;
    if (media.crop) return;
    const ratio = image.naturalWidth / image.naturalHeight;
    // Fit the frame to the actual decoded image, including media saved with stale dimensions.
    const fittedSize = fitImageSize(
      image.naturalWidth,
      image.naturalHeight,
      Number(media.width) || 420,
      Number(media.height) || 300
    );
    // Archived boards are read-only, but still display old images without letterboxing.
    const frame = image.parentElement;
    if (frame) {
      frame.style.width = `${fittedSize.width}px`;
      frame.style.height = `${fittedSize.height}px`;
    }
    const storedRatio = Number(media.imageAspectRatio);
    const needsSave = Math.abs((Number(media.width) || 420) - fittedSize.width) > 1
      || Math.abs((Number(media.height) || 300) - fittedSize.height) > 1
      || !Number.isFinite(storedRatio)
      || Math.abs(storedRatio - ratio) > 0.01;
    if (!boardIsCompleted && needsSave) {
      void updateMediaItem(mediaId, { ...fittedSize, imageAspectRatio: ratio })
        .catch((error) => console.error("画像サイズの保存に失敗しました。", error));
    }
  };

  const handleMediaPointerDown = (e, mediaId, media) => {
    if (boardTool !== "move" || movingCard || resizingCard || drawingRef.current.isDrawing) return;
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
    const media = mediaItems[resizingMedia.id] || {};
    const ratio = media.type === "image"
      ? Number(media.imageAspectRatio) || resizingMedia.startWidth / resizingMedia.startHeight
      : null;
    let width;
    let height;
    if (ratio) {
      const deltaX = (e.clientX - resizingMedia.startX) / zoom;
      const deltaY = (e.clientY - resizingMedia.startY) / zoom;
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        width = Math.max(1, resizingMedia.startWidth + deltaX);
        height = width / ratio;
      } else {
        height = Math.max(1, resizingMedia.startHeight + deltaY);
        width = height * ratio;
      }
      const minScale = Math.max(180 / width, 120 / height, 1);
      width *= minScale;
      height *= minScale;
    } else {
      width = Math.max(180, resizingMedia.startWidth + (e.clientX - resizingMedia.startX) / zoom);
      height = Math.max(120, resizingMedia.startHeight + (e.clientY - resizingMedia.startY) / zoom);
    }
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
    if (boardIsCompleted) return;
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
    if (boardTool !== "move" || drawingRef.current.isDrawing) return;
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
    if (!canEdit || resizingCard) return;
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
      (Number(card.x) || 0) * zoom - boardRef.current.clientWidth / 2 + ((Number(card.width) || 260) * zoom) / 2
    );
    const targetTop = Math.max(
      0,
      (Number(card.y) || 0) * zoom - boardRef.current.clientHeight / 2 + ((Number(card.height) || 360) * zoom) / 2
    );

    boardRef.current.scrollTo({ left: targetLeft, top: targetTop, behavior: "smooth" });
    setFocusedCardId(cardId);
    setSidePanelOpen(false);

    if (focusedCardTimerRef.current) window.clearTimeout(focusedCardTimerRef.current);
    focusedCardTimerRef.current = window.setTimeout(() => setFocusedCardId(null), 2200);
  };

  const createHandDrawnConnection = async (connection) => {
    if (!boardId || boardIsCompleted) return;
    const connectionRef = push(ref(db, `boards/${boardId}/connections`));
    const historyRef = push(ref(db, `boards/${boardId}/history`));
    const timestamp = serverTimestamp();
    const connectionData = {
      ...connection,
      owner: currentUserId,
      ownerName: currentUser.name
    };

    await update(ref(db, `boards/${boardId}`), {
      [`connections/${connectionRef.key}`]: {
        ...connectionData,
        createdAt: timestamp
      },
      [`history/${historyRef.key}`]: {
        type: "connection_created",
        connectionId: connectionRef.key,
        userId: currentUserId,
        userName: currentUser.name,
        payload: { connection: connectionData },
        timestamp
      }
    });
  };

  const deleteHandDrawnConnection = async (connectionId, connection) => {
    if (!boardId || !currentUser || !connectionId || !connection) return;

    if (boardIsCompleted) {
      alert("活動終了後は矢印を削除できません。");
      return;
    }

    if (
      currentUser.role !== "admin" &&
      connection.owner !== currentUserId
    ) {
      alert("他のユーザーが作成した矢印は削除できません。");
      return;
    }

    try {
      const historyRef = push(ref(db, `boards/${boardId}/history`));
      const activityRef = push(ref(db, `boards/${boardId}/activityEvents`));
      const deletedEvent = {
        type: "connection_deleted",
        connectionId,
        userId: currentUserId,
        userName: currentUser.name,
        payload: { connection },
        timestamp: serverTimestamp()
      };

      await update(ref(db, `boards/${boardId}`), {
        [`connections/${connectionId}`]: null,
        [`history/${historyRef.key}`]: deletedEvent,
        [`activityEvents/${activityRef.key}`]: deletedEvent
      });
    } catch (error) {
      console.error("矢印の削除に失敗しました", error);
      alert(`矢印を削除できませんでした: ${error.message}`);
    }
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

    try {
      // Board history and activity keypoints are both read from the selected board,
      // including when it is opened from the archive list.
      const [historySnapshot, activitySnapshot] = await Promise.all([
        get(ref(db, `boards/${boardId}/history`)),
        get(ref(db, `boards/${boardId}/activityEvents`))
      ]);
      const readEvents = (snapshot) => {
        const events = [];
        snapshot.forEach((child) => {
          const value = child.val();
          if (value && typeof value.timestamp === "number") {
            events.push({ id: child.key, ...value });
          }
        });
        return events.sort((a, b) => {
          const diff = (a.timestamp || 0) - (b.timestamp || 0);
          return diff !== 0 ? diff : a.id.localeCompare(b.id);
        });
      };
      setHistoryEvents(readEvents(historySnapshot));
      setReflectionActivityEvents(readEvents(activitySnapshot));
    } catch (error) {
      console.error("振り返り用タイムラプス履歴を取得できませんでした", error);
    }

    setReflectionOpen(true);

    const usageRef = ref(
      db,
      `boards/${boardId}/reflectionUsage/${currentUserId}`
    );
    const usageSnapshot = await get(usageRef);
    const usage = usageSnapshot.val() || {};
    if (boardIsCompleted) return;

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
      const reflection = {
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
      };
      const reflectionUpdates = Object.fromEntries(
        Object.entries(reflection).map(([field, value]) => [
          `boards/${boardId}/reflections/${currentUserId}/${field}`,
          value
        ])
      );
      await update(ref(db), reflectionUpdates);

      setReflectionOpen(false);
      setReflectionActivityEvents([]);
      setReflectionPlaybackPosition(0);
      setReflectionIsPlaying(false);
      reflectionStartedAtRef.current = null;
      reflectionAccumulatedDurationRef.current = 0;
      alert("振り返りを保存しました");
    } catch (error) {
      console.error("振り返りを保存できませんでした", error);
      alert(error.message || "振り返りを保存できませんでした");
    } finally {
      setReflectionSubmitting(false);
    }
  };


  const deleteCurrentReflection = async () => {
    if (boardIsCompleted) return;
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
      setNextActionText("");
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
        "nextAction",
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
        value.nextAction || "",
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

  const saveUserCredentials = async (record) => {
    try {
      const credentials = await callSchool("saveSchoolUser", record);
      return credentials;
    } catch (error) {
      alert(error.message || "保存できませんでした。");
      return null;
    }
  };
  const updateUser = async (uid, data) => {
    try { await update(ref(db, `users/${uid}`), data); }
    catch (error) { alert(error.message || "ユーザーを更新できませんでした。"); }
  };
  const deleteUser = async (uid) => {
    if (uid === currentUserId) return;
    if (!window.confirm("このユーザーのログインを無効化しますか？編集履歴は保持されます。")) return;
    try { await callSchool("disableSchoolUser", { uid }); }
    catch (error) { alert(error.message || "無効化できませんでした。"); }
  };
  const importUsersFromCsv = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    let count = 0;
    const generatedCredentials = [];
    try {
      const records = parseSchoolCsv(await file.text());
      for (const record of records) {
        generatedCredentials.push(await callSchool("saveSchoolUser", record));
        count += 1;
      }
      alert(`${count}人を登録しました。発行されたIDとログインコードを管理画面で確認してください。`);
    } catch (error) { alert(`${count}人を登録した時点で停止しました。${error.message}`); }
    finally { input.value = ""; }
    return generatedCredentials;
  };

  if (!authReady) return <div className="login-page"><p role="status">ログイン状態を確認中…</p></div>;

  if (!currentUser) {
    return (
      <LoginPage
        loginId={loginId}
        loginCode={loginCode}
        onLoginIdChange={setLoginId}
        onLoginCodeChange={setLoginCode}
        busy={loginBusy}
        error={loginError}
        onLogin={login}
      />
    );
  }

  if (screen === "admin" && currentUser.role === "admin") {
    return (
      <AdminPage
        users={users}
        boards={allBoards}
        boardsLoading={allBoardsLoading}
        boardsError={allBoardsError}
        currentUserId={currentUserId}
        currentUser={currentUser}
        onImportUsers={importUsersFromCsv}
        onUpdateUser={updateUser}
        onDeleteUser={deleteUser}
        onSaveLogin={saveUserCredentials}
        onBack={() => setScreen("board")}
      />
    );
  }

  if (screen === "archives") return <ArchivedBoardsPage onOpen={openArchivedBoard}
    opening={groupOpening} onBack={() => setScreen("board")} />;

  if (!boardId) {
    return (
      <GroupSelectionPage
        currentUser={currentUser}
        groups={selectableGroups}
        onOpenArchives={() => setScreen("archives")}
        opening={groupOpening}
        onSelectGroup={selectGroup}
        onCreateGroup={createGroup}
        onOpenAdmin={() => setScreen("admin")}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="app">
      <BoardHeader
        readOnly={boardIsCompleted}
        onOpenArchives={() => setScreen("archives")}
        boardId={`${groupName} ／ 第${currentBoardNumber}回`}
        currentUser={currentUser}
        reflectionRecord={reflectionRecord}
        boardTool={boardTool}
        onBoardToolChange={(nextTool) => {
          if (boardIsCompleted) {
            alert("この活動は終了しているため、ボードは閲覧専用です");
            return;
          }
          setBoardTool(nextTool);
          setCardMenuId(null);
          if (nextTool !== "move") {
            setCardDrawingTool("pen");
          }
        }}
        onClearBoardDrawing={runIfBoardEditable(clearBoardDrawing)}
        onAddCard={runIfBoardEditable(addCard)}
        onUploadMedia={runIfBoardEditable(handleUpload)}
        onOpenMembers={() => {
          if (currentUser?.role !== "admin") return;
          setSidePanelMode("members");
          setSidePanelOpen(true);
        }}
        onOpenCards={() => {
          setSidePanelMode("cards");
          setSidePanelOpen(true);
        }}
        onOpenReflection={openReflection}
        onExportReflectionCsv={exportReflectionCsv}
        onOpenAdmin={() => setScreen("admin")}
        onLeaveBoard={leaveBoard}
        onLogout={logout}
      />

      <ActivityStatusBar
        readOnly={boardIsCompleted}
        groupName={groupName}
        boardNumber={currentBoardNumber}
        status={boardMeta?.status || "active"}
        previousNextActions={previousNextActions}
        currentNextAction={currentNextAction}
        isAdmin={currentUser.role === "admin"}
        submitting={submittingActivity}
        ending={endingActivity}
        onOpenNextAction={() => {
          setNextActionText(reflectionRecord?.nextAction || "");
          setNextActionOpen(true);
        }}
        onSubmitActivity={submitCurrentActivity}
        onFinalizeActivity={finalizeCurrentActivity}
      />

      <main className="layout">
        <section className={`board ${boardIsCompleted ? "board-read-only" : ""}`}>
          <div className="board-scroll" ref={boardRef}>
            <div className="zoom-controls">
              <button onClick={zoomOut}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn}>＋</button>
              <button onClick={resetZoom}>100%</button>
            </div>

            <div
              ref={boardCanvasRef}
              className={`board-canvas ${boardIsCompleted ? "board-canvas-read-only" : ""}`}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left"
              }}
            >
              {Object.entries(cards).map(([id, card]) => {
                const isOwner = card.owner === currentUserId;
                const isAdmin = currentUser.role === "admin";

                return (
                  <div
                    key={id}
                    className={`card ${isOwner ? "my-card" : "other-card"} ${focusedCardId === id ? "card-focus-highlight" : ""}`}
                    style={{
                      left: card.x,
                      top: card.y,
                      width: card.width || 260,
                      height: card.height || 360,
                      background: card.color || "#fff176",
                      zIndex: Number(card.zIndex) || 1
                    }}
                    onClick={() => {
                      setFocusedCardId(id);
                      setCardMenuId(null);
                    }}
                    onPointerDown={(e) => handlePointerDown(e, id, card)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    {(isOwner || isAdmin) && (
                      <CardMenu
                        open={cardMenuId === id}
                        onToggle={() => setCardMenuId((current) => current === id ? null : id)}
                        onBringToFront={() => changeCardLayer(id, "front")}
                        onSendToBack={() => changeCardLayer(id, "back")}
                        onDelete={() => deleteCard(id, card)}
                      />
                    )}

                    {!isOwner && <div className="lock-label">他の人</div>}

                    <div className="card-header-row">
                      <div
                        className="owner-name"
                        title={card.ownerName || "名前なし"}
                      >
                        {card.ownerName || "名前なし"}
                      </div>

                      <select
                        className="card-type-select"
                        aria-label="付箋の種類"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        value={card.type || "idea"}
                        onChange={(e) =>
                          changeCardType(id, card, e.target.value)
                        }
                      >
                        <option value="idea">アイデア</option>
                        <option value="problem">課題</option>
                        <option value="reason">理由</option>
                        <option value="solution">解決案</option>
                        <option value="evidence">根拠</option>
                      </select>
                    </div>


                    <div
                      className={`drawing-area drawing-area-full ${["pen", "eraser"].includes(boardTool) ? "drawing-area-disabled" : ""}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="drawing-toolbar">
                        <span>{boardTool === "move" ? "この付箋に書く" : boardTool === "arrow" ? "矢印で接続中" : boardTool === "crop" ? "画像を選択中" : "ボードへの書き込み中"}</span>
                        <div className="card-drawing-tools">
                          <button
                            type="button"
                            className={cardDrawingTool === "pen" ? "active" : ""}
                            disabled={(!isOwner && !isAdmin) || boardTool !== "move"}
                            onClick={(event) => {
                              event.stopPropagation();
                              setCardDrawingTool("pen");
                            }}
                          >
                            ペン
                          </button>
                          <button
                            type="button"
                            className={cardDrawingTool === "eraser" ? "active" : ""}
                            disabled={(!isOwner && !isAdmin) || boardTool !== "move"}
                            onClick={(event) => {
                              event.stopPropagation();
                              setCardDrawingTool("eraser");
                            }}
                          >
                            消しゴム
                          </button>
                          <button
                            type="button"
                            disabled={(!isOwner && !isAdmin) || boardTool !== "move"}
                            onClick={(event) => clearCardDrawing(event, id, (isOwner || isAdmin) && boardTool === "move")}
                          >
                            全消去
                          </button>
                        </div>
                      </div>

                      <RealtimeDrawingCanvas
                        boardId={boardId}
                        cardId={id}
                        canEdit={(isOwner || isAdmin) && boardTool === "move"}
                        tool={cardDrawingTool}
                        startDrawOnCard={startDrawOnCard}
                        drawOnCard={drawOnCard}
                        stopDrawOnCard={stopDrawOnCard}
                        onEraseStroke={eraseCardStroke}
                      />
                    </div>

                    <div
                      className="resize-handle"
                      onPointerDown={(e) => startResizeCard(e, id, card)}
                      onPointerMove={moveResizeCard}
                      onPointerUp={endResizeCard}
                      onPointerCancel={endResizeCard}
                    />
                  </div>
                );
              })}

              {Object.entries(mediaItems).map(([mediaId, media]) => {
                const parsedX = Number(media.x);
                const parsedY = Number(media.y);
                const x = Number.isFinite(parsedX) ? parsedX : 150;
                const y = Number.isFinite(parsedY) ? parsedY : 150;
                const width = Number(media.width) || 500;
                const height = Number(media.height) || 300;

                return (
                  <div
                    key={mediaId}
                    className={`board-media-item ${media.type === "image" ? "is-image" : ""} ${media.isReflectionPoint ? "is-reflection-point" : ""} ${boardTool === "crop" && media.type === "image" ? "is-crop-selectable" : ""}`}
                    style={{
                      left: x,
                      top: y,
                      width,
                      height,
                      zIndex: Number(media.zIndex) || 5
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
                      <>
                        {boardTool === "crop" && !boardIsCompleted && (
                          <button
                            type="button"
                            className="board-media-crop-select-target"
                            aria-label={`${media.fileName || "画像"}をトリミング`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              openImageCrop(mediaId, media);
                            }}
                          >
                            <span>この画像をトリミング</span>
                          </button>
                        )}
                        <img
                          src={media.url}
                          alt={media.fileName || "アップロード画像"}
                          draggable={false}
                          style={media.crop ? {
                            left: `${-100 * Number(media.crop.x) / Number(media.crop.width)}%`,
                            top: `${-100 * Number(media.crop.y) / Number(media.crop.height)}%`,
                            right: "auto",
                            bottom: "auto",
                            width: `${100 * Number(media.crop.naturalWidth) / Number(media.crop.width)}%`,
                            height: `${100 * Number(media.crop.naturalHeight) / Number(media.crop.height)}%`,
                            maxWidth: "none",
                            maxHeight: "none",
                            objectFit: "fill"
                          } : undefined}
                          onLoad={(event) => handleBoardImageLoad(event, mediaId, media)}
                        />
                      </>
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

              <BoardDrawingCanvas
                boardId={boardId}
                currentUserId={currentUserId}
                currentUser={currentUser}
                tool={boardTool === "crop" ? "move" : boardTool}
              />
              <CardConnectionLayer
                cards={cards}
                connections={connections}
                tool={boardTool}
                onCreateConnection={createHandDrawnConnection}
                onDeleteConnection={deleteHandDrawnConnection}
              />
            </div>
          </div>
        </section>

        {sidePanelOpen && (sidePanelMode === "cards" || currentUser?.role === "admin") && (
          <aside className="side-panel tablet-side-panel">
            <div className="side-panel-header">
              <h2>{sidePanelMode === "members" && currentUser?.role === "admin" ? "参加中のユーザー" : "付箋一覧"}</h2>
              <button onClick={() => setSidePanelOpen(false)}>×</button>
            </div>

            {sidePanelMode === "members" && currentUser?.role === "admin" && <MemberPanel members={members} />}
            {sidePanelMode === "cards" && (
              <StickyNoteList
                cards={cards}
                selectedCardId={focusedCardId}
                onSelect={focusCardFromList}
              />
            )}
          </aside>
        )}
      </main>

      {currentUser?.role === "admin" && !viewingArchive && (
        <AdminFeedbackFeature
          boardId={boardId}
          currentUserId={currentUserId}
          currentUser={currentUser}
        />
      )}

      <NextActionDialog
        open={nextActionOpen}
        value={nextActionText}
        saving={nextActionSaving}
        onChange={setNextActionText}
        onClose={() => setNextActionOpen(false)}
        onSave={saveNextAction}
      />

      {imageCropTarget && (
        <ImageCropDialog
          key={imageCropTarget.mediaId}
          src={imageCropTarget.media.url}
          initialCrop={imageCropTarget.media.crop}
          onCancel={() => setImageCropTarget(null)}
          onCrop={saveImageCrop}
        />
      )}

      <ReflectionDialog
        readOnly={boardIsCompleted}
        reflectionReadOnly={false}
        allowDeleteReflection={!boardIsCompleted}
        open={reflectionOpen}
        onClose={closeReflection}
        historyEvents={historyEvents}
        playbackDuration={reflectionPlaybackDuration}
        playbackPosition={reflectionPlaybackPosition}
        onPlaybackPositionChange={setReflectionPlaybackPosition}
        playbackSpeed={reflectionPlaybackSpeed}
        onPlaybackSpeedChange={setReflectionPlaybackSpeed}
        isPlaying={reflectionIsPlaying}
        onPlayingChange={setReflectionIsPlaying}
        playbackTimestamp={reflectionPlaybackTimestamp}
        playbackState={reflectionPlaybackState}
        keypoints={reflectionKeypoints}
        selectedKeypointId={selectedReflectionKeypointId}
        onSelectKeypoint={(event) => {
          const seekPosition =
            event.type === "card_deleted" || event.type === "media_deleted"
              ? Math.max(0, event.positionMs - 1)
              : event.positionMs;
          setReflectionIsPlaying(false);
          setSelectedReflectionKeypointId(event.id);
          setReflectionPlaybackPosition(seekPosition);
        }}
        cardLabelMap={reflectionCardLabelMap}
        getKeypointMeta={getKeypointMeta}
        getDescription={getActivityDescription}
        getCardTypeLabel={getCardTypeLabel}
        formatTime={formatTimeOnly}
        reflectionText={reflectionText}
        onReflectionTextChange={setReflectionText}
        reflectionRecord={reflectionRecord}
        reflectionSubmitting={reflectionSubmitting}
        onSubmitReflection={submitReflection}
        onDeleteReflection={deleteCurrentReflection}
        boardId={boardId}
        currentUserId={currentUserId}
      />

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
                    background: card.color || "#fff176",
                    zIndex: Number(card.zIndex) || 1
                  }}
                >
                  <div className="timelapse-card-meta-row">
                    <div className="owner-name" title={card.ownerName || "名前なし"}>
                      {card.ownerName || "名前なし"}
                    </div>
                    <div className="timelapse-card-type">
                      {getCardTypeLabel(card.type || "idea")} ／ ID:{getShortCardId(id)}
                    </div>
                  </div>
                  <div className="drawing-area drawing-area-full">
                    <PlaybackDrawingCanvas segments={playbackState.drawings[id] || []} />
                  </div>
                </div>
              ))}

              {(playbackState.boardDrawings || []).length > 0 && (
                <div className="timelapse-board-drawing-layer" aria-hidden="true">
                  <PlaybackDrawingCanvas segments={playbackState.boardDrawings} />
                </div>
              )}

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
