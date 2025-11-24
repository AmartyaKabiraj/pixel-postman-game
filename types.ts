

export type Vector2 = { x: number; y: number };

export enum EntityType {
  PLAYER = 'PLAYER',
  HOUSE = 'HOUSE',
  CAR = 'CAR',
  PUDDLE = 'PUDDLE',
  POWERUP = 'POWERUP',
  PARTICLE = 'PARTICLE',
  TREE = 'TREE',
  STREET_LIGHT = 'STREET_LIGHT',
  TEXT_POPUP = 'TEXT_POPUP'
}

export enum TileType {
  ROAD = 0,
  GRASS = 1,
  HOUSE = 2,
  GARDEN = 3,
  DRIVEWAY = 4,
  FOOTPATH = 5,
  WATER = 6
}

export enum PowerUpType {
  COFFEE = 'COFFEE', // Boost Charge
  TRAFFIC_LIGHT = 'TRAFFIC_LIGHT', // Freeze Traffic
  CLOCK = 'CLOCK', // +Time
  RAINCOAT = 'RAINCOAT' // Puddle Immunity
}

export enum CarState {
  PARKED = 'PARKED',
  MERGING = 'MERGING',
  DRIVING = 'DRIVING',
  RETURNING = 'RETURNING'
}

export interface Entity {
  id: string;
  type: EntityType;
  pos: Vector2;
  size: Vector2;
  color?: string;
}

export interface TextPopup extends Entity {
  text: string;
  life: number;
  velocity: Vector2;
  color: string;
  fontSize: number;
}

export interface Puddle extends Entity {
  points: Vector2[];
}

export interface Player extends Entity {
  velocity: Vector2;
  speed: number;
  isBoosting: boolean;
  boostTimer: number;
  boostCharge: number;
  boostUnlocked: boolean;
  frame: number;
  direction: 'left' | 'right' | 'up' | 'down';
  stunned: number;
  buffs: {
    puddleImmunity: number; // time remaining
  };
  health: number;
  maxHealth: number;
  invulnerabilityTimer: number;
}

export interface House extends Entity {
  isTarget: boolean;
  doorPos: Vector2;
  facing: 'up' | 'down' | 'left' | 'right';
  gardenPos: Vector2;
  gardenSize: Vector2;
  drivewayPos: Vector2;
  drivewaySize: Vector2;
  roofColor: string;
  wallColor: string;
  style: number; // 0-3: Different architectural styles
  shape: 'rect' | 'L';
  cutoutCorner?: 'tl' | 'tr' | 'bl' | 'br'; // For L-shapes: which corner is missing
}

export interface Car extends Entity {
  velocity: Vector2;
  speed: number;
  frozenTimer: number;
  direction: 'up' | 'down' | 'left' | 'right';
  state: CarState;
  homePos: Vector2; // Origin driveway position for recycling
}

export interface PowerUp extends Entity {
  kind: PowerUpType;
  life?: number; // Time remaining in seconds
  maxLife?: number;
}

export interface Particle extends Entity {
  velocity: Vector2;
  life: number;
  color: string;
}

export interface GameState {
  isPlaying: boolean;
  isGameOver: boolean;
  score: number;
  timer: number;
  deliveries: number;
  lastDeliveryTime: number;
  trafficPauseTimer: number;
  map: TileType[][];
  vRoads: number[]; // X coordinates of vertical roads
  hRoads: number[]; // Y coordinates of horizontal roads
  entities: {
    player: Player;
    houses: House[];
    cars: Car[];
    puddles: Puddle[];
    powerups: PowerUp[];
    particles: Particle[];
    staticObjects: Entity[];
    textPopups: TextPopup[];
  };
  camera: Vector2;
}