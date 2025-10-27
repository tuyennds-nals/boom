export const gameConfig = {
  // Core timing
  TICK_RATE: 16, // ms (~60 FPS)
  TICK_RATE_PLAYER: 200, // ms
  GAME_DURATION: 300000, // 5 minutes in ms

  // Map dimensions
  MAP_WIDTH: 28,
  MAP_HEIGHT: 18,

  // Player settings - improved for better responsiveness
  PLAYER_BASE_SPEED: 0.5,
  PLAYER_INITIAL_BOMB_LIMIT: 1,
  PLAYER_INITIAL_BOMB_POWER: 1,
  PLAYER_MAX_BOMB_LIMIT: 8,
  PLAYER_MAX_BOMB_POWER: 8,
  PLAYER_MAX_SPEED: 3.5,
  PLAYER_HITBOX_SIZE: 0.8,
  DYING_TIME: 5000, // 5 seconds in ms

  // Bomb settings
  BOMB_FUSE_TICKS: 180, // 3 seconds at 60fps
  BOMB_EXPLODING_SOON_TICKS: 60, // 1 second warning
  BOMB_SLIDE_SPEED: 3.0, // Speed at which kicked bombs slide

  // Explosion settings
  EXPLOSION_LIFETIME_TICKS: 30, // 0.5 seconds

  // Invincibility after being hit
  INVINCIBILITY_TICKS: 120, // 2 seconds

  // Ghost stun duration when hit by explosion
  GHOST_STUN_DURATION_TICKS: 120, // 2 seconds at 60fps (16ms tick rate ≈ 60fps)

  // Connection settings
  RECONNECTION_TIMEOUT: 15000, // ms
  GAME_CLEANUP_DELAY: 30010, // ms

  // Item settings
  ITEM_SPAWN_CHANCE_BOMB_UP: 0.15, // 15% chance when brick destroyed
  ITEM_SPAWN_CHANCE_POWER_UP: 0.15, // 15% chance when brick destroyed
  ITEM_SPAWN_CHANCE_SPEED_UP: 0.1, // 10% chance when brick destroyed
  ITEM_COLLECTION_THRESHOLD: 0.3, // Distance threshold for item collection

  // Player spawn positions (for 2 players)
  SPAWN_POSITIONS: [
    { x: 1, y: 1 }, // Player 1 - top left
    { x: 26, y: 16 }, // Player 2 - bottom right
  ],

  // Rate limiting - more lenient for testing
  MAX_ACTIONS_PER_SECOND: 60, // Increased from 30 for more responsive input
  ACTION_QUEUE_MAX_SIZE: 5, // Reduced from 10 to prevent input lag
};
