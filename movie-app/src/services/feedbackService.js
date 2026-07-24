import {
  ref,
  update,
  remove,
  serverTimestamp
} from "firebase/database";

import { db } from "../firebase/firebase";

function getFeedbackPath(boardId, userId) {
  if (!boardId || !userId) {
    throw new Error("ボードIDまたはユーザーIDが不足しています。");
  }

  return `boards/${boardId}/reflections/${userId}/teacherFeedback`;
}

export async function saveTeacherFeedback({
  boardId,
  userId,
  teacherId,
  teacherName,
  comment,
  previousFeedback = {}
}) {
  const normalizedComment = String(comment ?? "").trim();

  if (!teacherId || !teacherName) {
    throw new Error("管理者情報が不足しています。");
  }

  if (!normalizedComment) {
    throw new Error("コメントを入力してください。");
  }

  await update(ref(db, getFeedbackPath(boardId, userId)), {
    comment: normalizedComment,
    teacherId,
    teacherName,
    createdAt: previousFeedback.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    isRead: false,
    readAt: null
  });
}

export async function deleteTeacherFeedback({ boardId, userId }) {
  await remove(ref(db, getFeedbackPath(boardId, userId)));
}

export async function markTeacherFeedbackAsRead({ boardId, userId }) {
  await update(ref(db, getFeedbackPath(boardId, userId)), {
    isRead: true,
    readAt: serverTimestamp()
  });
}

export async function deleteReflection({ boardId, userId }) {
  if (!boardId || !userId) {
    throw new Error("ボードIDまたはユーザーIDが不足しています。");
  }

  await remove(ref(db, `boards/${boardId}/reflections/${userId}`));
}
