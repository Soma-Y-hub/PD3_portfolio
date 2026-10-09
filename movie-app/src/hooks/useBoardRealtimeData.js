import { useCallback, useEffect, useState } from "react";
import { get, onValue, ref, serverTimestamp, update } from "firebase/database";
import { db } from "../firebase/firebase";
import { DEFAULT_GROUP_IDS } from "../constants/appConstants";

function sortActivityEvents(snapshot) {
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

/**
 * Firebase Realtime Database の読み取り監視を一か所へ集約する。
 * App.jsx は画面遷移と操作の組み立てに集中できる。
 */
export default function useBoardRealtimeData({ boardId, currentUserId }) {
  const [users, setUsers] = useState({});
  const [groups, setGroups] = useState({});
  const [activitySessions, setActivitySessions] = useState({});
  const [boardMeta, setBoardMeta] = useState(null);
  const [cards, setCards] = useState({});
  const [mediaItems, setMediaItems] = useState({});
  const [members, setMembers] = useState({});
  const [connections, setConnections] = useState({});
  const [activityEvents, setActivityEvents] = useState([]);
  const [reflectionRecord, setReflectionRecord] = useState(null);

  useEffect(() => onValue(ref(db, "users"), (snapshot) => {
    setUsers(snapshot.val() || {});
  }), []);

  useEffect(() => onValue(ref(db, "groups"), (snapshot) => {
    setGroups(snapshot.val() || {});
  }), []);

  useEffect(() => {
    let cancelled = false;

    const ensureDefaultGroups = async () => {
      try {
        const snapshot = await get(ref(db, "groups"));
        if (cancelled) return;

        const currentGroups = snapshot.val() || {};
        const updates = {};

        DEFAULT_GROUP_IDS.forEach((id, index) => {
          if (!currentGroups[id]) {
            updates[`groups/${id}`] = {
              name: id,
              order: index + 1,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              boardControl: { boardCount: 0 }
            };
            return;
          }

          if (!currentGroups[id].name) updates[`groups/${id}/name`] = id;
          if (!currentGroups[id].order) updates[`groups/${id}/order`] = index + 1;
        });

        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
        }
      } catch (error) {
        console.error("G1〜G10を準備できませんでした", error);
      }
    };

    ensureDefaultGroups();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!boardId) return undefined;

    return onValue(ref(db, `boards/${boardId}/meta`), (snapshot) => {
      setBoardMeta(snapshot.val() || null);
    });
  }, [boardId]);

  useEffect(() => {
    if (!boardId) return undefined;

    const unsubscribers = [
      onValue(ref(db, `boards/${boardId}/cards`), (snapshot) => {
        setCards(snapshot.val() || {});
      }),
      onValue(ref(db, `boards/${boardId}/members`), (snapshot) => {
        setMembers(snapshot.val() || {});
      }),
      onValue(ref(db, `boards/${boardId}/connections`), (snapshot) => {
        setConnections(snapshot.val() || {});
      }),
      onValue(ref(db, `boards/${boardId}/media`), (snapshot) => {
        setMediaItems(snapshot.val() || {});
      }),
      onValue(ref(db, `boards/${boardId}/activitySessions`), (snapshot) => {
        setActivitySessions(snapshot.val() || {});
      }),
      onValue(ref(db, `boards/${boardId}/activityEvents`), (snapshot) => {
        setActivityEvents(sortActivityEvents(snapshot));
      })
    ];

    if (currentUserId) {
      unsubscribers.push(
        onValue(
          ref(db, `boards/${boardId}/reflections/${currentUserId}`),
          (snapshot) => setReflectionRecord(snapshot.val() || null)
        )
      );
    }

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [boardId, currentUserId]);

  const resetBoardData = useCallback(() => {
    setActivitySessions({});
    setBoardMeta(null);
    setCards({});
    setMediaItems({});
    setMembers({});
    setConnections({});
    setActivityEvents([]);
    setReflectionRecord(null);
  }, []);

  return {
    users,
    groups,
    activitySessions,
    setActivitySessions,
    boardMeta,
    cards,
    setCards,
    mediaItems,
    setMediaItems,
    members,
    connections,
    setConnections,
    activityEvents,
    reflectionRecord,
    setReflectionRecord,
    resetBoardData
  };
}
