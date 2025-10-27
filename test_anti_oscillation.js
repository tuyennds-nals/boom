// Import BotController class directly without WebSocket connection
const fs = require('fs');

const TileType = {
  EMPTY: 0,
  BRICK: 2,
  WALL: 1,
};

// Copy BotController class for testing (without WebSocket dependencies)
class BotController {
  playerId = '';
  lastKnownState = {
    map: null,
    players: new Map(),
    bombs: [],
    items: [],
  };

  // Memory for movement patterns
  movementHistory = [];
  lastPosition = null;
  stuckCounter = 0;
  preferredDirection = null;
  directionChangeTimer = 0;

  constructor(playerId) {
    this.playerId = playerId;
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
    if (payload.p !== undefined) {
      player.position = {
        x: payload.p.x / 100.0,
        y: payload.p.y / 100.0,
      };
    }
    if (payload.s !== undefined) player.status = payload.s;
    if (payload.sp !== undefined) player.speed = payload.sp;
    if (payload.bl !== undefined) player.bombLimit = payload.bl;
    if (payload.bp !== undefined) player.bombsPlaced = payload.bp;
    if (payload.pow !== undefined) player.bombPower = payload.pow;
    return player;
  }

  _hydrateBomb(payload) {
    return {
      id: payload.id,
      ownerId: payload.o,
      position: { x: payload.p.x, y: payload.p.y },
      countdownTicks: payload.c,
      power: payload.pow,
      isExplodingSoon: payload.es,
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
        return { type: 'control_ghost', data: { x: 5, y: 7 } };
      } else {
        const action = this.decideNextAction(serverData, playerNumber);
        return { type: 'control', data: action };
      }
    } catch (e) {
      console.error(`Error processing server data`, e);
      return null;
    }
  }

  decideNextAction(serverData, playerNumber) {
    try {
      const players = Array.from(this.lastKnownState.players.values());
      const botPlayer = players.find(p => p.id === this.playerId);

      if (!botPlayer || !this.lastKnownState.map) {
        return 'u';
      }

      const botPos = {
        x: Math.floor(botPlayer.position.x),
        y: Math.floor(botPlayer.position.y)
      };

      this.updateMovementHistory(botPos);

      const moveAction = this.findContinuousMovementWithMemory(botPos, botPlayer, players);
      if (moveAction) {
        this.updatePreferredDirection(moveAction);
        return moveAction;
      }

      const fallbackAction = this.findAnyMovement(botPos);
      if (fallbackAction) {
        this.updatePreferredDirection(fallbackAction);
      }
      return fallbackAction || 'u';

    } catch (error) {
      console.error('Error in decideNextAction:', error);
      return 'u';
    }
  }

  updateMovementHistory(currentPos) {
    this.movementHistory.push({ ...currentPos, timestamp: Date.now() });

    if (this.movementHistory.length > 10) {
      this.movementHistory.shift();
    }

    if (this.lastPosition) {
      const distance = Math.abs(currentPos.x - this.lastPosition.x) + Math.abs(currentPos.y - this.lastPosition.y);
      if (distance === 0) {
        this.stuckCounter++;
      } else {
        this.stuckCounter = 0;
      }
    }

    this.lastPosition = { ...currentPos };

    if (this.directionChangeTimer > 0) {
      this.directionChangeTimer--;
    }
  }

  updatePreferredDirection(action) {
    this.preferredDirection = action;
    this.directionChangeTimer = 5;
  }

  wasRecentlyVisited(x, y, withinTicks = 5) {
    const now = Date.now();
    return this.movementHistory.some(pos =>
      pos.x === x && pos.y === y && (now - pos.timestamp) < (withinTicks * 100)
    );
  }

  isOscillating() {
    if (this.movementHistory.length < 4) {
      return false;
    }

    const recent = this.movementHistory.slice(-4);
    return (recent[0].x === recent[2].x && recent[0].y === recent[2].y &&
            recent[1].x === recent[3].x && recent[1].y === recent[3].y);
  }

  findContinuousMovementWithMemory(botPos, botPlayer, allPlayers) {
    const directions = [
      { action: 'u', dx: 0, dy: -1 },
      { action: 'd', dx: 0, dy: 1 },
      { action: 'l', dx: -1, dy: 0 },
      { action: 'r', dx: 1, dy: 0 }
    ];

    const moveOptions = [];

    for (const dir of directions) {
      const newX = botPos.x + dir.dx;
      const newY = botPos.y + dir.dy;

      if (!this.isPositionWalkable(newX, newY)) {
        continue;
      }

      let antiOscillationBonus = 0;

      if (this.wasRecentlyVisited(newX, newY, 3)) {
        antiOscillationBonus -= 30;
      }

      if (this.preferredDirection === dir.action && this.directionChangeTimer > 0) {
        antiOscillationBonus += 25;
      }

      if (this.preferredDirection) {
        const opposites = { 'u': 'd', 'd': 'u', 'l': 'r', 'r': 'l' };
        if (opposites[this.preferredDirection] === dir.action) {
          antiOscillationBonus -= 20;
        }
      }

      if (this.isOscillating()) {
        antiOscillationBonus -= 15;
      }

      const explorationBonus = this.calculateExplorationValue(newX, newY);

      const totalScore = 50 + antiOscillationBonus + explorationBonus;

      moveOptions.push({
        ...dir,
        antiOscillation: antiOscillationBonus,
        exploration: explorationBonus,
        total: totalScore
      });
    }

    moveOptions.sort((a, b) => b.total - a.total);
    return moveOptions.length > 0 ? moveOptions[0].action : null;
  }

  calculateExplorationValue(x, y) {
    let explorationValue = 50;

    const visitCount = this.movementHistory.filter(pos => pos.x === x && pos.y === y).length;
    explorationValue -= visitCount * 10;

    if (this.movementHistory.length > 0) {
      const averageDistance = this.movementHistory.reduce((sum, pos) => {
        return sum + Math.abs(x - pos.x) + Math.abs(y - pos.y);
      }, 0) / this.movementHistory.length;

      explorationValue += Math.min(20, averageDistance * 2);
    }

    return Math.max(0, explorationValue);
  }

  findAnyMovement(botPos) {
    const directions = [
      { action: 'u', dx: 0, dy: -1 },
      { action: 'd', dx: 0, dy: 1 },
      { action: 'l', dx: -1, dy: 0 },
      { action: 'r', dx: 1, dy: 0 }
    ];

    const validMoves = [];

    for (const dir of directions) {
      const newX = botPos.x + dir.dx;
      const newY = botPos.y + dir.dy;

      if (this.isPositionWalkable(newX, newY)) {
        let score = 100;

        if (this.preferredDirection === dir.action && this.directionChangeTimer > 0) {
          score += 50;
        }

        if (this.wasRecentlyVisited(newX, newY, 2)) {
          score -= 30;
        }

        if (this.preferredDirection) {
          const opposites = { 'u': 'd', 'd': 'u', 'l': 'r', 'r': 'l' };
          if (opposites[this.preferredDirection] === dir.action) {
            score -= 40;
          }
        }

        validMoves.push({ ...dir, score });
      }
    }

    validMoves.sort((a, b) => b.score - a.score);
    return validMoves.length > 0 ? validMoves[0].action : null;
  }

  isPositionWalkable(x, y) {
    const map = this.lastKnownState.map;
    if (x < 0 || y < 0 || y >= map.height || x >= map.width) {
      return false;
    }
    const tile = map.tiles[y][x];
    return tile === TileType.EMPTY;
  }
}

// Test anti-oscillation behavior
function testAntiOscillation() {
  const bot = new BotController('test-bot');

  // Initialize with simple map
  const mockInitialState = {
    type: 'initial_state',
    map: {
      width: 5,
      height: 5,
      tiles: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
      ]
    },
    players: [{
      id: 'test-bot',
      n: 'TestBot',
      p: { x: 200, y: 200 }, // Position (2,2)
      s: 'alive',
      sp: 100,
      bl: 1,
      bp: 0,
      pow: 1
    }],
    bombs: [],
    items: []
  };

  bot.processGameState(mockInitialState, 1);

  console.log('Testing anti-oscillation behavior...\n');

  // Simulate multiple decisions to see movement pattern
  const movements = [];

  for (let i = 0; i < 15; i++) {
    const mockTickDelta = {
      type: 'tick_delta',
      players: [{
        id: 'test-bot',
        p: { x: 200 + Math.random() * 10, y: 200 + Math.random() * 10 } // Slight position variations
      }]
    };

    const result = bot.processGameState(mockTickDelta, 1);
    const action = result ? result.data : 'no-action';
    movements.push(action);

    console.log(`Tick ${i + 1}: Action = ${action}`);
    console.log(`  Movement History Length: ${bot.movementHistory.length}`);
    console.log(`  Preferred Direction: ${bot.preferredDirection}`);
    console.log(`  Direction Change Timer: ${bot.directionChangeTimer}`);
    console.log(`  Is Oscillating: ${bot.isOscillating()}`);
    console.log(`  Stuck Counter: ${bot.stuckCounter}`);
    console.log('');
  }

  // Analysis
  console.log('=== MOVEMENT ANALYSIS ===');
  console.log('Movement sequence:', movements.join(' -> '));

  // Check for oscillation patterns
  let oscillations = 0;
  for (let i = 0; i < movements.length - 3; i++) {
    if (movements[i] === movements[i + 2] && movements[i + 1] === movements[i + 3]) {
      oscillations++;
    }
  }

  console.log(`Detected oscillations: ${oscillations}`);

  // Check direction consistency
  let directionChanges = 0;
  for (let i = 1; i < movements.length; i++) {
    if (movements[i] !== movements[i - 1] && movements[i] !== 'b') {
      directionChanges++;
    }
  }

  console.log(`Direction changes: ${directionChanges}`);
  console.log(`Average consistency: ${((movements.length - directionChanges) / movements.length * 100).toFixed(1)}%`);

  // Test specific oscillation detection
  console.log('\n=== OSCILLATION DETECTION TEST ===');

  // Manually create oscillation pattern
  bot.movementHistory = [
    { x: 2, y: 2, timestamp: Date.now() - 400 },
    { x: 2, y: 1, timestamp: Date.now() - 300 },
    { x: 2, y: 2, timestamp: Date.now() - 200 },
    { x: 2, y: 1, timestamp: Date.now() - 100 }
  ];

  console.log('Manual oscillation pattern created');
  console.log('Is oscillating:', bot.isOscillating());

  // Test recently visited detection
  console.log('\n=== RECENTLY VISITED TEST ===');
  console.log('Was (2,2) recently visited:', bot.wasRecentlyVisited(2, 2, 5));
  console.log('Was (3,3) recently visited:', bot.wasRecentlyVisited(3, 3, 5));
}

// Test with enemy pressure scenario
function testEnemyPressureMovement() {
  console.log('\n=== ENEMY PRESSURE SCENARIO ===');

  const bot = new BotController('test-bot');

  const mockInitialState = {
    type: 'initial_state',
    map: {
      width: 7,
      height: 7,
      tiles: [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1]
      ]
    },
    players: [
      {
        id: 'test-bot',
        n: 'TestBot',
        p: { x: 200, y: 200 }, // Position (2,2)
        s: 'alive',
        sp: 100,
        bl: 2,
        bp: 0,
        pow: 1
      },
      {
        id: 'enemy',
        n: 'Enemy',
        p: { x: 400, y: 200 }, // Position (4,2) - close enemy
        s: 'alive',
        sp: 100,
        bl: 2,
        bp: 0,
        pow: 1
      }
    ],
    bombs: [],
    items: []
  };

  bot.processGameState(mockInitialState, 1);

  console.log('Testing movement with enemy pressure...\n');

  const movements = [];

  for (let i = 0; i < 10; i++) {
    const mockTickDelta = {
      type: 'tick_delta',
      players: [
        {
          id: 'test-bot',
          p: { x: 200 + i * 5, y: 200 } // Gradual movement
        },
        {
          id: 'enemy',
          p: { x: 400 - i * 3, y: 200 } // Enemy approaching
        }
      ]
    };

    const result = bot.processGameState(mockTickDelta, 1);
    const action = result ? result.data : 'no-action';
    movements.push(action);

    console.log(`Tick ${i + 1}: Action = ${action} (Enemy distance decreasing)`);
  }

  console.log('\nMovement under pressure:', movements.join(' -> '));
}

// Run tests
testAntiOscillation();
testEnemyPressureMovement();

console.log('\n=== TEST COMPLETED ===');
console.log('Anti-oscillation improvements implemented:');
console.log('✓ Movement history tracking');
console.log('✓ Recently visited position penalties');
console.log('✓ Preferred direction continuity');
console.log('✓ Oscillation pattern detection');
console.log('✓ Exploration value bonuses');
console.log('✓ Direction change momentum');
