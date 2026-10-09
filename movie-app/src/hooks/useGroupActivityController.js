import { useEffect, useRef, useState } from "react";
import {
  get,
  onDisconnect,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  update
} from "firebase/database";
import { db } from "../firebase/firebase";

/**
 * グループ選択、オンライン状態、活動提出、教師の最終終了を管理する。
 */
export default function useGroupActivityController({
  boardId,
  setBoardId,
  groupId,
  setGroupId,
  groupName,
  setGroupName,
  boardMeta,
  boardStatus,
  currentBoardNumber,
  currentUserId,
  currentUser,
  setBoardTool,
  onResetBoard
}) {
  const [groupOpening, setGroupOpening] = useState(false);
  const [endingActivity, setEndingActivity] = useState(false);
  const [submittingActivity, setSubmittingActivity] = useState(false);

  const presenceContextRef = useRef(null);
  const presenceSessionRef = useRef(null);
  const presenceTransitionRef = useRef(Promise.resolve());

  const enqueuePresenceTransition = (operation) => {
    const next = presenceTransitionRef.current
      .catch(() => undefined)
      .then(operation);
    presenceTransitionRef.current = next;
    return next;
  };

  const startOnlineSession = () => enqueuePresenceTransition(async () => {
    const context = presenceContextRef.current;
    if (!context || document.hidden || presenceSessionRef.current) return;

    const sessionRef = push(ref(db, `boards/${context.boardId}/activitySessions`));
    if (!sessionRef.key) return;

    const session = {
      sessionId: sessionRef.key,
      boardId: context.boardId,
      groupId: context.groupId
    };
    presenceSessionRef.current = session;

    await onDisconnect(sessionRef).update({
      status: "ended",
      endedAt: serverTimestamp(),
      lastActive: serverTimestamp()
    });

    await update(ref(db), {
      [`boards/${context.boardId}/activitySessions/${session.sessionId}`]: {
        userId: currentUserId,
        userName: currentUser?.name || "",
        role: currentUser?.role || "student",
        status: "online",
        startedAt: serverTimestamp(),
        lastActive: serverTimestamp()
      },
      [`boards/${context.boardId}/members/${currentUserId}/status`]: "online",
      [`boards/${context.boardId}/members/${currentUserId}/lastActive`]: serverTimestamp(),
      [`groups/${context.groupId}/presence/${currentUserId}/status`]: "online",
      [`groups/${context.groupId}/presence/${currentUserId}/lastActive`]: serverTimestamp()
    });
  });

  const stopOnlineSession = (nextStatus = "away", clearContext = false) =>
    enqueuePresenceTransition(async () => {
      const context = presenceContextRef.current;
      if (!context) return;

      const session = presenceSessionRef.current;
      presenceSessionRef.current = null;

      const updates = {
        [`boards/${context.boardId}/members/${currentUserId}/status`]: nextStatus,
        [`boards/${context.boardId}/members/${currentUserId}/lastActive`]: serverTimestamp(),
        [`groups/${context.groupId}/presence/${currentUserId}/status`]: nextStatus,
        [`groups/${context.groupId}/presence/${currentUserId}/lastActive`]: serverTimestamp()
      };

      if (session) {
        updates[`boards/${context.boardId}/activitySessions/${session.sessionId}/status`] = "ended";
        updates[`boards/${context.boardId}/activitySessions/${session.sessionId}/endedAt`] = serverTimestamp();
        updates[`boards/${context.boardId}/activitySessions/${session.sessionId}/lastActive`] = serverTimestamp();
        await onDisconnect(
          ref(db, `boards/${context.boardId}/activitySessions/${session.sessionId}`)
        ).cancel().catch(() => undefined);
      }

      await update(ref(db), updates);

      if (clearContext) {
        await Promise.all([
          onDisconnect(ref(db, `boards/${context.boardId}/members/${currentUserId}`))
            .cancel().catch(() => undefined),
          onDisconnect(ref(db, `groups/${context.groupId}/presence/${currentUserId}`))
            .cancel().catch(() => undefined)
        ]);
        presenceContextRef.current = null;
      }
    });

  const configurePresence = async ({
    selectedBoardId,
    selectedGroupId,
    selectedGroupName
  }) => {
    if (presenceContextRef.current) {
      await stopOnlineSession("offline", true);
    }

    const context = {
      boardId: selectedBoardId,
      groupId: selectedGroupId,
      groupName: selectedGroupName
    };
    presenceContextRef.current = context;

    const memberRef = ref(db, `boards/${selectedBoardId}/members/${currentUserId}`);
    const groupPresenceRef = ref(db, `groups/${selectedGroupId}/presence/${currentUserId}`);

    await Promise.all([
      onDisconnect(memberRef).update({
        status: "offline",
        lastActive: serverTimestamp()
      }),
      onDisconnect(groupPresenceRef).update({
        status: "offline",
        lastActive: serverTimestamp()
      })
    ]);

    const initialStatus = document.hidden ? "away" : "online";
    await update(ref(db), {
      [`boards/${selectedBoardId}/members/${currentUserId}`]: {
        name: currentUser.name,
        role: currentUser.role,
        color: currentUser.color || "#fff176",
        status: initialStatus,
        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp()
      },
      [`groups/${selectedGroupId}/presence/${currentUserId}`]: {
        name: currentUser.name,
        role: currentUser.role,
        boardId: selectedBoardId,
        status: initialStatus,
        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp()
      }
    });

    if (!document.hidden) await startOnlineSession();
  };

  const enterSelectedBoard = async ({
    selectedBoardId,
    selectedGroupId,
    selectedGroupName
  }) => {
    if (!selectedBoardId || !currentUserId || !currentUser) return;

    await configurePresence({ selectedBoardId, selectedGroupId, selectedGroupName });
    setGroupId(selectedGroupId);
    setGroupName(selectedGroupName);
    setBoardId(selectedBoardId);
  };

  useEffect(() => {
    if (!boardId || !groupId || !currentUserId || !currentUser) return undefined;

    const heartbeat = async () => {
      const context = presenceContextRef.current;
      if (!context || context.boardId !== boardId) return;

      if (document.hidden) {
        await stopOnlineSession("away");
        return;
      }

      await startOnlineSession();
      const session = presenceSessionRef.current;
      const updates = {
        [`boards/${boardId}/members/${currentUserId}/status`]: "online",
        [`boards/${boardId}/members/${currentUserId}/lastActive`]: serverTimestamp(),
        [`groups/${groupId}/presence/${currentUserId}/status`]: "online",
        [`groups/${groupId}/presence/${currentUserId}/lastActive`]: serverTimestamp()
      };

      if (session) {
        updates[`boards/${boardId}/activitySessions/${session.sessionId}/lastActive`] = serverTimestamp();
      }

      await update(ref(db), updates).catch((error) => {
        console.error("参加状態を更新できませんでした", error);
      });
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    const handleVisibilityChange = () => heartbeat();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [boardId, groupId, currentUserId, currentUser]);

  const selectGroup = async (selectedGroupId, selectedGroup) => {
    if (!selectedGroupId || !currentUserId || !currentUser) return;
    setGroupOpening(true);

    try {
      const selectedGroupName = selectedGroup?.name || selectedGroupId;
      const candidateBoardId = push(ref(db, "boards")).key;
      if (!candidateBoardId) throw new Error("新しいボードIDを作成できませんでした");

      const controlRef = ref(db, `groups/${selectedGroupId}/boardControl`);
      const transactionResult = await runTransaction(controlRef, (currentValue) => {
        const control = currentValue || {};
        if (control.currentBoardId) return control;

        if (control.nextBoardId) {
          return {
            ...control,
            currentBoardId: control.nextBoardId,
            currentBoardNumber:
              Number(control.nextBoardNumber) || Number(control.boardCount) || 1,
            nextBoardId: null,
            nextBoardNumber: null,
            currentStatus: "active",
            lastActivatedAtClient: Date.now()
          };
        }

        const nextNumber = Math.max(1, (Number(control.boardCount) || 0) + 1);
        return {
          ...control,
          currentBoardId: candidateBoardId,
          currentBoardNumber: nextNumber,
          boardCount: nextNumber,
          currentStatus: "active",
          lastActivatedAtClient: Date.now()
        };
      });

      if (!transactionResult.committed) {
        throw new Error("活動ボードを確定できませんでした");
      }

      const control = transactionResult.snapshot.val() || {};
      const activeBoardId = control.currentBoardId;
      const activeBoardNumber =
        Number(control.currentBoardNumber) || Number(control.boardCount) || 1;
      if (!activeBoardId) throw new Error("開く活動ボードが見つかりませんでした");

      const metaRef = ref(db, `boards/${activeBoardId}/meta`);
      const metaSnapshot = await get(metaRef);

      if (!metaSnapshot.exists()) {
        await update(ref(db), {
          [`groups/${selectedGroupId}/name`]: selectedGroupName,
          [`groups/${selectedGroupId}/updatedAt`]: serverTimestamp(),
          [`groups/${selectedGroupId}/boardControl/currentStatus`]: "active",
          [`boards/${activeBoardId}/meta`]: {
            groupId: selectedGroupId,
            groupName: selectedGroupName,
            number: activeBoardNumber,
            title: `第${activeBoardNumber}回の活動`,
            status: "active",
            previousBoardId: control.lastCompletedBoardId || null,
            createdAt: serverTimestamp(),
            startedAt: serverTimestamp()
          }
        });
      } else {
        const meta = metaSnapshot.val() || {};
        if (meta.status === "completed") {
          throw new Error("終了済みボードが活動中として設定されています。管理者に確認してください");
        }

        const existingStatus = meta.status === "draft" ? "active" : (meta.status || "active");
        await update(ref(db), {
          [`boards/${activeBoardId}/meta/groupId`]: selectedGroupId,
          [`boards/${activeBoardId}/meta/groupName`]: selectedGroupName,
          [`boards/${activeBoardId}/meta/number`]: Number(meta.number) || activeBoardNumber,
          [`boards/${activeBoardId}/meta/status`]: existingStatus,
          [`boards/${activeBoardId}/meta/startedAt`]: meta.startedAt || serverTimestamp(),
          [`groups/${selectedGroupId}/boardControl/currentStatus`]: existingStatus
        });
      }

      await enterSelectedBoard({
        selectedBoardId: activeBoardId,
        selectedGroupId,
        selectedGroupName
      });
    } catch (error) {
      if (presenceContextRef.current?.groupId === selectedGroupId) {
        await stopOnlineSession("offline", true).catch(() => undefined);
      }
      console.error("グループを開けませんでした", error);
      alert(error instanceof Error ? error.message : "グループを開けませんでした");
    } finally {
      setGroupOpening(false);
    }
  };

  const leaveBoard = async () => {
    if (presenceContextRef.current) {
      await stopOnlineSession("offline", true);
    }
    onResetBoard();
  };

  const submitCurrentActivity = async () => {
    if (currentUser?.role === "admin" || !groupId || !boardId || boardStatus !== "active") {
      return;
    }

    const confirmed = window.confirm(
      "活動を終了して先生に提出しますか？\n提出後は、先生の最終確認が終わるまでボードを編集できません。"
    );
    if (!confirmed) return;

    setSubmittingActivity(true);
    try {
      const metaRef = ref(db, `boards/${boardId}/meta`);
      const transactionResult = await runTransaction(metaRef, (currentMeta) => {
        if (!currentMeta || currentMeta.status !== "active") return;
        return {
          ...currentMeta,
          status: "submitted",
          submittedBy: currentUserId,
          submittedByName: currentUser.name,
          submittedAtClient: Date.now(),
          activityClosedAtClient: Date.now()
        };
      });

      if (!transactionResult.committed) {
        throw new Error("この活動はすでに提出されている可能性があります");
      }

      await update(ref(db), {
        [`boards/${boardId}/meta/status`]: "submitted",
        [`boards/${boardId}/meta/submittedBy`]: currentUserId,
        [`boards/${boardId}/meta/submittedByName`]: currentUser.name,
        [`boards/${boardId}/meta/submittedAt`]: serverTimestamp(),
        [`boards/${boardId}/meta/activityClosedAt`]: serverTimestamp(),
        [`groups/${groupId}/boardControl/currentStatus`]: "submitted",
        [`groups/${groupId}/updatedAt`]: serverTimestamp()
      });

      setBoardTool("move");
      alert("先生に提出しました。最終確認が終わるまで閲覧専用になります。");
    } catch (error) {
      console.error("活動を提出できませんでした", error);
      alert(error instanceof Error ? error.message : "活動を提出できませんでした");
    } finally {
      setSubmittingActivity(false);
    }
  };

  const endCurrentActivity = async () => {
    if (currentUser?.role !== "admin" || !groupId || !boardId || boardStatus !== "submitted") {
      return;
    }

    const confirmed = window.confirm(
      "生徒が提出した内容を最終確認し、この活動を終了しますか？\n次回用の空のボードが自動生成されます。"
    );
    if (!confirmed) return;

    setEndingActivity(true);
    try {
      const reflectionSnapshot = await get(ref(db, `boards/${boardId}/reflections`));
      const previousNextActions = {};
      reflectionSnapshot.forEach((child) => {
        const value = child.val() || {};
        const nextAction = String(value.nextAction || "").trim();
        if (nextAction) previousNextActions[child.key] = nextAction;
      });

      const candidateNextBoardId = push(ref(db, "boards")).key;
      if (!candidateNextBoardId) throw new Error("次回用ボードを生成できませんでした");

      const controlRef = ref(db, `groups/${groupId}/boardControl`);
      const transactionResult = await runTransaction(controlRef, (currentValue) => {
        const control = currentValue || {};
        if (control.currentBoardId !== boardId && control.lastCompletedBoardId !== boardId) {
          return;
        }

        if (control.nextBoardId) {
          return {
            ...control,
            currentBoardId: null,
            currentBoardNumber: null,
            currentStatus: "draft",
            lastCompletedBoardId: boardId,
            lastCompletedAtClient: Date.now()
          };
        }

        const currentNumber = Math.max(
          Number(control.currentBoardNumber) || 0,
          Number(boardMeta?.number) || 0,
          Number(control.boardCount) || 0,
          1
        );
        const nextNumber = currentNumber + 1;

        return {
          ...control,
          currentBoardId: null,
          currentBoardNumber: null,
          currentStatus: "draft",
          nextBoardId: candidateNextBoardId,
          nextBoardNumber: nextNumber,
          boardCount: Math.max(Number(control.boardCount) || 0, nextNumber),
          lastCompletedBoardId: boardId,
          lastCompletedAtClient: Date.now()
        };
      });

      if (!transactionResult.committed) {
        throw new Error("この活動はすでに終了しているか、現在のボードではありません");
      }

      const control = transactionResult.snapshot.val() || {};
      const nextBoardId = control.nextBoardId;
      const nextBoardNumber =
        Number(control.nextBoardNumber) || Number(control.boardCount) || currentBoardNumber + 1;
      if (!nextBoardId) throw new Error("次回用ボードを確認できませんでした");

      const nextMetaRef = ref(db, `boards/${nextBoardId}/meta`);
      const nextMetaSnapshot = await get(nextMetaRef);
      const rootUpdates = {
        [`boards/${boardId}/meta/status`]: "completed",
        [`boards/${boardId}/meta/endedAt`]: serverTimestamp(),
        [`boards/${boardId}/meta/finalizedBy`]: currentUserId,
        [`boards/${boardId}/meta/finalizedByName`]: currentUser.name,
        [`groups/${groupId}/boardControl/currentStatus`]: "draft",
        [`groups/${groupId}/updatedAt`]: serverTimestamp()
      };

      if (!nextMetaSnapshot.exists()) {
        rootUpdates[`boards/${nextBoardId}/meta`] = {
          groupId,
          groupName,
          number: nextBoardNumber,
          title: `第${nextBoardNumber}回の活動`,
          status: "draft",
          previousBoardId: boardId,
          previousNextActions,
          createdAt: serverTimestamp()
        };
      }

      await update(ref(db), rootUpdates);
      setBoardTool("move");
      alert(
        `第${currentBoardNumber}回の活動を終了しました。\n第${nextBoardNumber}回のボードを準備しました。`
      );
    } catch (error) {
      console.error("活動を終了できませんでした", error);
      alert(error instanceof Error ? error.message : "活動を終了できませんでした");
    } finally {
      setEndingActivity(false);
    }
  };

  return {
    groupOpening,
    endingActivity,
    submittingActivity,
    selectGroup,
    leaveBoard,
    stopOnlineSession,
    submitCurrentActivity,
    endCurrentActivity
  };
}
