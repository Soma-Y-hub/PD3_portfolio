import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";

import { db } from "../../firebase/firebase";

export default function useBoardReflections(boardId, enabled) {
  const [reflections, setReflections] = useState({});

  useEffect(() => {
    if (!boardId || !enabled) {
      setReflections({});
      return undefined;
    }

    return onValue(
      ref(db, `boards/${boardId}/reflections`),
      (snapshot) => {
        setReflections(snapshot.val() || {});
      },
      (error) => {
        console.error("振り返り一覧を取得できませんでした", error);
        setReflections({});
      }
    );
  }, [boardId, enabled]);

  return reflections;
}
