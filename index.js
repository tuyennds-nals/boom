const WebSocket = require('ws');
const { BotController } = require('./botController');
const uuid = require('uuid').v4;

// gameID: 137efe84-3c5f-4f86-b85c-ccfe87c12105
// Team 1: - Team 1 (ID:  (ID: 5769cb18-7b01-4b53-ad67-1ac1f7749f0a))
// Team 2: - Boss Team (ID:  (ID: 5535009b-c942-41df-b267-f5f4d1752101))

const webSocketUrl = 'ws://171.251.51.213:5001';
const gameId = '137efe84-3c5f-4f86-b85c-ccfe87c12105';
const teamId = '5769cb18-7b01-4b53-ad67-1ac1f7749f0a';
const playerId = uuid();
const playerName = 'Tuyennds - Bruh';
const teamName = 'Ba con sâu';

const botController = new BotController(playerId);

const ws = new WebSocket(webSocketUrl);

ws.onopen = () => {
  console.log('[WebSocket] Connected to server');
  ws.send(JSON.stringify({
    type: 'join_game',
    data: { gameId, playerId, role: 'player', playerName, teamId, teamName }
  }));
};

ws.onclose = () => {
  console.warn('[WebSocket] Disconnected from server');
  botController.cleanup();
};

ws.onerror = (err) => {
  console.error('[WebSocket] Connection error:', err);
};

ws.onmessage = (event) => {
  try {
    const message = JSON.parse(event.data);
    // console.log('========>onMessage', message);

    if (isGameEventType(message.type)) {
      return processAndControl(message);
    }

    switch (message.type) {
      case 'join_success':
        console.log(`[WebSocket] Successfully joined game ${gameId}`);
        break;
      case 'game_over':
        console.log('[WebSocket] Game over. Winner:', message.winnerId);
        break;
    }
  } catch (error) {
    console.error('[WebSocket] Error processing message:', error);
  }
};


function isGameEventType(tag) {
  const gameEvents = ['tick', 'initial_state', 'tick_delta', 'bomb_placed', 'bomb_exploding_soon', 'player_died', 'game_over'];
  return gameEvents.includes(tag);
}

// This is main
function sendControlAction(action) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[WebSocket] Cannot send action, connection is not open.');
    return;
  }

  try {
    ws.send(JSON.stringify({
      type: 'control',
      data: { action: action }
    }));
  } catch (error) {
    console.error('[WebSocket] Error sending action:', error);
  }
}

function sendControlGhostAction(action) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[WebSocket] Cannot send ghost action, connection is not open.');
    return;
  }

  try {
    ws.send(JSON.stringify({
      type: 'control_ghost',
      data: { action: action }
    }));
  } catch (error) {
    console.error('[WebSocket] Error sending ghost action:', error);
  }
}

// This is main main
function processAndControl(gameState) {
  try {
    const action = botController.processGameState(gameState, 1);
// console.log('========>processAndControl', action);
    if (action?.type === 'control') {
      sendControlAction(action.data);
    } else if (action?.type === 'control_ghost') {
      sendControlGhostAction(action.data);
    }
  } catch (error) {
    console.error('[Bot] Error processing game state:', error);
  }
}
