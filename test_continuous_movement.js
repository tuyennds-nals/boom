const { BotController } = require('./botController.js');

// Test continuous movement behavior
console.log('=== Testing Continuous Movement Logic ===');

const bot = new BotController('test-bot-id');

// Sample map with some strategic positions
const testMap = {
  width: 12,
  height: 8,
  tiles: [
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,2,0,2,0,2,0,0,0,1],
    [1,0,1,2,1,2,1,2,1,0,1,1],
    [1,2,0,0,0,0,0,0,0,2,0,1],
    [1,0,1,2,1,2,1,2,1,0,1,1],
    [1,2,0,0,0,0,0,0,0,2,0,1],
    [1,0,0,2,0,2,0,2,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1]
  ],
  type: 'cold'
};

// Initialize bot state manually (without WebSocket)
bot.lastKnownState.map = testMap;
bot.lastKnownState.players.set('test-bot-id', {
  id: 'test-bot-id',
  name: 'Test Bot',
  position: { x: 1, y: 1 },
  status: 'alive',
  isInvincible: false,
  speed: 0.5,
  bombLimit: 2,
  bombsPlaced: 0,
  bombPower: 2,
  score: 0,
  direction: 'down'
});

bot.lastKnownState.players.set('enemy-1', {
  id: 'enemy-1',
  name: 'Enemy 1',
  position: { x: 10, y: 6 },
  status: 'alive',
  isInvincible: false,
  speed: 0.5,
  bombLimit: 1,
  bombsPlaced: 0,
  bombPower: 1,
  score: 0,
  direction: 'left'
});

// Test scenarios
const scenarios = [
  {
    name: 'Normal movement (no threats)',
    bombs: [],
    botPos: { x: 3, y: 3 }
  },
  {
    name: 'Enemy nearby (should move strategically)',
    bombs: [],
    botPos: { x: 5, y: 3 },
    enemyPos: { x: 7, y: 3 }
  },
  {
    name: 'Bomb threat (should escape)',
    bombs: [
      {
        id: '1',
        ownerId: 'enemy-1',
        position: { x: 4, y: 3 },
        countdownTicks: 70,
        power: 2,
        isExplodingSoon: false
      }
    ],
    botPos: { x: 3, y: 3 }
  },
  {
    name: 'Multiple bombs (should find safest path)',
    bombs: [
      {
        id: '1',
        ownerId: 'enemy-1',
        position: { x: 2, y: 3 },
        countdownTicks: 50,
        power: 1,
        isExplodingSoon: true
      },
      {
        id: '2',
        ownerId: 'enemy-1',
        position: { x: 6, y: 3 },
        countdownTicks: 80,
        power: 1,
        isExplodingSoon: false
      }
    ],
    botPos: { x: 4, y: 3 }
  }
];

scenarios.forEach((scenario, index) => {
  console.log(`\n--- Scenario ${index + 1}: ${scenario.name} ---`);

  // Update bot position
  const botPlayer = bot.lastKnownState.players.get('test-bot-id');
  botPlayer.position.x = scenario.botPos.x;
  botPlayer.position.y = scenario.botPos.y;

  // Update enemy position if specified
  if (scenario.enemyPos) {
    const enemyPlayer = bot.lastKnownState.players.get('enemy-1');
    if (enemyPlayer) {
      enemyPlayer.position.x = scenario.enemyPos.x;
      enemyPlayer.position.y = scenario.enemyPos.y;
    }
  }

  // Update bombs
  bot.lastKnownState.bombs = scenario.bombs || [];
  bot.lastKnownState.items = [];

  console.log(`Bot at position (${scenario.botPos.x}, ${scenario.botPos.y})`);

  // Test multiple consecutive moves
  for (let i = 0; i < 5; i++) {
    const action = bot.decideNextAction({
      type: 'tick_delta',
      tick: i + 1
    }, 1);

    console.log(`  Move ${i + 1}: ${action || 'no action'}`);

    // Simulate movement
    if (action && action !== 'b') {
      const oldPos = { ...botPlayer.position };
      switch(action) {
        case 'u': botPlayer.position.y = Math.max(1, botPlayer.position.y - 1); break;
        case 'd': botPlayer.position.y = Math.min(6, botPlayer.position.y + 1); break;
        case 'l': botPlayer.position.x = Math.max(1, botPlayer.position.x - 1); break;
        case 'r': botPlayer.position.x = Math.min(10, botPlayer.position.x + 1); break;
      }

      if (oldPos.x !== botPlayer.position.x || oldPos.y !== botPlayer.position.y) {
        console.log(`    Moved to: (${botPlayer.position.x}, ${botPlayer.position.y})`);
      } else {
        console.log(`    Stayed at: (${botPlayer.position.x}, ${botPlayer.position.y})`);
      }
    } else if (action === 'b') {
      console.log(`    Placed bomb at: (${botPlayer.position.x}, ${botPlayer.position.y})`);
      botPlayer.bombsPlaced++;
    }
  }
});

console.log('\n=== Continuous Movement Test Completed Successfully ===');
