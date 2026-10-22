import { useEffect, useState } from 'react';
import { callSchool } from '../services/schoolService';
export default function ArchivedBoardsPage({ onOpen, onBack, opening }) {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    callSchool('listArchivedBoards').then(result => {
      if (active) setBoards(result.boards || []);
    }).catch(err => {
      if (active) setError(err.message || '過去のボードを取得できませんでした。');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return (
    <div className="archived-boards-page">
      <header className="archive-page-header">
        <div>
          <h1>過去のボード</h1>
          <p>編集したボードを閲覧できます。管理者にはすべての終了済みボードを表示します。</p>
          <p>ボードを開いた後、「タイムラプスを見る」から活動を再生できます。</p>
        </div>
        <button className="archive-back-button" type="button" onClick={onBack} disabled={opening}>
          グループ選択へ戻る
        </button>
      </header>
      <main className="archived-boards-main">
        {loading && <p role="status">読み込み中…</p>}
        {error && <p role="alert" className="school-error">{error}</p>}
        {!loading && !error && boards.length === 0 && <p>閲覧できる過去のボードはありません。</p>}
        <div className="archive-card-list">
          {boards.map(board => (
            <button
              key={board.id}
              type="button"
              className="archive-card"
              disabled={opening}
              onClick={() => onOpen(board.id)}
            >
              <span className="archive-card-main">
                <strong className="archive-card-title">{board.groupName} ／ {board.title}</strong>
                <span className="archive-card-date">
                  {board.endedAt ? new Date(board.endedAt).toLocaleString('ja-JP') : '終了日時の記録なし'}
                </span>
              </span>
              <span className="archive-card-action">
                <span className="archive-read-only">閲覧専用</span>
                <span className="archive-open-label">{opening ? '確認中…' : 'ボードを開く'} <span aria-hidden="true">›</span></span>
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
