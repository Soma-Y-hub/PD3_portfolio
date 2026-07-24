import { useState } from "react";

import TeacherFeedbackPanel from "./TeacherFeedbackPanel";
import useBoardReflections from "./useBoardReflections";
import "./teacher-feedback.css";

export default function AdminFeedbackFeature({
  boardId,
  currentUserId,
  currentUser,
  users,
  formatTimestamp
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const isAdmin = currentUser?.role === "admin";
  const reflections = useBoardReflections(boardId, isAdmin);

  if (!isAdmin || !boardId) return null;

  return (
    <>
      <button
        type="button"
        className="admin-feedback-floating-button"
        onClick={() => setPanelOpen(true)}
      >
        振り返りコメント
        <span>{Object.keys(reflections).length}</span>
      </button>

      <TeacherFeedbackPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        boardId={boardId}
        reflections={reflections}
        users={users}
        currentUserId={currentUserId}
        currentUser={currentUser}
        formatTimestamp={formatTimestamp}
      />
    </>
  );
}
