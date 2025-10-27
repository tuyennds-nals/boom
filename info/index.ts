export type PlayerAction = 'u' | 'd' | 'l' | 'r' | 'b' | 'k';

export type PlayerDirection = 'up' | 'down' | 'left' | 'right';

export enum TileType {
  EMPTY = 0,
  WALL = 1,
  BRICK = 2,
}

export enum ItemType {
  BOMB_UP = 'bomb_up',
  POWER_UP = 'power_up',
  SPEED_UP = 'speed_up',
}

export enum GameMode {
  NORMAL = 'normal',
  BOSS = 'boss',
  BOT = 'bot',
  SURVIVAL = 'survival',
}

export enum PlayerType {
  HUMAN = 'human',
  BOT = 'bot',
}
export interface PlayerState {
  id: string;
  name: string;
  direction: PlayerDirection;
  position: { x: number; y: number };
  status: 'alive' | 'dying' | 'dead';
  isInvincible: boolean;
  invincibilityTicksLeft: number;
  speed: number;
  bombLimit: number;
  bombsPlaced: number;
  bombPower: number;
  score: number;
  teamId: string;
  teamName: string;
  sprite: number;
  dyingTimeLeft: number;
  isStunned: boolean;
  stunTicksLeft: number;
}

export interface PlayerStatePayload {
  id: string;
  n: string; // name
  d: PlayerDirection; // direction
  p: { x: number; y: number }; // position (quantized to integers * 100)
  s: 'alive' | 'dying' | 'dead'; // status
  sp: number; // speed
  bl: number; // bombLimit
  bp: number; // bombsPlaced
  pow: number; // bombPower
  sc: number; // score
  tid: string; // teamId
  tn: string; // teamName
  dtl: number; // dyingTimeLeft
  ist?: boolean; // isStunned
  stl?: number; // stunTicksLeft
}

export interface BombStatePayload {
  id: string;
  o: string; // ownerId
  p: { x: number; y: number }; // position
  c: number; // countdownTicks
  pow: number; // power
  es: boolean; // isExplodingSoon
  imv?: boolean; // isMoving
  kid?: string; // kickerId
  md?: { x: number; y: number }; // moveDirection
  mdl?: number; // moveDistanceLeft
}

export interface ItemStatePayload {
  id: string;
  t: ItemType; // type
  p: { x: number; y: number }; // position
}

export interface BombState {
  id: string;
  ownerId: string;
  position: { x: number; y: number };
  countdownTicks: number;
  power: number;
  isExplodingSoon: boolean;
  isMoving?: boolean;
  kickerId?: string;
  moveDirection?: { x: number; y: number };
  moveDistanceLeft?: number;
  moveProgress?: number;
  startPosition?: { x: number; y: number };
}

export interface ItemState {
  id: string;
  type: ItemType;
  position: { x: number; y: number };
}

export interface GameMap {
  width: number;
  height: number;
  tiles: TileType[][];
  type: 'cold' | 'hot';
}

export interface S2C_TickUpdate {
  tag: 'tick' | 'bomb_placed' | 'bomb_exploding_soon' | 'player_died' | 'game_over';
  tick: number;
  gameStatus: 'waiting' | 'running' | 'finished';
  remainingTime: number;
  type: 'game_state';
  players: PlayerState[];
  bombs: BombState[];
  items: ItemState[];

  map: {
    width: number;
    height: number;
    tiles: TileType[][];
  };
}

export interface S2C_InitialState {
  tag: 'tick' | 'bomb_placed' | 'bomb_exploding_soon' | 'player_died' | 'game_over';
  tick: number;
  gameStatus: 'waiting' | 'running' | 'finished';
  gameMode: GameMode;
  remainingTime: number;
  type: 'initial_state';
  players: PlayerState[];
  bombs: BombState[];
  items: ItemState[];
  map: {
    width: number;
    height: number;
    tiles: TileType[][];
    type: 'cold' | 'hot';
  };
}

export interface S2C_TickDelta {
  tag: 'tick' | 'bomb_placed' | 'bomb_exploding_soon' | 'player_died' | 'game_over';
  tick: number;
  gameStatus?: 'waiting' | 'running' | 'finished';
  remainingTime?: number;
  type: 'tick_delta';
  players?: PlayerStatePayload[];
  bombs?: BombStatePayload[];
  items?: ItemStatePayload[];
  destroyedBricks?: { x: number; y: number }[];
  destroyedItems?: string[];
}

export interface PoolStats {
  available: number;
  active: number;
  total: number;
}

export interface SpatialGridStats {
  totalCells: number;
  totalEntities: number;
  averageEntitiesPerCell: number;
  gridDimensions: {
    width: number;
    height: number;
  };
}

export interface GamePerformanceMetrics {
  tickDuration: number;
  memoryUsage: {
    bombPool: PoolStats;
    itemPool: PoolStats;
    spatialGrid: SpatialGridStats;
  };
  entityCounts: {
    players: number;
    bombs: number;
    items: number;
  };
}

export interface C2S_ControlGhost {
  type: 'control_ghost';
  data: {
    x: number;
    y: number;
  };
}
