export default function PlaybackMediaLayer({ media = {} }) {
  return Object.entries(media).map(([mediaId, item]) => (
    <div
      key={mediaId}
      className="playback-media-item"
      style={{
        left: Number(item.x) || 0,
        top: Number(item.y) || 0,
        width: Number(item.width) || (item.type === "video" ? 500 : 420),
        height: Number(item.height) || (item.type === "video" ? 320 : 300),
        zIndex: Number(item.zIndex) || 5
      }}
    >
      {item.type === "video" ? (
        <video src={item.url} controls preload="metadata">
          お使いのブラウザでは動画を再生できません。
        </video>
      ) : (
        <img src={item.url} alt={item.fileName || "活動中に追加された画像"} />
      )}
      <span>{item.fileName || "メディア"}</span>
    </div>
  ));
}
