// src/utils/activityUtils.js
// 付箋・写真・動画の活動イベント表示に対応した統合版

export function getCardTypeLabel(type) {
  const labels = {
    idea: "アイデア",
    fact: "事実",
    question: "疑問",
    task: "課題",
    conclusion: "まとめ"
  };
  return labels[type] || "付箋";
}

export function getShortCardId(id) {
  if (!id) return "";
  return String(id).slice(-6);
}

function getPayload(event) {
  return event?.payload || {};
}

function getMedia(event) {
  const payload = getPayload(event);
  return payload.media || {};
}

function getMediaType(event) {
  const payload = getPayload(event);
  const media = getMedia(event);
  return payload.mediaType || media.type || "image";
}

function getMediaTypeLabel(event) {
  return getMediaType(event) === "video" ? "動画" : "写真";
}

function getMediaFileName(event) {
  const payload = getPayload(event);
  const media = getMedia(event);
  return payload.fileName || media.fileName || getMediaTypeLabel(event);
}

export function getCardDisplayName(event, cardLabelMap = {}) {
  const payload = getPayload(event);
  const cardId = event?.cardId || payload.cardId || payload.card?.id;

  if (cardId && cardLabelMap[cardId]) return cardLabelMap[cardId];

  const card = payload.card || {};
  const ownerName =
    card.ownerName ||
    event?.cardOwnerName ||
    payload.cardOwnerName ||
    event?.userName ||
    "参加者";

  const type = card.type || payload.cardType || event?.cardType || "idea";
  const shortId = getShortCardId(cardId);

  return `${ownerName}さんの${getCardTypeLabel(type)}${shortId ? `（${shortId}）` : ""}`;
}

export function createCardLabelMap(events = []) {
  const result = {};

  events.forEach((event) => {
    const payload = getPayload(event);
    const card = payload.card || {};
    const cardId = event.cardId || payload.cardId || card.id;

    if (!cardId) return;

    const ownerName =
      card.ownerName ||
      event.cardOwnerName ||
      payload.cardOwnerName ||
      event.userName ||
      "参加者";

    const type = card.type || payload.cardType || event.cardType || "idea";
    result[cardId] =
      `${ownerName}さんの${getCardTypeLabel(type)}（${getShortCardId(cardId)}）`;
  });

  return result;
}

export function getKeypointMeta(event) {
  switch (event?.type) {
    case "card_created":
      return {
        label: "付箋が登場",
        icon: "＋",
        className: "timelapse-keypoint-fact",
        hint: "新しい考えが活動に加わった場面です。"
      };
    case "card_deleted":
      return {
        label: "付箋を削除",
        icon: "−",
        className: "timelapse-keypoint-change",
        hint: "考えを整理したり、取りやめたりした場面です。"
      };
    case "card_type_changed":
      return {
        label: "付箋を分類",
        icon: "↻",
        className: "timelapse-keypoint-target",
        hint: "考えの役割や意味を見直した場面です。"
      };
    case "card_resized":
      return {
        label: "付箋を強調",
        icon: "↔",
        className: "timelapse-keypoint-hint",
        hint: "考えの重要度や注目度を変更した場面です。"
      };
    case "media_created":
      return {
        label: `${getMediaTypeLabel(event)}が登場`,
        icon: getMediaType(event) === "video" ? "▶" : "▧",
        className: "timelapse-keypoint-media-created",
        hint: `${getMediaTypeLabel(event)}が活動資料として加わった場面です。`
      };
    case "media_deleted":
      return {
        label: `${getMediaTypeLabel(event)}を削除`,
        icon: "×",
        className: "timelapse-keypoint-media-deleted",
        hint: `${getMediaTypeLabel(event)}を整理し、ボードから取り除いた場面です。`
      };
    default:
      return {
        label: "活動の変化",
        icon: "•",
        className: "timelapse-keypoint-fact",
        hint: "活動内容に変化があった場面です。"
      };
  }
}

export function getActivityDescription(event, cardLabelMap = {}) {
  const userName = event?.userName || "参加者";

  switch (event?.type) {
    case "card_created":
      return `${userName}さんが${getCardDisplayName(event, cardLabelMap)}を追加しました。`;
    case "card_deleted":
      return `${userName}さんが${getCardDisplayName(event, cardLabelMap)}を削除しました。`;
    case "card_type_changed":
      return `${userName}さんが${getCardDisplayName(event, cardLabelMap)}の分類を変更しました。`;
    case "card_resized":
      return `${userName}さんが${getCardDisplayName(event, cardLabelMap)}の大きさを変更しました。`;
    case "media_created":
      return `${userName}さんが${getMediaTypeLabel(event)}「${getMediaFileName(event)}」をボードに追加しました。`;
    case "media_deleted":
      return `${userName}さんが${getMediaTypeLabel(event)}「${getMediaFileName(event)}」をボードから削除しました。`;
    default:
      return `${userName}さんがボードを変更しました。`;
  }
}

export function getActivityChangeDetail(event) {
  const payload = getPayload(event);

  switch (event?.type) {
    case "card_created":
      return "新しい付箋がボード上に登場しました。";
    case "card_deleted":
      return "付箋がボード上から取り除かれました。";
    case "card_type_changed":
      return `分類を「${getCardTypeLabel(payload.beforeType)}」から「${getCardTypeLabel(payload.afterType)}」へ変更しました。`;
    case "card_resized": {
      const beforeWidth = Math.round(Number(payload.startWidth || payload.beforeWidth || 0));
      const beforeHeight = Math.round(Number(payload.startHeight || payload.beforeHeight || 0));
      const afterWidth = Math.round(Number(payload.endWidth || payload.afterWidth || 0));
      const afterHeight = Math.round(Number(payload.endHeight || payload.afterHeight || 0));
      return beforeWidth && afterWidth
        ? `大きさを ${beforeWidth}×${beforeHeight} から ${afterWidth}×${afterHeight} に変更しました。`
        : "付箋の大きさを変更しました。";
    }
    case "media_created":
      return `${getMediaTypeLabel(event)}が活動資料としてボード上に登場しました。`;
    case "media_deleted":
      return `${getMediaTypeLabel(event)}がボード上から取り除かれました。`;
    default:
      return "ボード上の内容が変更されました。";
  }
}

export function getActivityTechnicalDetail(event) {
  const payload = getPayload(event);
  const media = getMedia(event);

  switch (event?.type) {
    case "media_created":
      return [
        "操作：メディア追加",
        `種類：${getMediaTypeLabel(event)}`,
        `ファイル名：${getMediaFileName(event)}`,
        `メディアID：${payload.mediaId || media.id || "不明"}`
      ].join(" ／ ");
    case "media_deleted":
      return [
        "操作：メディア削除",
        `種類：${getMediaTypeLabel(event)}`,
        `ファイル名：${getMediaFileName(event)}`,
        `メディアID：${payload.mediaId || media.id || "不明"}`
      ].join(" ／ ");
    default:
      return JSON.stringify(payload);
  }
}
