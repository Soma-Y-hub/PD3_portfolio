import { useState } from "react";
import TeacherFeedbackPanel from "./TeacherFeedbackPanel";
import "./teacher-feedback.css";

export default function AdminFeedbackFeature({
  boardId,
  currentUserId,
  currentUser
}) {
  const [open, setOpen] = useState(false);

  if (!boardId || currentUser?.role !== "admin") return null;

  return (
    <>
      <button
        type="button"
        className="admin-feedback-launcher"
        onClick={() => setOpen(true)}
      >
        振り返りコメント
      </button>

      {open && (
        <TeacherFeedbackPanel
          boardId={boardId}
          currentUserId={currentUserId}
          currentUser={currentUser}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
