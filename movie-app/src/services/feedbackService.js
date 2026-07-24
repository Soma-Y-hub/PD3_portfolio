import {
  get,
  ref,
  remove,
  serverTimestamp,
  update
} from "firebase/database";
import { db } from "../firebase/firebase";

function requireValue(value, label) {
  if (!value) {
    throw new Error(`${label}が指定されていません。`);
  }
}

export async function saveTeacherFeedback({
  boardId,
  userId,
  teacherId,
  teacherName,
  comment
}) {
  requireValue(boardId, "ボードID");
  requireValue(userId, "生徒ID");
  requireValue(teacherId, "管理者ID");

  const trimmedComment = String(comment ?? "").trim();
  if (!trimmedComment) {
    throw new Error("コメントを入力してください。");
  }

  const feedbackRef = ref(
    db,
    `boards/${boardId}/reflections/${userId}/teacherFeedback`
  );
  const snapshot = await get(feedbackRef);
  const existing = snapshot.val() || {};

  const updates = {
    comment: trimmedComment,
    teacherId,
    teacherName: teacherName || "管理者",
    updatedAt: serverTimestamp(),
    isRead: false,
    readAt: null
  };

  if (!existing.createdAt) {
    updates.createdAt = serverTimestamp();
  }

  await update(feedbackRef, updates);
}

export async function deleteTeacherFeedback({ boardId, userId }) {
  requireValue(boardId, "ボードID");
  requireValue(userId, "生徒ID");

  await remove(
    ref(db, `boards/${boardId}/reflections/${userId}/teacherFeedback`)
  );
}

export async function markTeacherFeedbackAsRead({ boardId, userId }) {
  requireValue(boardId, "ボードID");
  requireValue(userId, "生徒ID");

  await update(
    ref(db, `boards/${boardId}/reflections/${userId}/teacherFeedback`),
    {
      isRead: true,
      readAt: serverTimestamp()
    }
  );
}

export async function deleteReflection({ boardId, userId }) {
  requireValue(boardId, "ボードID");
  requireValue(userId, "生徒ID");

  // teacherFeedbackは振り返りの配下にあるため、同時に削除される。
  await remove(ref(db, `boards/${boardId}/reflections/${userId}`));
}
