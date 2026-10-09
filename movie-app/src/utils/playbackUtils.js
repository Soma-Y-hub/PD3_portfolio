export const createEmptyPlaybackState = () => ({
  cards: {},
  drawings: {},
  connections: {},
  media: {},
  boardDrawings: []
});

function getMediaId(payload = {}) {
  return payload.mediaId || payload.media?.id || null;
}

export const applyHistoryEvent = (state, event) => {
  const { type, cardId, connectionId, payload = {} } = event;

  switch (type) {
    case "card_created":
      state.cards[cardId] = { ...payload.card };
      break;
    case "card_moved":
      if (state.cards[cardId]) {
        state.cards[cardId] = {
          ...state.cards[cardId],
          x: payload.x ?? payload.afterX,
          y: payload.y ?? payload.afterY
        };
      }
      break;
    case "card_resized":
      if (state.cards[cardId]) {
        state.cards[cardId] = {
          ...state.cards[cardId],
          width: payload.width ?? payload.afterWidth,
          height: payload.height ?? payload.afterHeight
        };
      }
      break;
    case "card_type_changed":
      if (state.cards[cardId]) {
        state.cards[cardId] = { ...state.cards[cardId], type: payload.afterType };
      }
      break;
    case "card_layer_changed":
      if (state.cards[cardId]) {
        state.cards[cardId] = { ...state.cards[cardId], zIndex: payload.zIndex };
      }
      break;
    case "card_deleted":
      delete state.cards[cardId];
      delete state.drawings[cardId];
      Object.entries(state.connections).forEach(([id, connection]) => {
        if (connection.from === cardId || connection.to === cardId) {
          delete state.connections[id];
        }
      });
      break;
    case "drawing_segment":
      if (!state.drawings[cardId]) state.drawings[cardId] = [];
      if (payload.segment) state.drawings[cardId].push(payload.segment);
      break;
    case "drawing_cleared":
      state.drawings[cardId] = [];
      break;
    case "board_drawing_segment":
      if (payload.segment) state.boardDrawings.push(payload.segment);
      break;
    case "board_drawing_stroke_erased": {
      const strokeId = payload.strokeId;
      state.boardDrawings = state.boardDrawings.filter(
        (segment) => (segment?.strokeId || "") !== strokeId
      );
      break;
    }
    case "board_drawing_cleared":
      state.boardDrawings = [];
      break;
    case "connection_created":
      state.connections[connectionId] = { ...payload.connection };
      break;
    case "connection_deleted":
      delete state.connections[connectionId];
      break;
    case "media_created": {
      const mediaId = getMediaId(payload);
      if (mediaId && payload.media) {
        state.media[mediaId] = { ...payload.media, deleted: false };
      }
      break;
    }
    case "media_moved": {
      const mediaId = getMediaId(payload);
      if (mediaId && state.media[mediaId]) {
        state.media[mediaId] = {
          ...state.media[mediaId],
          x: payload.afterX ?? payload.media?.x,
          y: payload.afterY ?? payload.media?.y
        };
      }
      break;
    }
    case "media_resized": {
      const mediaId = getMediaId(payload);
      if (mediaId && state.media[mediaId]) {
        state.media[mediaId] = {
          ...state.media[mediaId],
          width: payload.afterWidth ?? payload.media?.width,
          height: payload.afterHeight ?? payload.media?.height
        };
      }
      break;
    }
    case "media_deleted": {
      const mediaId = getMediaId(payload);
      if (mediaId) delete state.media[mediaId];
      break;
    }
    default:
      break;
  }
};

export const createPlaybackState = (events, positionMs) => {
  const state = createEmptyPlaybackState();
  if (events.length === 0) return state;

  const targetPosition = Math.max(0, Number(positionMs) || 0);

  for (const event of events) {
    const eventPosition = Number.isFinite(Number(event.timelinePositionMs))
      ? Number(event.timelinePositionMs)
      : Math.max(0, (Number(event.timestamp) || 0) - (Number(events[0].timestamp) || 0));

    if (eventPosition > targetPosition) break;
    applyHistoryEvent(state, event);
  }

  return state;
};
