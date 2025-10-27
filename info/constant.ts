import { TileType, ItemType } from './index';

export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
} as const;

export const ACTION_TO_DIRECTION = {
  u: DIRECTIONS.UP,
  d: DIRECTIONS.DOWN,
  l: DIRECTIONS.LEFT,
  r: DIRECTIONS.RIGHT,
} as const;

export const PLAYER_TO_DIRECTION = {
  up: DIRECTIONS.UP,
  down: DIRECTIONS.DOWN,
  left: DIRECTIONS.LEFT,
  right: DIRECTIONS.RIGHT,
} as const;

export const TILE_WALKABLE = new Set([TileType.EMPTY]);
export const TILE_DESTRUCTIBLE = new Set([TileType.BRICK]);
export const TILE_INDESTRUCTIBLE = new Set([TileType.WALL]);

export const ITEM_EFFECTS = {
  [ItemType.BOMB_UP]: { bombLimit: 1 },
  [ItemType.POWER_UP]: { bombPower: 1 },
  [ItemType.SPEED_UP]: { speed: 0.25 },
} as const;

export const EXPLOSION_DIRECTIONS = [DIRECTIONS.UP, DIRECTIONS.DOWN, DIRECTIONS.LEFT, DIRECTIONS.RIGHT] as const;
