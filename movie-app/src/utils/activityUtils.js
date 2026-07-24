import { CARD_TYPE_LABELS } from "../constants/appConstants";

export const getCardTypeLabel = (type) => {
  return CARD_TYPE_LABELS[type] || "付箋";
};

const formatTimeOnly = (timestamp) => {
  if (typeof timestamp !== "number") return "--:--:--";
  return timeOnlyFormatter.format(new Date(timestamp));
};

const formatDuration = (durationMs) => {
  const value = Math.max(0, Number(durationMs) || 0);
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}秒`;
  return `${minutes}分${seconds}秒`;
};

export const getShortCardId = (cardId) => {
  if (!cardId) return "不明";
  return String(cardId).slice(-5);
};

export const getCardFromEvent = (event) => {
  const payload = event?.payload || {};
  return payload.card || payload.beforeCard || payload.afterCard || {};
};

export const getEventCardId = (event) => {
  const card = getCardFromEvent(event);
  return card.id || event?.cardId || "";
};

const getMediaFromEvent = (event) => event?.payload?.media || {};
const getMediaName = (event) => {
  const media = getMediaFromEvent(event);
  return media.fileName || event?.payload?.fileName || "写真・動画";
};
const getMediaTypeLabel = (event) => {
  const type = getMediaFromEvent(event).type || event?.payload?.mediaType;
  return type === "video" ? "動画" : "写真";
};

export const createCardLabelMap = (events = []) => {
  const map = {};
  let count = 1;

  events
    .filter((event) => event && getEventCardId(event))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .forEach((event) => {
      const id = getEventCardId(event);
      if (!map[id]) {
        map[id] = `付箋${count}`;
        count += 1;
      }
    });

  return map;
};

export const getCardDisplayName = (event, cardLabelMap = {}) => {
  const card = getCardFromEvent(event);
  const ownerName = card.ownerName || event?.userName || "参加者";
  const type = getCardTypeLabel(
    card.type || event?.payload?.cardType || event?.payload?.afterType || event?.payload?.beforeType
  );
  const id = getEventCardId(event);
  const cardLabel = cardLabelMap[id] || "この付箋";
  return `${cardLabel}：${ownerName}さんの${type}付箋`;
};

export const getCardTechnicalText = (event) => {
  const card = getCardFromEvent(event);
  const id = getEventCardId(event);
  return `内部ID：${getShortCardId(id)} ／ 分類：${getCardTypeLabel(card.type)} ／ サイズ：${getSizeText(card.width, card.height)}`;
};

export const getSizeText = (width, height) => {
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (!w || !h) return "サイズ不明";
  return `${w}×${h}`;
};

export const getResizeMeaningText = (payload = {}) => {
  const beforeWidth = Number(payload.beforeWidth) || 0;
  const beforeHeight = Number(payload.beforeHeight) || 0;
  const afterWidth = Number(payload.afterWidth) || 0;
  const afterHeight = Number(payload.afterHeight) || 0;
  const diffWidth = afterWidth - beforeWidth;
  const diffHeight = afterHeight - beforeHeight;

  if (Math.abs(diffWidth) < 2 && Math.abs(diffHeight) < 2) {
    return "大きさの変化は小さいです";
  }

  const widthText = diffWidth > 1 ? "横に広げた" : diffWidth < -1 ? "横幅を縮めた" : "横幅はほぼ同じ";
  const heightText = diffHeight > 1 ? "縦に広げた" : diffHeight < -1 ? "高さを縮めた" : "高さはほぼ同じ";

  return `${widthText}／${heightText}`;
};

export const getActivityChangeDetail = (event) => {
  const payload = event.payload || {};

  switch (event.type) {
    case "card_created": {
      const card = getCardFromEvent(event);
      return `${getCardTypeLabel(card.type)}として新しく出された付箋です。`;
    }
    case "card_deleted": {
      const card = getCardFromEvent(event);
      return `${getCardTypeLabel(card.type)}として使われていた付箋が、活動中に削除されました。`;
    }
    case "card_type_changed":
      return `${getCardTypeLabel(payload.beforeType)}として置かれていた付箋を、${getCardTypeLabel(payload.afterType)}として見直しました。`;
    case "card_resized":
      return `表示の変化：${getResizeMeaningText(payload)}。`;
    case "media_created":
      return `${getMediaTypeLabel(event)}「${getMediaName(event)}」が活動の記録として追加されました。`;
    case "media_moved":
      return `${getMediaTypeLabel(event)}の位置が変更されました。`;
    case "media_resized":
      return `${getMediaTypeLabel(event)}の表示サイズが変更されました。`;
    case "media_deleted":
      return `${getMediaTypeLabel(event)}「${getMediaName(event)}」が削除されました。`;
    case "media_marked_as_reflection_point":
      return payload.reason ? `振り返りの理由：${payload.reason}` : "振り返りのポイントとして選ばれました。";
    case "media_unmarked_as_reflection_point":
      return "振り返りポイントの指定が解除されました。";
    default:
      return "活動中に変化がありました。";
  }
};

export const getActivityTechnicalDetail = (event) => {
  const payload = event.payload || {};

  switch (event.type) {
    case "card_created":
    case "card_deleted":
      return getCardTechnicalText(event);
    case "card_type_changed":
      return `内部ID：${getShortCardId(getEventCardId(event))} ／ ${getCardTypeLabel(payload.beforeType)} → ${getCardTypeLabel(payload.afterType)}`;
    case "card_resized":
      return `内部ID：${getShortCardId(getEventCardId(event))} ／ ${getSizeText(payload.beforeWidth, payload.beforeHeight)} → ${getSizeText(payload.afterWidth, payload.afterHeight)}`;
    case "media_created":
    case "media_deleted":
    case "media_marked_as_reflection_point":
    case "media_unmarked_as_reflection_point":
      return `${getMediaTypeLabel(event)} ／ ファイル名：${getMediaName(event)}`;
    case "media_moved":
      return `位置：(${Math.round(Number(payload.beforeX)||0)}, ${Math.round(Number(payload.beforeY)||0)}) → (${Math.round(Number(payload.afterX)||0)}, ${Math.round(Number(payload.afterY)||0)})`;
    case "media_resized":
      return `サイズ：${getSizeText(payload.beforeWidth, payload.beforeHeight)} → ${getSizeText(payload.afterWidth, payload.afterHeight)}`;
    default:
      return "詳細情報はありません";
  }
};

export const getActivityDescription = (event, cardLabelMap = {}) => {
  switch (event.type) {
    case "card_created":
      return `${getCardDisplayName(event, cardLabelMap)}を追加`;
    case "card_deleted":
      return `${getCardDisplayName(event, cardLabelMap)}を削除`;
    case "card_resized":
      return `${getCardDisplayName(event, cardLabelMap)}の表示サイズを変更`;
    case "card_type_changed":
      return `${getCardDisplayName(event, cardLabelMap)}の分類を変更`;
    case "media_created":
      return `${getMediaTypeLabel(event)}「${getMediaName(event)}」を追加`;
    case "media_moved":
      return `${getMediaTypeLabel(event)}「${getMediaName(event)}」を移動`;
    case "media_resized":
      return `${getMediaTypeLabel(event)}「${getMediaName(event)}」の大きさを変更`;
    case "media_deleted":
      return `${getMediaTypeLabel(event)}「${getMediaName(event)}」を削除`;
    case "media_marked_as_reflection_point":
      return `${getMediaTypeLabel(event)}「${getMediaName(event)}」を振り返りポイントに指定`;
    case "media_unmarked_as_reflection_point":
      return `${getMediaTypeLabel(event)}「${getMediaName(event)}」の振り返り指定を解除`;
    default:
      return "活動を編集";
  }
};

export const getKeypointMeta = (event) => {
  switch (event.type) {
    case "card_created":
      return {
        icon: "＋",
        label: "考えが出た場面",
        shortLabel: "発生",
        factLabel: "付箋が追加されました",
        hint: "この場面を、活動の中でどのような考えや話し合いが生まれたかを思い出す目印にできます。",
        className: "created"
      };
    case "card_deleted":
      return {
        icon: "−",
        label: "考えを整理した可能性がある場面",
        shortLabel: "整理",
        factLabel: "付箋が削除されました",
        hint: "この場面を、活動の中で考えをまとめたり、取りやめたり、別の考えに統合した流れを思い出す目印にできます。",
        className: "deleted"
      };
    case "card_type_changed":
      return {
        icon: "↔",
        label: "考えの分類が変わった場面",
        shortLabel: "分類",
        factLabel: "付箋の種類が変更されました",
        hint: "この場面を、活動の中で考えの位置づけや見方が変わった流れを思い出す目印にできます。",
        className: "type-changed"
      };
    case "card_resized":
      return {
        icon: "↘",
        label: "特定の考えに注目した可能性がある場面",
        shortLabel: "注目",
        factLabel: "付箋の大きさが変更されました",
        hint: "この場面を、活動の中でどの考えに注目したか、または見やすく整理した流れを思い出す目印にできます。",
        className: "resized"
      };
    case "media_created":
      return { icon: "📷", label: "写真・動画が記録された場面", shortLabel: "記録", factLabel: "写真・動画が追加されました", hint: "活動の状況や成果を思い出す目印にできます。", className: "media-created" };
    case "media_moved":
    case "media_resized":
      return { icon: "🖼", label: "写真・動画を整理した場面", shortLabel: "整理", factLabel: "写真・動画の配置が変更されました", hint: "資料の位置づけや注目点が変わった場面として振り返れます。", className: "media-edited" };
    case "media_deleted":
      return { icon: "🗑", label: "写真・動画を整理した場面", shortLabel: "削除", factLabel: "写真・動画が削除されました", hint: "不要になった理由や方針変更を思い出す目印にできます。", className: "media-deleted" };
    case "media_marked_as_reflection_point":
      return { icon: "★", label: "学習者が選んだ振り返りポイント", shortLabel: "重要", factLabel: "写真・動画が振り返りポイントに指定されました", hint: event?.payload?.reason || "この写真・動画が重要だった理由を振り返れます。", className: "media-reflection" };
    case "media_unmarked_as_reflection_point":
      return { icon: "☆", label: "振り返り指定を解除した場面", shortLabel: "解除", factLabel: "振り返りポイントが解除されました", hint: "選び直した理由を振り返る目印にできます。", className: "media-unmarked" };
    default:
      return {
        icon: "•",
        label: "活動の変化があった場面",
        shortLabel: "活動",
        factLabel: "活動が記録されました",
        hint: "この場面を、活動全体を思い出すための目印にできます。",
        className: "other"
      };
  }
};

