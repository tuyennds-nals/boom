const { time } = require('console');
const fs = require('fs');

const TileType = {
  EMPTY: 0,
  BRICK: 2,
  WALL: 1,
};

class BotController {
  playerId = '';
  lastKnownState = {
    map: null,
    players: new Map(),
    bombs: [],
    items: [],
  };

  constructor(playerId) {
    this.playerId = playerId;
    this.lastBombTime = Date.now();
    this.lastPositions = [];
    this.maxPositionHistory = 5;
    this.huntModeTimeout = 10000; // 10 seconds
  }

  _handleInitialState(data) {
    this.lastKnownState.map = data.map;

    this.lastKnownState.players.clear();
    if (data.players && Array.isArray(data.players)) {
      data.players.forEach(player => {
        this.lastKnownState.players.set(player.id, player);
      });
    }

    this.lastKnownState.bombs = data.bombs || [];
    this.lastKnownState.items = data.items || [];
  }

  _handleTickDelta(delta) {
    if (delta.destroyedBricks && Array.isArray(delta.destroyedBricks)) {
      delta.destroyedBricks.forEach(brick => {
        if (this.lastKnownState.map && this.lastKnownState.map.tiles) {
          this.lastKnownState.map.tiles[brick.y][brick.x] = TileType.EMPTY;
        }
      });
    }

    if (delta.players && Array.isArray(delta.players)) {
      delta.players.forEach(playerPayload => {
        const existingPlayer = this.lastKnownState.players.get(playerPayload.id);
        if (existingPlayer) {
          const updatedPlayer = this._hydratePlayer(playerPayload, existingPlayer);
          this.lastKnownState.players.set(playerPayload.id, updatedPlayer);
        } else {
          const newPlayer = this._hydratePlayer(playerPayload, {});
          this.lastKnownState.players.set(playerPayload.id, newPlayer);
        }
      });
    }

    if (delta.bombs && Array.isArray(delta.bombs)) {
      this.lastKnownState.bombs = delta.bombs.map(bombPayload => this._hydrateBomb(bombPayload));

    }

    if (delta.items && Array.isArray(delta.items)) {
      this.lastKnownState.items = delta.items.map(itemPayload => this._hydrateItem(itemPayload));
    }
  }

  _hydratePlayer(payload, baseObj) {
    const player = { ...baseObj };

    if (payload.id !== undefined) player.id = payload.id;
    if (payload.n !== undefined) player.name = payload.n;
    if (payload.d !== undefined) player.direction = payload.d;
    if (payload.p !== undefined) {
      player.position = {
        x: payload.p.x / 100.0,
        y: payload.p.y / 100.0,
      };
    }
    if (payload.s !== undefined) player.status = payload.s;
    if (payload.iv !== undefined) player.isInvincible = payload.iv;
    if (payload.ivt !== undefined) player.invincibilityTicksLeft = payload.ivt;
    if (payload.sp !== undefined) player.speed = payload.sp;
    if (payload.bl !== undefined) player.bombLimit = payload.bl;
    if (payload.bp !== undefined) player.bombsPlaced = payload.bp;
    if (payload.pow !== undefined) player.bombPower = payload.pow;
    if (payload.sc !== undefined) player.score = payload.sc;
    if (payload.tid !== undefined) player.teamId = payload.tid;

    return player;
  }

  _hydrateBomb(payload) {
    return {
      id: payload.id,
      ownerId: payload.o,
      position: { x: payload.p.x, y: payload.p.y },
      countdownTicks: payload.c -2.88,
      power: payload.pow,
      isExplodingSoon: payload.es,
      isMoving: payload.imv,
      kickerId: payload.kid,
      moveDirection: payload.md,
      moveDistanceLeft: payload.mdl,
    };
  }

  _hydrateItem(payload) {
    return {
      id: payload.id,
      type: payload.t,
      position: { x: payload.p.x, y: payload.p.y },
    };
  }

  processGameState(serverData, playerNumber) {
    if (!serverData || !serverData.type) return null;

    try {
      if (serverData.type === 'initial_state') {
        this._handleInitialState(serverData);
      } else if (serverData.type === 'tick_delta') {
        this._handleTickDelta(serverData);
      }

      const players = Array.from(this.lastKnownState.players.values());
      const botState = players.find(p => p.id === this.playerId);

      if (botState.status === 'dead') {
        return this.decideGhostAction();
      } else {
        // console.log('========>serverData', serverData);
        const action = this.decideNextAction(serverData, playerNumber);

        return { type: 'control', data: action };
      }
    } catch (e) {
      console.error(`Error processing server data`, e);
      return null;
    }
  }

  decideGhostAction() {
    // Phân tích game state cho ghost
    const players = Array.from(this.lastKnownState.players.values());
    const myPlayer = players.find(p => p.id === this.playerId);
    const enemies = players.filter(p => p.id !== this.playerId && (myPlayer.teamId !== p.teamId) && p.status === 'alive');
    const items = this.lastKnownState.items || [];
    const map = this.lastKnownState.map;
    
    if (!map) {
      // Fallback nếu không có map data
      return {
        type: 'control_ghost',
        data: {
          x: 5,
          y: 7,
        },
      };
    }

    // Tìm vị trí ghost hiện tại (có thể cần estimate nếu không có thông tin chính xác)
    const myGhost = players.find(p => p.id === this.playerId);
    let currentGhostPos = { x: 5, y: 7 }; // Default position
    
    if (myGhost && myGhost.position) {
      currentGhostPos = {
        x: Math.round(myGhost.position.x),
        y: Math.round(myGhost.position.y)
      };
    }

    // Priority 1: Tìm enemy gần nhất để ám
    const nearestEnemy = this._findNearestEnemy(currentGhostPos, enemies);
    
    // Priority 2: Tìm item gần nhất để nhặt
    const nearestItem = this._findNearestItem(currentGhostPos, items);

    // Logic quyết định:
    // 1. Nếu có enemy gần (trong bán kính 3 ô) → ưu tiên ám enemy
    // 2. Nếu có item và không có enemy gần → nhặt item
    // 3. Nếu hết item → tìm enemy xa nhất để ám
    
    let targetPos = null;

    if (nearestEnemy && nearestEnemy.distance <= 3) {
      // Enemy gần → ưu tiên ám
      targetPos = nearestEnemy.position;
    } else if (nearestItem && nearestItem.distance <= 8) {
      // Có item và enemy không quá gần → nhặt item
      targetPos = nearestItem.position;
    } else if (nearestEnemy) {
      // Hết item hoặc item quá xa → ám enemy
      targetPos = nearestEnemy.position;
    } else {
      // Không có mục tiêu → di chuyển random trong khu vực an toàn
      targetPos = this._findRandomSafePosition(map);
    }

    return {
      type: 'control_ghost',
      data: {
        x: targetPos.x,
        y: targetPos.y,
      },
    };
  }

  decideNextAction(serverData, playerNumber) {
    return 'u';
  }
}

exports.BotController = BotController;
