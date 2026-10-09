import { useRef, useState } from "react";
import { get, ref, remove, serverTimestamp, update } from "firebase/database";
import { db } from "../firebase/firebase";
import { REFLECTION_PROMPT } from "../constants/appConstants";

function sortHistory(snapshot) {
  const events = [];
  snapshot.forEach((child) => {
    const value = child.val();
    if (value && typeof value.timestamp === "number") {
      events.push({ id: child.key, ...value });
    }
  });
  events.sort((a, b) => {
    const diff = (a.timestamp || 0) - (b.timestamp || 0);
    return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
  });
  return events;
}

export default function useReflectionController({
  boardId,
  currentUserId,
  currentUser,
  reflectionRecord,
  setReflectionRecord,
  cards,
  connections,
  activityEvents,
  reflectionActivityEvents,
  setReflectionActivityEvents,
  setHistoryEvents,
  setActivitySessions,
  setReflectionPlaybackPosition,
  setReflectionIsPlaying,
  setSelectedReflectionKeypointId
}) {
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionText, setReflectionText] = useState("");
  const [reflectionSubmitting, setReflectionSubmitting] = useState(false);
  const [nextActionOpen, setNextActionOpen] = useState(false);
  const [nextActionText, setNextActionText] = useState("");
  const [nextActionSaving, setNextActionSaving] = useState(false);

  const reflectionStartedAtRef = useRef(null);
  const reflectionAccumulatedDurationRef = useRef(0);


  const openNextAction = () => {
    setNextActionText(reflectionRecord?.nextAction || "");
    setNextActionOpen(true);
  };

  const saveNextAction = async () => {
    const nextAction = nextActionText.trim();
    if (!nextAction) {
      alert("次回することを入力してください");
      return;
    }
    if (!boardId || !currentUserId || !currentUser) return;

    setNextActionSaving(true);
    try {
      await update(ref(db, `boards/${boardId}/reflections/${currentUserId}`), {
        userId: currentUserId,
        userName: currentUser.name,
        nextAction,
        nextActionUpdatedAt: serverTimestamp()
      });
      setNextActionOpen(false);
      alert("次回することを保存しました");
    } catch (error) {
      console.error("次回することを保存できませんでした", error);
      alert("次回することを保存できませんでした");
    } finally {
      setNextActionSaving(false);
    }
  };

  const openReflection = async () => {
    if (!boardId || !currentUserId || !currentUser) return;

    reflectionStartedAtRef.current = Date.now();
    setReflectionText((currentText) => currentText || reflectionRecord?.responseText || "");
    setReflectionIsPlaying(false);
    setSelectedReflectionKeypointId(null);
    setReflectionPlaybackPosition(0);
    setReflectionActivityEvents([...activityEvents]);

    try {
      const [historySnapshot, sessionsSnapshot] = await Promise.all([
        get(ref(db, `boards/${boardId}/history`)),
        get(ref(db, `boards/${boardId}/activitySessions`))
      ]);
      setHistoryEvents(sortHistory(historySnapshot));
      setActivitySessions(sessionsSnapshot.val() || {});
    } catch (error) {
      console.error("振り返り用タイムラプス履歴を取得できませんでした", error);
    }

    setReflectionOpen(true);

    try {
      const usageRef = ref(db, `boards/${boardId}/researchUsage/${currentUserId}`);
      const usageSnapshot = await get(usageRef);
      const usage = usageSnapshot.val() || {};
      await update(usageRef, {
        userId: currentUserId,
        userName: currentUser.name,
        reflectionOpenCount: (Number(usage.reflectionOpenCount) || 0) + 1,
        lastOpenedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("振り返り利用回数を記録できませんでした", error);
    }
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
      const currentSessionDuration = reflectionStartedAtRef.current === null
        ? 0
        : Math.max(0, submittedAtClient - reflectionStartedAtRef.current);
      const durationMs = reflectionAccumulatedDurationRef.current + currentSessionDuration;
      const startedAtClient = submittedAtClient - durationMs;

      await update(ref(db, `boards/${boardId}/reflections/${currentUserId}`), {
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
      });

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
      await remove(ref(db, `boards/${boardId}/reflections/${currentUserId}`));
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
    const rows = [[
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
    ]];

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

    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${boardId}_reflections.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetReflection = () => {
    setReflectionOpen(false);
    setReflectionText("");
    setReflectionSubmitting(false);
    setNextActionOpen(false);
    setNextActionText("");
    setNextActionSaving(false);
    reflectionStartedAtRef.current = null;
    reflectionAccumulatedDurationRef.current = 0;
  };

  return {
    reflectionOpen,
    reflectionText,
    setReflectionText,
    reflectionSubmitting,
    nextActionOpen,
    setNextActionOpen,
    nextActionText,
    setNextActionText,
    nextActionSaving,
    openNextAction,
    saveNextAction,
    openReflection,
    closeReflection,
    submitReflection,
    deleteCurrentReflection,
    exportReflectionCsv,
    resetReflection
  };
}
