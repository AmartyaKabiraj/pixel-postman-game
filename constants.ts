

import { PowerUpType } from "./types";

// Display Scaling
export const TILE_SIZE = 32; // Visual tile size
export const MAP_WIDTH = 50; // in tiles
export const MAP_HEIGHT = 30; // in tiles

// Road Generation Layout
export const ROAD_INTERVAL_X = 10;
export const ROAD_INTERVAL_Y = 6;
export const ROAD_WIDTH_TILES = 2;

// Colors (Retro Pastel Palette)
export const COLORS = {
  GRASS: '#8db880',
  GRASS_ALT: '#82ad75',
  ROAD: '#555555', // Darker asphalt
  ROAD_MARKING: '#ffffff',
  FOOTPATH: '#a8a8a8', // Concrete sidewalk
  HOUSE_WALL: '#e8dcb5',
  HOUSE_ROOF: '#b86f50',
  HOUSE_ROOF_DARK: '#8f563b',
  HOUSE_ROOF_LIGHT: '#d68e6e',
  DRIVEWAY: '#999999', // Concrete
  GARDEN: '#4d8f3e', // Darker green vegetation
  WATER: '#4fa4b8',
  WATER_RIPPLE: '#a8e6f0',
  POOL_EDGE: '#d0d0d0',
  PLAYER: '#4d9be6',
  PLAYER_ACCENT: '#2a5d8f',
  CAR: '#e64d4d', // Red Sports Car
  CAR_WINDSHIELD: '#8fd3ff',
  CAR_LIGHTS: '#fff700',
  PUDDLE: '#639bff',
  UI_BG: '#222034',
  UI_BORDER: '#ffffff',
  TEXT: '#cbdbfc',
  TARGET_GLOW: '#fbf236',
  TREE: '#2d5a27',
  TREE_TRUNK: '#4a3c31',
  STREET_LIGHT_POLE: '#444444',
  STREET_LIGHT_BULB: '#ffeb3b',
};

export const WALL_COLORS = [
  '#e8dcb5', // Cream
  '#d6e8b5', // Sage
  '#b5d6e8', // Pale Blue
  '#e8b5c2', // Dusty Rose
  '#dddddd', // Light Grey
  '#e8ceb5'  // Beige
];

export const POWERUP_COLORS: Record<PowerUpType, string> = {
  [PowerUpType.COFFEE]: '#6f4e37',
  [PowerUpType.TRAFFIC_LIGHT]: '#333333',
  [PowerUpType.CLOCK]: '#ffffff',
  [PowerUpType.RAINCOAT]: '#f4d03f',
};

// Gameplay
export const INITIAL_TIME = 150;
export const PLAYER_SPEED = 4;
export const BOOST_SPEED = 8;
export const CAR_SPEED = 3.5;
export const COMBO_TIMEOUT = 3000; // ms
export const MAX_BOOST_CHARGE = 4;

export const MAP_PIXEL_WIDTH = MAP_WIDTH * TILE_SIZE;
export const MAP_PIXEL_HEIGHT = MAP_HEIGHT * TILE_SIZE;