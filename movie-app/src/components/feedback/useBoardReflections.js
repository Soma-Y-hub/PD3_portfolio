import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "../../firebase/firebase";

export default function useBoardReflections(boardId) {
  const [reflections, setReflections] = useState([]);
  const [loading, setLoading] = useState(Boolean(boardId));

  useEffect(() => {
    if (!boardId) {
      setReflections([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return onValue(
      ref(db, `boards/${boardId}/reflections`),
      (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value)
          .map(([userId, reflection]) => ({ userId, ...(reflection || {}) }))
          .sort((a, b) => Number(b.submittedAtClient || b.submittedAt || 0) - Number(a.submittedAtClient || a.submittedAt || 0));
        setReflections(items);
        setLoading(false);
      },
      (error) => {
        console.error("振り返り一覧を読み込めませんでした", error);
        setReflections([]);
        setLoading(false);
      }
    );
  }, [boardId]);

  return { reflections, loading };
}
