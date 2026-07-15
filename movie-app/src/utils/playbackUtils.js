export const createEmptyPlaybackState = () => ({
  cards: {},
  drawings: {},
  connections: {}
});

export const applyHistoryEvent = (state, event) => {
  const { type, cardId, connectionId, payload = {} } = event;

  switch (type) {
    case "card_created":
      state.cards[cardId] = { ...payload.card };
      break;
    case "card_moved":
      if (state.cards[cardId]) {
        state.cards[cardId] = { ...state.cards[cardId], x: payload.x, y: payload.y };
      }
      break;
    case "card_resized":
      if (state.cards[cardId]) {
        state.cards[cardId] = {
          ...state.cards[cardId],
          width: payload.width,
          height: payload.height
        };
      }
      break;
    case "card_type_changed":
      if (state.cards[cardId]) {
        state.cards[cardId] = { ...state.cards[cardId], type: payload.afterType };
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
      state.drawings[cardId].push(payload.segment);
      break;
    case "drawing_cleared":
      state.drawings[cardId] = [];
      break;
    case "connection_created":
      state.connections[connectionId] = { ...payload.connection };
      break;
    case "connection_deleted":
      delete state.connections[connectionId];
      break;
    default:
      break;
  }
};

export const createPlaybackState = (events, positionMs) => {
  const state = createEmptyPlaybackState();
  if (events.length === 0) return state;

  const startTime = events[0].timestamp || 0;
  const targetTime = startTime + positionMs;

  for (const event of events) {
    if ((event.timestamp || 0) > targetTime) break;
    applyHistoryEvent(state, event);
  }

  return state;
};
