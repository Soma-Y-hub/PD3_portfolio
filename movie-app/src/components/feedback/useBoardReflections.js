import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "../../firebase/firebase";

export default function useBoardReflections(boardId) {
  const [reflectionMap, setReflectionMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!boardId) {
      setReflectionMap({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    return onValue(
      ref(db, `boards/${boardId}/reflections`),
      (snapshot) => {
        setReflectionMap(snapshot.val() || {});
        setLoading(false);
      },
      (error) => {
        console.error("振り返り一覧を取得できませんでした", error);
        setReflectionMap({});
        setLoading(false);
      }
    );
  }, [boardId]);

  const reflections = useMemo(() => {
    return Object.entries(reflectionMap)
      .map(([userId, value]) => ({
        userId,
        ...(value || {})
      }))
      .sort((a, b) => {
        const aTime = Number(a.submittedAtClient || a.submittedAt || 0);
        const bTime = Number(b.submittedAtClient || b.submittedAt || 0);
        return bTime - aTime;
      });
  }, [reflectionMap]);

  return { reflections, loading };
}
