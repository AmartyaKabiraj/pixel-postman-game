import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  GameState, EntityType, Player, House, Vector2, Car, PowerUpType, Particle, Entity, TileType, CarState, Puddle, TextPopup, Projectile
} from '../types';
import { 
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, COLORS, MAP_PIXEL_WIDTH, MAP_PIXEL_HEIGHT,
  INITIAL_TIME, PLAYER_SPEED, BOOST_SPEED, CAR_SPEED, POWERUP_COLORS,
  WALL_COLORS, MAX_BOOST_CHARGE
} from '../constants';
import { audio } from '../audio';

interface GameLoopProps {
  input: { x: number; y: number; dash: boolean };
  isPaused: boolean;
  onScoreUpdate: (score: number, time: number, health: number, trafficTimer: number, puddleTimer: number, boostCharge: number, boostUnlocked: boolean) => void;
  onGameOver: (finalScore: number, screenshot: string | null, reason: string) => void;
}

export const GameLoop: React.FC<GameLoopProps> = ({ input, isPaused, onScoreUpdate, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const gameOverSentRef = useRef<boolean>(false);
  const gameOverReasonRef = useRef<string>('');
  
  const inputRef = useRef(input);
  const prevDashRef = useRef(false); // Track previous frame input for trigger logic
  const lastMoveSoundTime = useRef<number>(0);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  
  const state = useRef<GameState>({
    isPlaying: false,
    isGameOver: false,
    score: 0,
    timer: INITIAL_TIME,
    deliveries: 0,
    lastDeliveryTime: 0,
    trafficPauseTimer: 0,
    map: [],
    vRoads: [],
    hRoads: [],
    entities: {
      player: {
        id: 'p1', type: EntityType.PLAYER,
        pos: { x: 0, y: 0 }, size: { x: 14, y: 14 }, // Postman size
        velocity: { x: 0, y: 0 }, speed: PLAYER_SPEED,
        isBoosting: false, boostTimer: 0, boostCharge: 0, boostUnlocked: false, frame: 0, direction: 'right', stunned: 0,
        buffs: { puddleImmunity: 0 },
        health: 3, maxHealth: 3, invulnerabilityTimer: 0
      },
      houses: [],
      cars: [],
      puddles: [],
      powerups: [],
      particles: [],
      staticObjects: [],
      textPopups: [],
      projectiles: []
    },
    camera: { x: 0, y: 0 }
  });

  // Helper: Collision Detection (AABB)
  const checkCollision = (rect1: { pos: Vector2, size: Vector2 }, rect2: { pos: Vector2, size: Vector2 }) => {
    return (
      rect1.pos.x < rect2.pos.x + rect2.size.x &&
      rect1.pos.x + rect1.size.x > rect2.pos.x &&
      rect1.pos.y < rect2.pos.y + rect2.size.y &&
      rect1.pos.y + rect1.size.y > rect2.pos.y
    );
  };

  const getDistance = (p1: Vector2, p2: Vector2) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  // Check if a position (or rect) is valid on the map
  const isWalkable = (pos: Vector2, size: Vector2, map: TileType[][]) => {
    // Check all corners
    const points = [
      { x: pos.x, y: pos.y },
      { x: pos.x + size.x - 1, y: pos.y },
      { x: pos.x, y: pos.y + size.y - 1 },
      { x: pos.x + size.x - 1, y: pos.y + size.y - 1 },
    ];

    for (const p of points) {
        const tx = Math.floor(p.x / TILE_SIZE);
        const ty = Math.floor(p.y / TILE_SIZE);
        if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return false;
        const tile = map[ty][tx];
        
        // Postman only allowed on ROAD. 
        if (tile !== TileType.ROAD) return false;
    }
    return true;
  };

  // Determine allowed flow direction based on grid (Right Hand Traffic)
  // Even index Road = Down/Left, Odd index Road = Up/Right (Alternating)
  const getTrafficFlow = (tx: number, ty: number, vRoads: number[], hRoads: number[]) => {
    const flows: {x:number, y:number, d:'up'|'down'|'left'|'right'}[] = [];
    
    // Check Vertical Roads (Roads are 2 tiles wide, so tx or tx-1 could be the start)
    // Find index of road in vRoads
    const vIndex = vRoads.findIndex(v => tx === v || tx === v + 1);
    
    if (vIndex !== -1) {
        if (vIndex % 2 === 0) flows.push({ x: 0, y: 1, d: 'down' });
        else flows.push({ x: 0, y: -1, d: 'up' });
    }

    // Check Horizontal Roads
    const hIndex = hRoads.findIndex(h => ty === h || ty === h + 1);
    
    if (hIndex !== -1) {
        if (hIndex % 2 === 0) flows.push({ x: -1, y: 0, d: 'left' });
        else flows.push({ x: 1, y: 0, d: 'right' });
    }

    return flows;
  };

  // Find a random road tile
  const getRandomRoadPosition = (map: TileType[][], entitySize: Vector2, avoidEntities: Entity[] = []) : Vector2 => {
      let attempts = 0;
      while(attempts < 1000) {
          const tx = Math.floor(Math.random() * MAP_WIDTH);
          const ty = Math.floor(Math.random() * MAP_HEIGHT);
          if (map[ty][tx] === TileType.ROAD) {
             const pos = { x: tx * TILE_SIZE + 4, y: ty * TILE_SIZE + 4 }; // Offset slightly
             if (isWalkable(pos, entitySize, map)) {
                 let collision = false;
                 if (avoidEntities.length > 0) {
                     const rect = { pos, size: entitySize };
                     for (const ent of avoidEntities) {
                         if (checkCollision(rect, ent)) {
                             collision = true;
                             break;
                         }
                     }
                 }
                 if (!collision) return pos;
             }
          }
          attempts++;
      }
      return { x: 64, y: 64 }; // Fallback
  };

  const initGame = useCallback(() => {
    // 1. Generate Map Grid
    const map: TileType[][] = Array(MAP_HEIGHT).fill(null).map(() => Array(MAP_WIDTH).fill(TileType.GRASS));
    const houses: House[] = [];
    const staticObjects: Entity[] = [];
    const puddles: Puddle[] = [];

    // --- IRREGULAR ROAD GENERATION ---
    const vRoads: number[] = [];
    const hRoads: number[] = [];
    
    // Perimeters
    vRoads.push(2);
    vRoads.push(MAP_WIDTH - 4);
    hRoads.push(2);
    hRoads.push(MAP_HEIGHT - 4);

    // Generate random intervals for internal roads
    const addLines = (arr: number[], max: number, minGap: number) => {
        let last = arr[0];
        while(true) {
            // Random gap between minGap and minGap + variance
            const gap = minGap + Math.floor(Math.random() * 5); 
            const next = last + gap;
            if (next >= max - minGap) break; // Too close to end
            arr.push(next);
            last = next;
        }
        arr.sort((a,b) => a-b);
    };

    addLines(vRoads, MAP_WIDTH - 4, 10); 
    addLines(hRoads, MAP_HEIGHT - 4, 10);

    // Rasterize Roads
    vRoads.forEach(x => {
        for(let y=0; y<MAP_HEIGHT; y++) {
             map[y][x] = TileType.ROAD;
             map[y][x+1] = TileType.ROAD;
        }
    });
    hRoads.forEach(y => {
        for(let x=0; x<MAP_WIDTH; x++) {
             map[y][x] = TileType.ROAD;
             map[y+1][x] = TileType.ROAD;
        }
    });

    // --- HELPER: Check Road Adjacency ---
    const hasAdjacentRoad = (tx: number, ty: number) => {
        const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
        for(const [dx, dy] of dirs) {
            const nx = tx + dx;
            const ny = ty + dy;
            if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
                if (map[ny][nx] === TileType.ROAD) return true;
            }
        }
        return false;
    };

    // --- IDENTIFY PARK ZONE ---
    let parkBlock = { x: 0, y: 0, w: 0, h: 0 };
    const blocks: {x:number, y:number, w:number, h:number}[] = [];
    
    for(let i=0; i<vRoads.length-1; i++) {
        for(let j=0; j<hRoads.length-1; j++) {
            const bx = vRoads[i] + 2;
            const by = hRoads[j] + 2;
            const bw = vRoads[i+1] - vRoads[i] - 2;
            const bh = hRoads[j+1] - hRoads[j] - 2;
            
            if (bw >= 4 && bh >= 4) {
                blocks.push({ x: bx, y: by, w: bw, h: bh });
            }
        }
    }
    
    if (blocks.length > 0) {
        blocks.sort((a, b) => {
            const centerA = Math.abs((a.x + a.w/2) - MAP_WIDTH/2) + Math.abs((a.y + a.h/2) - MAP_HEIGHT/2);
            const centerB = Math.abs((b.x + b.w/2) - MAP_WIDTH/2) + Math.abs((b.y + b.h/2) - MAP_HEIGHT/2);
            const sizeA = a.w * a.h;
            const sizeB = b.w * b.h;
            return (sizeB - centerB*2) - (sizeA - centerA*2);
        });
        parkBlock = blocks[0];
    }

    // --- PLACE HOUSES ---
    const roofColors = [COLORS.HOUSE_ROOF, COLORS.HOUSE_ROOF_DARK, COLORS.HOUSE_ROOF_LIGHT, '#8a6f50', '#a35a40', '#50668a'];
    
    for(let y = 0; y < MAP_HEIGHT - 3; y++) {
        for(let x = 0; x < MAP_WIDTH - 4; x++) {
            
            // SKIP PARK
            if (x >= parkBlock.x - 1 && x < parkBlock.x + parkBlock.w + 1 &&
                y >= parkBlock.y - 1 && y < parkBlock.y + parkBlock.h + 1) {
                continue;
            }

            if (map[y][x] === TileType.GRASS) {
                const wTiles = 4;
                const hTiles = 3; 
                
                let facing: 'up'|'down'|'left'|'right' | null = null;
                // Check Above
                if (y > 0 && map[y-1][x] === TileType.ROAD) facing = 'up';
                // Check Below 
                else if (y + hTiles < MAP_HEIGHT && map[y+hTiles][x] === TileType.ROAD) facing = 'down';

                // Increased density (0.4 -> 0.1 skip chance)
                if (facing && Math.random() > 0.1) {
                    let clear = true;

                    if (y + hTiles >= MAP_HEIGHT || x + wTiles >= MAP_WIDTH) {
                        clear = false;
                    } else {
                        for(let dy=0; dy<hTiles; dy++) {
                            for(let dx=0; dx<wTiles; dx++) {
                                if (map[y+dy][x+dx] !== TileType.GRASS) clear = false;
                            }
                        }
                    }

                    if (clear) {
                        // determine house structure bounds (to handle setbacks from side roads)
                        let houseX = 0;
                        let houseY = 0;
                        let houseW = wTiles;
                        let houseH = hTiles;
                        
                        // Default setbacks (Front/Back)
                        if (facing === 'up') {
                            houseY = 1;
                            houseH -= 1;
                        } else { // down
                            houseH -= 1;
                        }

                        // Side/Corner setbacks (prevent overflow to sidewalk)
                        // Left
                        if (hasAdjacentRoad(x, y + 1)) {
                            houseX += 1;
                            houseW -= 1;
                        }
                        // Right
                        if (hasAdjacentRoad(x + wTiles - 1, y + 1)) {
                            houseW -= 1;
                        }
                        // Top (if not front)
                        if (facing !== 'up' && hasAdjacentRoad(x + 1, y)) {
                            houseY += 1;
                            houseH -= 1;
                        }
                        // Bottom (if not front)
                        if (facing !== 'down' && hasAdjacentRoad(x + 1, y + hTiles - 1)) {
                             houseH -= 1;
                        }

                        // If house became too small due to constraints, skip structure but make it a garden lot
                        if (houseW < 2 || houseH < 1) {
                            houseW = 0; // No house structure
                        }

                        // Initialize Lot as Garden
                        for(let dy=0; dy<hTiles; dy++) {
                             for(let dx=0; dx<wTiles; dx++) {
                                 map[y+dy][x+dx] = TileType.GARDEN;
                             }
                        }

                        if (houseW > 0) {
                            const shapeType = Math.random() > 0.3 ? 'L' : 'rect';
                            const realW = houseW * TILE_SIZE;
                            const realH = houseH * TILE_SIZE;
                            const pos = { x: (x + houseX) * TILE_SIZE, y: (y + houseY) * TILE_SIZE };
                            
                            // Driveway aligns with new house width
                            // Standard driveway is on the right side of the structure
                            let drivewayCol = x + houseX + houseW - 1;
                            let drivewayPos = { x: drivewayCol * TILE_SIZE, y: pos.y };
                            let doorPos = { x: pos.x + realW/2, y: pos.y + (facing==='up'?0:realH) }; 
                            let cutoutCorner: 'tl'|'tr'|'bl'|'br' | undefined = undefined;

                            if (facing === 'down') {
                                drivewayPos = { x: drivewayCol * TILE_SIZE, y: pos.y + realH - TILE_SIZE };
                                doorPos = { x: pos.x + TILE_SIZE * 1.5, y: pos.y + realH - 8 };
                                if (shapeType === 'L') cutoutCorner = 'bl';
                            } else {
                                drivewayPos = { x: drivewayCol * TILE_SIZE, y: pos.y };
                                doorPos = { x: pos.x + TILE_SIZE * 1.5, y: pos.y + 8 };
                                if (shapeType === 'L') cutoutCorner = 'tl';
                            }

                            // Apply House Tiles to Map
                            for(let dy=0; dy<houseH; dy++) {
                                for(let dx=0; dx<houseW; dx++) {
                                    const tileX = x + houseX + dx;
                                    const tileY = y + houseY + dy;
                                    
                                    let isHousePart = true;

                                    if (shapeType === 'L') {
                                        const hDy = facing === 'up' ? dy - 1 : dy; // Visual fix for L logic offset?
                                        // Simple L logic relative to rect
                                        if (cutoutCorner === 'tl' && dx < 2 && dy < 1) isHousePart = false;
                                        if (cutoutCorner === 'tr' && dx >= houseW-2 && dy < 1) isHousePart = false;
                                        if (cutoutCorner === 'bl' && dx < 2 && dy >= houseH-1) isHousePart = false;
                                        if (cutoutCorner === 'br' && dx >= houseW-2 && dy >= houseH-1) isHousePart = false;
                                    }

                                    if (isHousePart) map[tileY][tileX] = TileType.HOUSE;
                                }
                            }
                            
                            // Apply Driveway
                            for(let dy=0; dy<hTiles; dy++) {
                                if (drivewayCol < MAP_WIDTH) {
                                    map[y+dy][drivewayCol] = TileType.DRIVEWAY;
                                }
                            }

                            houses.push({
                                id: `h_${x}_${y}`,
                                type: EntityType.HOUSE,
                                pos: pos,
                                size: { x: realW, y: realH },
                                facing: facing,
                                isTarget: false,
                                doorPos: doorPos,
                                gardenPos: { x: x * TILE_SIZE, y: y * TILE_SIZE },
                                gardenSize: { x: wTiles * TILE_SIZE, y: hTiles * TILE_SIZE },
                                drivewayPos: drivewayPos,
                                drivewaySize: { x: TILE_SIZE, y: TILE_SIZE },
                                roofColor: roofColors[Math.floor(Math.random() * roofColors.length)],
                                wallColor: WALL_COLORS[Math.floor(Math.random() * WALL_COLORS.length)],
                                style: Math.floor(Math.random() * 4), 
                                shape: shapeType,
                                cutoutCorner: cutoutCorner
                            });
                        }
                    }
                }
            }
        }
    }
    
    // --- FILL REMAINING SPACE (GARDENS, POOLS, BACKYARDS) ---
    // Iterate through the urban area and convert all internal GRASS to GARDEN/BACKYARD content
    // excluding the Park.
    const cityMinX = vRoads[0];
    const cityMaxX = vRoads[vRoads.length-1] + 1;
    const cityMinY = hRoads[0];
    const cityMaxY = hRoads[hRoads.length-1] + 1;

    for (let y = cityMinY; y <= cityMaxY; y++) {
        for (let x = cityMinX; x <= cityMaxX; x++) {
            // Skip park
            if (x >= parkBlock.x && x < parkBlock.x + parkBlock.w &&
                y >= parkBlock.y && y < parkBlock.y + parkBlock.h) {
                continue;
            }

            if (map[y][x] === TileType.GRASS) {
                // Determine if it's "inside" a block (surrounded by things other than road on immediate sides or near houses)
                // For simplicity, everything inside the road grid that isn't road is garden/property
                map[y][x] = TileType.GARDEN;
            }
        }
    }

    // --- DECORATE GARDENS (POOLS, TREES) ---
    for (let y = cityMinY; y <= cityMaxY; y++) {
        for (let x = cityMinX; x <= cityMaxX; x++) {
             if (map[y][x] === TileType.GARDEN) {
                 // Try to place a Pool (3x2)
                 if (Math.random() < 0.05) { // 5% chance per tile start
                     let canPool = true;
                     const pw = 3, ph = 2;
                     if (x + pw > cityMaxX || y + ph > cityMaxY) canPool = false;
                     else {
                         for(let dy=0; dy<ph; dy++) {
                             for(let dx=0; dx<pw; dx++) {
                                 if (map[y+dy][x+dx] !== TileType.GARDEN) canPool = false;
                                 // Check if adjacent to road (preserve sidewalk)
                                 if (hasAdjacentRoad(x+dx, y+dy)) canPool = false;
                             }
                         }
                     }
                     
                     if (canPool) {
                         for(let dy=0; dy<ph; dy++) {
                             for(let dx=0; dx<pw; dx++) {
                                 map[y+dy][x+dx] = TileType.WATER;
                             }
                         }
                     }
                 }
                 // Try to place Trees
                 else if (Math.random() < 0.15) {
                     const centerX = x * TILE_SIZE + TILE_SIZE / 2;
                     const centerY = y * TILE_SIZE + TILE_SIZE / 2;
                     staticObjects.push({
                        id: `tree_backyard_${x}_${y}`,
                        type: EntityType.TREE,
                        pos: { x: centerX - 10, y: centerY - 10 },
                        size: { x: 20, y: 20 },
                     });
                 }
                 // Try to place Patio (Footpath patch)
                 else if (Math.random() < 0.05) {
                     map[y][x] = TileType.FOOTPATH;
                 }
             }
        }
    }

    // --- GENERATE FOOTPATHS & DECORATION (Roadside) ---
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (map[y][x] === TileType.GARDEN || map[y][x] === TileType.GRASS) {
                // If adjacent to road, make footpath
                let hasRoad = false;
                const neighbors = [[0,1], [0,-1], [1,0], [-1,0]];
                for(const [dy, dx] of neighbors) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if(ny>=0 && ny<MAP_HEIGHT && nx>=0 && nx<MAP_WIDTH && map[ny][nx] === TileType.ROAD) {
                        hasRoad = true;
                        break;
                    }
                }

                if (hasRoad) { 
                    map[y][x] = TileType.FOOTPATH;
                    const centerX = x * TILE_SIZE + TILE_SIZE / 2;
                    const centerY = y * TILE_SIZE + TILE_SIZE / 2;
                    
                    // Street Trees
                    if (Math.random() > 0.8) {
                        staticObjects.push({
                            id: `tree_${x}_${y}`,
                            type: EntityType.TREE,
                            pos: { x: centerX - 10, y: centerY - 10 },
                            size: { x: 20, y: 20 },
                        });
                    }
                }
            }
        }
    }

    // --- DECORATE PARK ---
    if (parkBlock.w > 0) {
        // Add a big pond in center of park?
        const pondW = Math.min(parkBlock.w - 2, 4);
        const pondH = Math.min(parkBlock.h - 2, 3);
        const pondX = parkBlock.x + Math.floor((parkBlock.w - pondW)/2);
        const pondY = parkBlock.y + Math.floor((parkBlock.h - pondH)/2);
        
        // Puddle logic for pond
        const points: Vector2[] = [];
        const wPx = pondW * TILE_SIZE;
        const hPx = pondH * TILE_SIZE;
        const segments = 10;
        const angleStep = (Math.PI * 2) / segments;
        for(let s=0; s<segments; s++) {
             const angle = s * angleStep;
             const rX = (wPx/2) * (0.8 + Math.random() * 0.2); 
             const rY = (hPx/2) * (0.8 + Math.random() * 0.2);
             points.push({ x: Math.cos(angle) * rX, y: Math.sin(angle) * rY });
        }

        puddles.push({
            id: 'park_pond', type: EntityType.PUDDLE,
            pos: { x: pondX * TILE_SIZE, y: pondY * TILE_SIZE },
            size: { x: wPx, y: hPx },
            points: points
        });

        for(let y=parkBlock.y; y<parkBlock.y+parkBlock.h; y++) {
            for(let x=parkBlock.x; x<parkBlock.x+parkBlock.w; x++) {
                if (map[y][x] !== TileType.FOOTPATH) map[y][x] = TileType.GARDEN;

                // Don't place trees in pond
                if (x >= pondX && x < pondX + pondW && y >= pondY && y < pondY + pondH) continue;

                if (Math.random() > 0.6) {
                    staticObjects.push({
                        id: `tree_park_${x}_${y}`,
                        type: EntityType.TREE,
                        pos: { x: x*TILE_SIZE + 6, y: y*TILE_SIZE + 6 },
                        size: { x: 20, y: 20 }
                    });
                }
            }
        }
    }

    if (houses.length > 0) {
      houses[Math.floor(Math.random() * houses.length)].isTarget = true;
    }

    let startPos = { x: 64, y: 64 };
    // Start on a valid road
    for(let y=0; y<MAP_HEIGHT; y++) {
        for(let x=0; x<MAP_WIDTH; x++) {
            if (map[y][x] === TileType.ROAD) {
                startPos = { x: x*TILE_SIZE + 10, y: y*TILE_SIZE + 10 };
                break;
            }
        }
    }

    // --- RANDOM PUDDLES ---
    for(let i=0; i<10; i++) {
        const w = 15 + Math.random() * 13; 
        const h = 12 + Math.random() * 10;
        const pos = getRandomRoadPosition(map, {x: w, y: h}, puddles);
        
        const points: Vector2[] = [];
        const segments = 8 + Math.floor(Math.random() * 4); 
        const angleStep = (Math.PI * 2) / segments;
        for(let s=0; s<segments; s++) {
             const angle = s * angleStep;
             const rX = (w/2) * (0.6 + Math.random() * 0.4); 
             const rY = (h/2) * (0.6 + Math.random() * 0.4);
             points.push({ x: Math.cos(angle) * rX, y: Math.sin(angle) * rY });
        }
        puddles.push({
            id: `pud_${i}`, type: EntityType.PUDDLE,
            pos: pos, size: { x: w, y: h }, points: points
        });
    }

    // Spawn Cars at Houses
    const cars: Car[] = [];
    houses.forEach((h, i) => {
        if (Math.random() > 0.5) {
            const carX = h.drivewayPos.x + 6;
            const carY = h.drivewayPos.y + 6;
            
            cars.push({
                id: `car_${i}`,
                type: EntityType.CAR,
                pos: { x: carX, y: carY },
                size: { x: 22, y: 12 },
                velocity: { x: 0, y: 0 },
                speed: CAR_SPEED,
                frozenTimer: 0,
                direction: h.facing === 'up' ? 'down' : 'up',
                state: CarState.PARKED,
                homePos: { x: carX, y: carY }
            });
        }
    });

    state.current = {
      isPlaying: true,
      isGameOver: false,
      score: 0,
      timer: INITIAL_TIME,
      deliveries: 0,
      lastDeliveryTime: performance.now(),
      trafficPauseTimer: 0,
      map,
      vRoads,
      hRoads,
      entities: {
        player: { 
          ...state.current.entities.player, 
          pos: startPos, 
          size: { x: 14, y: 14 },
          health: 3, 
          maxHealth: 3, 
          invulnerabilityTimer: 0, 
          buffs: { puddleImmunity: 0 },
          boostCharge: 0,
          boostUnlocked: false,
          boostTimer: 0,
          isBoosting: false
        },
        houses,
        cars,
        puddles,
        powerups: [],
        particles: [],
        staticObjects,
        textPopups: [],
        projectiles: []
      },
      camera: { x: 0, y: 0 }
    };
    gameOverSentRef.current = false;
    gameOverReasonRef.current = '';
    prevDashRef.current = false;
  }, []);

  const activateCar = () => {
    const s = state.current;
    const parkedCars = s.entities.cars.filter(c => c.state === CarState.PARKED);
    if (parkedCars.length > 0) {
        const car = parkedCars[Math.floor(Math.random() * parkedCars.length)];
        car.state = CarState.MERGING;
        
        if (s.trafficPauseTimer > 0) {
            car.frozenTimer = s.trafficPauseTimer;
        }

        const tileX = Math.floor(car.pos.x / TILE_SIZE);
        const tileY = Math.floor(car.pos.y / TILE_SIZE);
        
        // Robust check for any adjacent road
        if (tileY+1 < MAP_HEIGHT && s.map[tileY+1][tileX] === TileType.ROAD) car.direction = 'down';
        else if (tileY-1 >= 0 && s.map[tileY-1][tileX] === TileType.ROAD) car.direction = 'up';
        else if (tileX+1 < MAP_WIDTH && s.map[tileY][tileX+1] === TileType.ROAD) car.direction = 'right';
        else if (tileX-1 >= 0 && s.map[tileY][tileX-1] === TileType.ROAD) car.direction = 'left';
    }
  };

  const spawnTextPopup = (text: string, pos: Vector2, color: string) => {
    state.current.entities.textPopups.push({
        id: `txt_${Date.now()}_${Math.random()}`,
        type: EntityType.TEXT_POPUP,
        pos: { x: pos.x, y: pos.y - 10 },
        size: { x: 0, y: 0 },
        text,
        life: 1.0,
        velocity: { x: 0, y: -20 },
        color,
        fontSize: 16
    });
  };

  const update = (deltaTime: number) => {
    const s = state.current;
    if (!s.isPlaying || s.isGameOver) return;
    const currentInput = inputRef.current;

    s.timer -= deltaTime;
    if (s.timer <= 0) {
      s.isGameOver = true;
      gameOverReasonRef.current = 'TIMEOUT';
      return;
    }

    if (s.trafficPauseTimer > 0) {
        s.trafficPauseTimer -= deltaTime;
    }

    let spawnChance = 0.01; // Increased spawn rate
    
    if (s.timer <= 60) {
        const intensity = 1 - (Math.max(0, s.timer) / 60);
        spawnChance = 0.01 + (intensity * 0.04);
    }

    if (Math.random() < spawnChance) {
        activateCar();
    }
    
    if (Math.random() < 0.005 && s.entities.powerups.length < 5) {
         const types = [PowerUpType.COFFEE, PowerUpType.TRAFFIC_LIGHT, PowerUpType.CLOCK, PowerUpType.RAINCOAT];
         const kind = types[Math.floor(Math.random() * types.length)];
         const pos = getRandomRoadPosition(s.map, {x:16, y:16}, s.entities.puddles);
         const life = 10.0; 
         
         s.entities.powerups.push({
             id: `pup_${Date.now()}_${Math.random()}`,
             type: EntityType.POWERUP,
             kind,
             pos: pos,
             size: { x: 16, y: 16 },
             life: life,
             maxLife: life
        });
    }

    const p = s.entities.player;

    // --- Player Movement ---
    if (p.stunned > 0) {
        p.stunned -= deltaTime;
        p.velocity = { x: 0, y: 0 };
    } else {
        let currentSpeed = p.speed;
        if (p.isBoosting) currentSpeed = BOOST_SPEED;

        const desiredX = currentInput.x * currentSpeed;
        const desiredY = currentInput.y * currentSpeed;
        
        // Sound for movement (subtle tick)
        if (Math.abs(desiredX) > 0.1 || Math.abs(desiredY) > 0.1) {
            if (performance.now() - lastMoveSoundTime.current > 200) {
                audio.playMoveTick();
                lastMoveSoundTime.current = performance.now();
            }
        }

        if (Math.abs(currentInput.x) > 0.1) p.direction = currentInput.x > 0 ? 'right' : 'left';
        if (Math.abs(currentInput.y) > 0.1) p.direction = currentInput.y > 0 ? 'down' : 'up';

        // Boost Logic
        const isDashPressed = currentInput.dash;
        const isDashTriggered = isDashPressed && !prevDashRef.current;
        prevDashRef.current = isDashPressed;

        if (isDashTriggered && p.boostCharge >= 1 && !p.isBoosting) {
            p.boostCharge -= 1;
            p.isBoosting = true;
            p.boostTimer = 0.5; // Short burst duration
            audio.playDash(); // SFX
            for(let i=0; i<5; i++) {
                s.entities.particles.push({
                    id: `part_${Math.random()}`, type: EntityType.PARTICLE,
                    pos: { ...p.pos }, size: { x: 4, y: 4 },
                    velocity: { x: (Math.random()-0.5)*50, y: (Math.random()-0.5)*50 },
                    life: 0.5, color: '#ffffff'
                });
            }
        }

        if (p.isBoosting) {
             p.boostTimer -= deltaTime;
             if (p.boostTimer <= 0) p.isBoosting = false;
        }

        const checkMove = (nextPos: Vector2) => {
            if (!isWalkable(nextPos, p.size, s.map)) return false;
            const playerRect = { pos: nextPos, size: p.size };
            for(const obj of s.entities.staticObjects) {
                if (checkCollision(playerRect, obj)) return false;
            }
            return true;
        };

        let nextPos = { x: p.pos.x + desiredX, y: p.pos.y };
        if (checkMove(nextPos)) p.pos.x = nextPos.x;

        nextPos = { x: p.pos.x, y: p.pos.y + desiredY };
        if (checkMove(nextPos)) p.pos.y = nextPos.y;

        let inPuddle = false;
        s.entities.puddles.forEach(pud => {
            if (checkCollision(p, pud as Entity)) inPuddle = true;
        });
        
        // Puddle immunity check
        if (inPuddle && !p.isBoosting && p.buffs.puddleImmunity <= 0) {
            if (p.invulnerabilityTimer <= 0) {
                p.health -= 1;
                p.invulnerabilityTimer = 2.0; 
                audio.playSplash(); // SFX
                
                const texts = ["SPLASH!", "WET SOCKS!", "SLIPPERY!"];
                spawnTextPopup(texts[Math.floor(Math.random()*texts.length)], p.pos, '#639bff');

                if (p.health <= 0) {
                    s.isGameOver = true;
                    gameOverReasonRef.current = 'HEALTH';
                    return;
                }
            }
        }
    }
    
    if (p.invulnerabilityTimer > 0) {
        p.invulnerabilityTimer -= deltaTime;
    }

    if (p.buffs.puddleImmunity > 0) p.buffs.puddleImmunity -= deltaTime;

    // --- Delivery Logic ---
    const targetHouse = s.entities.houses.find(h => h.isTarget);
    if (targetHouse) {
        const dist = getDistance(p.pos, targetHouse.doorPos);
        if (dist < 80) {
            s.score += 1;
            s.deliveries++;
            audio.playDelivery(); // SFX
            
            spawnTextPopup("DELIVERED!", targetHouse.doorPos, '#fbf236');

            const timeSinceLast = performance.now() / 1000 - s.lastDeliveryTime;
            let bonusTime = 2;
            if (timeSinceLast < 5) bonusTime += 2; 
            s.timer = Math.min(s.timer + bonusTime, INITIAL_TIME); 
            s.lastDeliveryTime = performance.now() / 1000;

            // Spawn Projectile (Visual of throw)
            s.entities.projectiles.push({
                id: `proj_${Date.now()}`,
                type: EntityType.PROJECTILE,
                pos: { x: p.pos.x + 7, y: p.pos.y + 7 },
                size: { x: 8, y: 5 },
                startPos: { x: p.pos.x + 7, y: p.pos.y + 7 },
                targetPos: { x: targetHouse.doorPos.x + 6, y: targetHouse.doorPos.y + 6 },
                progress: 0,
                duration: 0.3, // 300ms flight time
                arcHeight: 25,
                rotation: Math.random() * Math.PI * 2
            });

            targetHouse.isTarget = false;
            let nextHouse = s.entities.houses[Math.floor(Math.random() * s.entities.houses.length)];
            while(nextHouse === targetHouse) {
                nextHouse = s.entities.houses[Math.floor(Math.random() * s.entities.houses.length)];
            }
            nextHouse.isTarget = true;
            
            activateCar();
        }
    }

    // --- Update Projectiles ---
    s.entities.projectiles = s.entities.projectiles.filter(proj => {
        proj.progress += deltaTime / proj.duration;
        proj.rotation += deltaTime * 10; 
        
        if (proj.progress >= 1) {
            // Reached target
            // Spawn Confetti here
            for(let i=0; i<10; i++) {
                s.entities.particles.push({
                    id: `confetti_${Math.random()}`, type: EntityType.PARTICLE,
                    pos: { ...proj.targetPos }, size: { x: 3, y: 3 },
                    velocity: { x: (Math.random()-0.5)*100, y: (Math.random()-0.5)*100 - 50 },
                    life: 1.0, color: COLORS.TARGET_GLOW
                });
            }
            return false;
        }
        return true;
    });

    // --- Car Logic ---
    for (const car of s.entities.cars) {
        if (car.frozenTimer > 0) {
            car.frozenTimer -= deltaTime;
            continue;
        }

        if (car.state === CarState.PARKED) continue;

        // RETURNING STATE: Moving to parking spot
        if (car.state === CarState.RETURNING) {
            const tx = Math.floor((car.pos.x + car.size.x/2) / TILE_SIZE);
            const ty = Math.floor((car.pos.y + car.size.y/2) / TILE_SIZE);
            
            if (s.map[ty][tx] === TileType.DRIVEWAY) {
                const speed = car.speed * 0.5;
                if (car.direction === 'right') car.pos.x += speed;
                else if (car.direction === 'left') car.pos.x -= speed;
                else if (car.direction === 'up') car.pos.y -= speed;
                else if (car.direction === 'down') car.pos.y += speed;

                const nextTx = Math.floor((car.pos.x + car.size.x/2 + (car.direction==='right'?speed*5:car.direction==='left'?-speed*5:0)) / TILE_SIZE);
                const nextTy = Math.floor((car.pos.y + car.size.y/2 + (car.direction==='down'?speed*5:car.direction==='up'?-speed*5:0)) / TILE_SIZE);
                
                if (nextTx < 0 || nextTx >= MAP_WIDTH || nextTy < 0 || nextTy >= MAP_HEIGHT || s.map[nextTy][nextTx] !== TileType.DRIVEWAY) {
                    car.state = CarState.PARKED;
                }
            } else {
                car.pos.x += car.velocity.x;
                car.pos.y += car.velocity.y;
            }
            continue;
        }

        if (car.state === CarState.MERGING) {
            const speed = car.speed * 0.5;
            if (car.direction === 'down') car.pos.y += speed;
            else if (car.direction === 'up') car.pos.y -= speed;
            else if (car.direction === 'left') car.pos.x -= speed;
            else if (car.direction === 'right') car.pos.x += speed;

            const cx = car.pos.x + car.size.x/2;
            const cy = car.pos.y + car.size.y/2;
            const tx = Math.floor(cx / TILE_SIZE);
            const ty = Math.floor(cy / TILE_SIZE);

            if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT && s.map[ty][tx] === TileType.ROAD) {
                car.state = CarState.DRIVING;
                car.pos.x = tx * TILE_SIZE + (TILE_SIZE - car.size.x)/2;
                car.pos.y = ty * TILE_SIZE + (TILE_SIZE - car.size.y)/2;
                
                const flows = getTrafficFlow(tx, ty, s.vRoads, s.hRoads);
                const bestFlow = flows[0];
                if (bestFlow) {
                    car.direction = bestFlow.d;
                    car.velocity = { x: bestFlow.x * car.speed, y: bestFlow.y * car.speed };
                }
            }
            if (checkCollision(p, car) && !p.isBoosting && p.invulnerabilityTimer <= 0) {
                 p.health -= 1;
                 p.invulnerabilityTimer = 2.0;
                 audio.playHit(); // SFX
                 const texts = ["OUCH!", "CRASH!", "BEEP BEEP!", "HEY!"];
                 spawnTextPopup(texts[Math.floor(Math.random()*texts.length)], p.pos, '#ff4d4d');
                 
                 if (p.health <= 0) {
                     s.isGameOver = true;
                     gameOverReasonRef.current = 'HEALTH';
                     return;
                 }
            }
            continue;
        }

        // --- DRIVING STATE ---
        const carCenterX = car.pos.x + car.size.x / 2;
        const carCenterY = car.pos.y + car.size.y / 2;
        const tileX = Math.floor(carCenterX / TILE_SIZE);
        const tileY = Math.floor(carCenterY / TILE_SIZE);
        
        const targetCenterX = tileX * TILE_SIZE + TILE_SIZE / 2;
        const targetCenterY = tileY * TILE_SIZE + TILE_SIZE / 2;
        const distToCenter = Math.abs(carCenterX - targetCenterX) + Math.abs(carCenterY - targetCenterY);

        if (distToCenter < car.speed) {
            // Turning Logic
            if (Math.random() < 0.1) { 
                const neighbors = [
                    { dx: 1, dy: 0, d: 'right' },
                    { dx: -1, dy: 0, d: 'left' },
                    { dx: 0, dy: 1, d: 'down' },
                    { dx: 0, dy: -1, d: 'up' }
                ];

                for(const n of neighbors) {
                    const nx = tileX + n.dx;
                    const ny = tileY + n.dy;
                    if(nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
                        if (s.map[ny][nx] === TileType.DRIVEWAY) {
                            car.state = CarState.RETURNING;
                            car.direction = n.d as any;
                            car.velocity = { x: n.dx * car.speed * 0.5, y: n.dy * car.speed * 0.5 };
                            car.pos.x = targetCenterX - car.size.x / 2;
                            car.pos.y = targetCenterY - car.size.y / 2;
                            break;
                        }
                    }
                }
                if (car.state === CarState.RETURNING) continue; 
            }

            const isRoad = (tx: number, ty: number) => {
                if(tx<0||tx>=MAP_WIDTH||ty<0||ty>=MAP_HEIGHT) return false;
                return s.map[ty][tx] === TileType.ROAD;
            };

            const allowedFlows = getTrafficFlow(tileX, tileY, s.vRoads, s.hRoads);
            const validOptions = allowedFlows.filter(flow => {
                const tx = tileX + flow.x;
                const ty = tileY + flow.y;
                if (!isRoad(tx, ty)) return false;
                if (flow.d !== car.direction) {
                    const ttx = tx + flow.x;
                    const tty = ty + flow.y;
                    if (!isRoad(ttx, tty)) return false;
                }
                return true;
            });

            if (validOptions.length === 0) {
                 // Dead end or error, teleport home
                 car.state = CarState.PARKED;
                 car.pos = { ...car.homePos };
                 car.velocity = { x: 0, y: 0 };
                 continue;
            }

            const reverseDir = car.direction === 'left' ? 'right' : car.direction === 'right' ? 'left' : car.direction === 'up' ? 'down' : 'up';
            let candidates = validOptions.filter(o => o.d !== reverseDir);
            if (candidates.length === 0) candidates = validOptions;

            if (candidates.length > 0) {
                 const straight = candidates.find(o => o.d === car.direction);
                 let choice = candidates[Math.floor(Math.random() * candidates.length)];
                 if (straight && Math.random() > 0.4) choice = straight;
                 
                 if (choice && choice.d !== car.direction) {
                      car.pos.x = targetCenterX - car.size.x / 2;
                      car.pos.y = targetCenterY - car.size.y / 2;
                      car.velocity = { x: choice.x * car.speed, y: choice.y * car.speed };
                      car.direction = choice.d;
                 } else if (choice) {
                      car.velocity = { x: choice.x * car.speed, y: choice.y * car.speed };
                 }
            }
        } else {
             if (car.direction === 'left' || car.direction === 'right') {
                 const diff = targetCenterY - (car.pos.y + car.size.y/2);
                 if (Math.abs(diff) > 1) car.pos.y += diff * 0.1;
             } else {
                 const diff = targetCenterX - (car.pos.x + car.size.x/2);
                 if (Math.abs(diff) > 1) car.pos.x += diff * 0.1;
             }
        }
        
        car.pos.x += car.velocity.x;
        car.pos.y += car.velocity.y;

        if (car.pos.x < 0 || car.pos.x > MAP_PIXEL_WIDTH || car.pos.y < 0 || car.pos.y > MAP_PIXEL_HEIGHT) {
             car.state = CarState.PARKED;
             car.pos = { ...car.homePos };
             car.velocity = { x: 0, y: 0 };
        }

        if (checkCollision(p, car) && p.stunned <= 0 && !p.isBoosting) {
            if (p.invulnerabilityTimer <= 0) {
                p.health -= 1;
                p.invulnerabilityTimer = 2.0;
                audio.playHit(); // SFX
                const texts = ["OUCH!", "CRASH!", "BEEP BEEP!", "HEY!"];
                spawnTextPopup(texts[Math.floor(Math.random()*texts.length)], p.pos, '#ff4d4d');

                if (p.health <= 0) {
                    s.isGameOver = true;
                    gameOverReasonRef.current = 'HEALTH';
                    return;
                }
            }
        }
    }

    s.entities.powerups = s.entities.powerups.filter(pup => {
        if (pup.life !== undefined) {
            pup.life -= deltaTime;
            if (pup.life <= 0) return false;
        }

        if (checkCollision(p, pup)) {
            audio.playPowerup(); // SFX
            switch(pup.kind) {
                case PowerUpType.COFFEE: 
                    // Refill boost charge
                    p.boostCharge = Math.min(p.boostCharge + 1, MAX_BOOST_CHARGE);
                    p.boostUnlocked = true;
                    // Heal
                    p.health = Math.min(p.health + 1, p.maxHealth); 
                    spawnTextPopup("RUN RECHARGE!", p.pos, '#6f4e37');
                    break;
                case PowerUpType.CLOCK: 
                    s.timer = Math.min(s.timer + 10, INITIAL_TIME); 
                    spawnTextPopup("+10 SEC", p.pos, '#ffffff');
                    break;
                case PowerUpType.TRAFFIC_LIGHT: 
                    s.entities.cars.forEach(c => c.frozenTimer = 10.0); 
                    s.trafficPauseTimer = 10.0;
                    spawnTextPopup("TRAFFIC STOPPED!", p.pos, '#ffcc00');
                    break;
                case PowerUpType.RAINCOAT:
                    p.buffs.puddleImmunity = 10.0;
                    spawnTextPopup("RAINCOAT!", p.pos, '#f4d03f');
                    break;
            }
            return false; 
        }
        return true;
    });

    s.entities.particles = s.entities.particles.filter(part => {
        part.life -= deltaTime;
        part.pos.x += part.velocity.x * deltaTime;
        part.pos.y += part.velocity.y * deltaTime;
        return part.life > 0;
    });

    s.entities.textPopups = s.entities.textPopups.filter(p => {
        p.life -= deltaTime;
        p.pos.x += p.velocity.x * deltaTime;
        p.pos.y += p.velocity.y * deltaTime;
        return p.life > 0;
    });

    s.camera.x = p.pos.x - window.innerWidth / 2;
    s.camera.y = p.pos.y - window.innerHeight / 2;
    s.camera.x = Math.max(0, Math.min(s.camera.x, MAP_PIXEL_WIDTH - window.innerWidth));
    s.camera.y = Math.max(0, Math.min(s.camera.y, MAP_PIXEL_HEIGHT - window.innerHeight));

    onScoreUpdate(s.score, s.timer, p.health, s.trafficPauseTimer, p.buffs.puddleImmunity, p.boostCharge, p.boostUnlocked);
  };

  const drawHouse = (ctx: CanvasRenderingContext2D, h: House) => {
        const rx = h.pos.x;
        const ry = h.pos.y;
        const rw = h.size.x;
        const rh = h.size.y;

        const drawWindows = (wx: number, wy: number, ww: number, wh: number) => {
            // Adjust based on style
            const style = h.style;
            ctx.fillStyle = '#445'; // Dark blue glass
            if (style === 2) ctx.fillStyle = '#8ce'; // Modern bright glass

            const winCount = ww > 64 ? 2 : 1;
            const winW = style === 1 ? 8 : style === 2 ? 24 : 12;
            const winH = style === 1 ? 20 : style === 2 ? 16 : 12;
            const yOffset = style === 1 ? 5 : 10;

            for(let i=0; i<winCount; i++) {
                // Position windows roughly centered in their half/section
                const sectionW = ww / winCount;
                const winX = wx + (sectionW * i) + (sectionW - winW) / 2;
                
                ctx.fillRect(winX, wy + yOffset, winW, winH);
                
                // Frames
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.strokeRect(winX, wy + yOffset, winW, winH);

                // Panes (if not modern)
                if (style !== 2) {
                     ctx.beginPath();
                     ctx.moveTo(winX + winW/2, wy + yOffset);
                     ctx.lineTo(winX + winW/2, wy + yOffset + winH);
                     if (style !== 1) {
                        ctx.moveTo(winX, wy + yOffset + winH/2);
                        ctx.lineTo(winX + winW, wy + yOffset + winH/2);
                     }
                     ctx.stroke();
                }

                // Shutters (Style 0 only)
                if (style === 0) {
                     ctx.fillStyle = h.roofColor;
                     ctx.fillRect(winX - 4, wy + yOffset, 4, winH);
                     ctx.fillRect(winX + winW, wy + yOffset, 4, winH);
                }

                // Flower box (Style 3)
                if (style === 3) {
                     ctx.fillStyle = '#5d4037';
                     ctx.fillRect(winX - 2, wy + yOffset + winH, winW + 4, 4);
                     // Flowers
                     ctx.fillStyle = '#ff69b4';
                     ctx.fillRect(winX, wy + yOffset + winH - 2, 2, 2);
                     ctx.fillRect(winX + 4, wy + yOffset + winH - 2, 2, 2);
                     ctx.fillRect(winX + 8, wy + yOffset + winH - 2, 2, 2);
                }
            }
        };

        const drawPitchedRect = (x: number, y: number, w: number, rectH: number, ridgeAxis: 'horz' | 'vert') => {
            ctx.fillStyle = h.wallColor;
            ctx.fillRect(x, y, w, rectH);

            // Siding / Texture
            ctx.fillStyle = 'rgba(0,0,0,0.05)';
            if (h.style === 0) {
                // Horizontal Siding
                for(let i=0; i<rectH; i+=4) ctx.fillRect(x, y+i, w, 1);
            } else if (h.style === 1) {
                // Vertical Siding
                for(let i=0; i<w; i+=8) ctx.fillRect(x+i, y, 1, rectH);
            } else if (h.style === 3) {
                // Brick-ish noise
                for(let i=0; i<10; i++) {
                     ctx.fillRect(x + Math.random()*w, y + Math.random()*rectH, 4, 2);
                }
            }

            // Decor: Bush for style 2 (Modern/Stucco)
            if (h.style === 2) {
                 ctx.fillStyle = '#2d5a27';
                 ctx.beginPath();
                 ctx.arc(x + 4, y + rectH, 6, Math.PI, 0);
                 ctx.arc(x + w - 4, y + rectH, 6, Math.PI, 0);
                 ctx.fill();
            }

            // Draw Windows on this face
            drawWindows(x, y, w, rectH);
            
            ctx.fillStyle = h.roofColor;
            
            if (ridgeAxis === 'horz') {
                const ridgeY = y + rectH / 2;
                ctx.fillStyle = h.roofColor;
                ctx.fillRect(x, y, w, rectH/2);
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(x, y, w, rectH/2);
                
                ctx.fillStyle = h.roofColor;
                ctx.fillRect(x, ridgeY, w, rectH/2);
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(x, ridgeY, w, rectH/2);
                
                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, ridgeY);
                ctx.lineTo(x + w, ridgeY);
                ctx.stroke();
            } else {
                const ridgeX = x + w / 2;
                ctx.fillStyle = h.roofColor;
                ctx.fillRect(x, y, w/2, rectH);
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(x, y, w/2, rectH);

                ctx.fillStyle = h.roofColor;
                ctx.fillRect(ridgeX, y, w/2, rectH);
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(ridgeX, y, w/2, rectH);

                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(ridgeX, y);
                ctx.lineTo(ridgeX, y + rectH);
                ctx.stroke();
            }
            
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, rectH);
        };

        if (h.shape === 'rect') {
             const structureY = h.facing === 'down' ? ry : ry + TILE_SIZE; 
             const structureH = rh - TILE_SIZE; 
             drawPitchedRect(rx, structureY, rw, structureH, 'horz');

             const garageX = rx + rw - TILE_SIZE;
             const garageY = h.facing === 'down' ? ry + structureH - 12 : ry + TILE_SIZE + structureH - 12;
             
             ctx.fillStyle = '#bbb';
             ctx.fillRect(garageX + 2, garageY, TILE_SIZE - 4, 12);
             ctx.strokeStyle = '#999';
             ctx.beginPath();
             ctx.moveTo(garageX + 2, garageY + 3); ctx.lineTo(garageX + TILE_SIZE - 2, garageY + 3);
             ctx.moveTo(garageX + 2, garageY + 6); ctx.lineTo(garageX + TILE_SIZE - 2, garageY + 6);
             ctx.moveTo(garageX + 2, garageY + 9); ctx.lineTo(garageX + TILE_SIZE - 2, garageY + 9);
             ctx.stroke();

        } else if (h.shape === 'L') {
            const structureY = h.facing === 'down' ? ry : ry + TILE_SIZE;
            const structureH = rh - TILE_SIZE; 
            const halfW = rw / 2;
            const halfH = structureH / 2;
            
            let r1, r2; 
            
            if (h.cutoutCorner === 'tl') {
                r1 = { x: rx, y: structureY + halfH, w: rw, h: halfH }; 
                r2 = { x: rx + halfW, y: structureY, w: halfW, h: halfH }; 
            } else if (h.cutoutCorner === 'tr') {
                r1 = { x: rx, y: structureY + halfH, w: rw, h: halfH };
                r2 = { x: rx, y: structureY, w: halfW, h: halfH }; 
            } else if (h.cutoutCorner === 'bl') {
                r1 = { x: rx, y: structureY, w: rw, h: halfH }; 
                r2 = { x: rx + halfW, y: structureY + halfH, w: halfW, h: halfH }; 
            } else { 
                r1 = { x: rx, y: structureY, w: rw, h: halfH }; 
                r2 = { x: rx, y: structureY + halfH, w: halfW, h: halfH }; 
            }
            
            drawPitchedRect(r1.x, r1.y, r1.w, r1.h, r1.w > r1.h ? 'horz' : 'vert');
            drawPitchedRect(r2.x, r2.y, r2.w, r2.h, r2.w > r2.h ? 'horz' : 'vert');

            const garageX = rx + rw - TILE_SIZE;
            const garageY = h.facing === 'down' ? structureY + structureH - 12 : structureY + structureH - 12;
            
            if (h.cutoutCorner === 'bl' || h.cutoutCorner === 'tl') { 
                 ctx.fillStyle = '#bbb';
                 ctx.fillRect(garageX + 2, garageY, TILE_SIZE - 4, 12);
                 ctx.strokeStyle = '#999';
                 ctx.beginPath();
                 ctx.moveTo(garageX + 2, garageY + 3); ctx.lineTo(garageX + TILE_SIZE - 2, garageY + 3);
                 ctx.moveTo(garageX + 2, garageY + 6); ctx.lineTo(garageX + TILE_SIZE - 2, garageY + 6);
                 ctx.moveTo(garageX + 2, garageY + 9); ctx.lineTo(garageX + TILE_SIZE - 2, garageY + 9);
                 ctx.stroke();
            }
        }

        if (h.isTarget) {
             ctx.strokeStyle = COLORS.TARGET_GLOW;
             ctx.lineWidth = 3;
             ctx.strokeRect(h.pos.x - 2, h.pos.y - 2, h.size.x + 4, h.size.y + 4);
        }
        
        const mbX = h.doorPos.x;
        const mbY = h.doorPos.y;
        
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(mbX + 6, mbY + 6, 4, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = h.isTarget ? '#ff4444' : '#aaaaaa';
        ctx.fillRect(mbX, mbY, 12, 8);
        ctx.fillStyle = '#666'; 
        ctx.fillRect(mbX+4, mbY+8, 4, 6);
        
        if (h.isTarget) {
            ctx.fillStyle = '#ffcc00'; 
            ctx.fillRect(mbX + 10, mbY - 4, 2, 6);
            
            const bounce = Math.sin(Date.now() / 150) * 3;
            ctx.fillStyle = COLORS.TARGET_GLOW;
            ctx.beginPath();
            ctx.moveTo(mbX + 6, mbY - 12 + bounce);
            ctx.lineTo(mbX, mbY - 20 + bounce);
            ctx.lineTo(mbX + 12, mbY - 20 + bounce);
            ctx.fill();
        }
  };

  const drawCar = (ctx: CanvasRenderingContext2D, car: Car) => {
        const cx = car.pos.x + car.size.x / 2;
        const cy = car.pos.y + car.size.y / 2;
        
        ctx.save();
        ctx.translate(cx, cy);
        
        let angle = 0;
        if (car.direction === 'right') angle = 0;
        else if (car.direction === 'down') angle = Math.PI / 2;
        else if (car.direction === 'left') angle = Math.PI;
        else if (car.direction === 'up') angle = -Math.PI / 2;
        
        ctx.rotate(angle);

        // --- Sedan Top View Pixel Art ---
        // Length 22 (X: -11 to 11), Width 12 (Y: -6 to 6)
        
        const isFrozen = car.frozenTimer > 0;
        const bodyColor = isFrozen ? '#88ccff' : COLORS.CAR; 
        const darkBodyColor = isFrozen ? '#6699cc' : '#cc4444';
        const windshieldColor = COLORS.CAR_WINDSHIELD;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-10, 4, 20, 4);

        // Tires (4 wheels)
        ctx.fillStyle = '#111';
        ctx.fillRect(6, -7, 4, 2); // Front Left
        ctx.fillRect(6, 5, 4, 2);  // Front Right
        ctx.fillRect(-8, -7, 4, 2); // Rear Left
        ctx.fillRect(-8, 5, 4, 2);  // Rear Right

        // Main Chassis (The block)
        ctx.fillStyle = darkBodyColor;
        ctx.beginPath();
        // Slightly rounded rectangular chassis
        // Fallback for roundRect if not supported (though it is in most modern browsers)
        if (ctx.roundRect) {
             ctx.roundRect(-11, -6, 22, 12, 2);
        } else {
             ctx.rect(-11, -6, 22, 12);
        }
        ctx.fill();

        // Hood and Trunk differentiation (Top surface)
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-10, -5, 20, 10);

        // Cabin / Roof (Centered but slightly back)
        const roofX = -5;
        const roofW = 10;
        const roofY = -5;
        const roofH = 10;
        
        // Front Windshield
        ctx.fillStyle = windshieldColor;
        ctx.fillRect(roofX + roofW, roofY + 1, 2, roofH - 2); // Glass strip
        
        // Rear Windshield
        ctx.fillStyle = windshieldColor;
        ctx.fillRect(roofX - 2, roofY + 1, 2, roofH - 2);

        // Roof Top
        ctx.fillStyle = bodyColor; // Same as body but maybe slightly lighter/darker
        ctx.fillRect(roofX, roofY, roofW, roofH);

        // Side Windows
        // Top Side
        ctx.fillStyle = '#222';
        ctx.fillRect(roofX + 1, roofY - 1, roofW - 2, 1);
        // Bottom Side
        ctx.fillRect(roofX + 1, roofY + roofH, roofW - 2, 1);
        
        // Headlights
        ctx.fillStyle = COLORS.CAR_LIGHTS;
        ctx.fillRect(10, -4, 1, 2);
        ctx.fillRect(10, 2, 1, 2);
        
        // Taillights
        ctx.fillStyle = '#880000';
        ctx.fillRect(-11, -4, 1, 2);
        ctx.fillRect(-11, 2, 1, 2);

        ctx.restore();
  };

  const drawFrontFacingPostman = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, happy: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    
    // Centered at 0,0. 
    // Let's assume we are drawing from -8,-8 to 8,8 (16x16 grid)
    
    // HAT
    ctx.fillStyle = '#2a5d8f';
    ctx.fillRect(-6, -7, 12, 3); // Main hat
    ctx.fillRect(-7, -4, 14, 1); // Brim
    
    // FACE
    ctx.fillStyle = '#ffdbac';
    ctx.fillRect(-5, -4, 10, 5);
    
    // EYES
    ctx.fillStyle = '#000';
    ctx.fillRect(-3, -3, 2, 2);
    ctx.fillRect(1, -3, 2, 2);
    
    // MOUTH (Happy vs Sad/Neutral)
    if (happy) {
        ctx.fillStyle = '#d48c70';
        ctx.fillRect(-2, 0, 4, 1);
        ctx.fillStyle = '#e5a58e'; // Cheeks
        ctx.fillRect(-5, -1, 2, 1);
        ctx.fillRect(3, -1, 2, 1);
    } else {
         ctx.fillStyle = '#d48c70';
         ctx.fillRect(-2, 0, 4, 1);
    }
    
    // SHIRT
    ctx.fillStyle = '#4d9be6';
    ctx.fillRect(-6, 1, 12, 6);
    
    // STRAP
    ctx.fillStyle = '#5c4033';
    ctx.beginPath();
    ctx.moveTo(4, 1);
    ctx.lineTo(-4, 7);
    ctx.lineTo(-6, 7);
    ctx.lineTo(2, 1);
    ctx.fill();

    // PANTS
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-5, 7, 4, 3); // Left Leg
    ctx.fillRect(1, 7, 4, 3);  // Right Leg

    // BAG (On right side/hip)
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-8, 4, 4, 5); // Bag hanging on left
    ctx.fillStyle = '#a0522d'; // Flap
    ctx.fillRect(-8, 4, 4, 2);
    
    ctx.restore();
};

  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const { width, height } = ctx.canvas;
    
    ctx.fillStyle = COLORS.UI_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(-s.camera.x, -s.camera.y);

    const startCol = Math.floor(s.camera.x / TILE_SIZE);
    const endCol = startCol + (width / TILE_SIZE) + 2;
    const startRow = Math.floor(s.camera.y / TILE_SIZE);
    const endRow = startRow + (height / TILE_SIZE) + 2;

    for (let y = Math.max(0, startRow); y < Math.min(MAP_HEIGHT, endRow); y++) {
        for (let x = Math.max(0, startCol); x < Math.min(MAP_WIDTH, endCol); x++) {
            const tile = s.map[y][x];
            const px = x * TILE_SIZE;
            const py = y * TILE_SIZE;

            if (tile === TileType.ROAD) {
                ctx.fillStyle = COLORS.ROAD;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            
            } else if (tile === TileType.FOOTPATH) {
                ctx.fillStyle = COLORS.FOOTPATH;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(px, py, TILE_SIZE, 2);
                ctx.fillRect(px, py, 2, TILE_SIZE);
            } else if (tile === TileType.GRASS) {
                ctx.fillStyle = COLORS.GRASS;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === TileType.DRIVEWAY) {
                ctx.fillStyle = COLORS.DRIVEWAY;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === TileType.GARDEN) {
                // Varied garden tiles for interest
                const variation = (x * 11 + y * 17) % 3;
                if (variation === 0) ctx.fillStyle = COLORS.GARDEN;
                else if (variation === 1) ctx.fillStyle = '#447f36'; // slightly darker
                else ctx.fillStyle = '#569e45'; // slightly lighter
                
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                
                // Flowers?
                if ((x+y)%5 === 0) {
                     ctx.fillStyle = '#ffb7b2';
                     ctx.beginPath();
                     ctx.arc(px+8, py+8, 2, 0, Math.PI*2);
                     ctx.fill();
                     ctx.fillStyle = '#ffffba';
                     ctx.beginPath();
                     ctx.arc(px+24, py+24, 2, 0, Math.PI*2);
                     ctx.fill();
                }
            } else if (tile === TileType.WATER) {
                ctx.fillStyle = COLORS.POOL_EDGE;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = COLORS.WATER;
                ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                
                // Ripples
                if ((x+y + Math.floor(Date.now()/500)) % 2 === 0) {
                     ctx.fillStyle = COLORS.WATER_RIPPLE;
                     ctx.fillRect(px + 8, py + 8, 4, 2);
                     ctx.fillRect(px + 20, py + 20, 6, 2);
                }
            } else if (tile === TileType.HOUSE) {
                ctx.fillStyle = '#333';
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    s.entities.staticObjects.forEach(obj => {
         if (obj.type === EntityType.TREE) {
             ctx.fillStyle = 'rgba(0,0,0,0.2)';
             ctx.beginPath();
             ctx.arc(obj.pos.x + obj.size.x/2, obj.pos.y + obj.size.y/2 + 4, obj.size.x/2, 0, Math.PI*2);
             ctx.fill();
             
             ctx.fillStyle = COLORS.TREE;
             ctx.beginPath();
             ctx.arc(obj.pos.x + obj.size.x/2, obj.pos.y + obj.size.y/2, obj.size.x/2, 0, Math.PI*2);
             ctx.fill();
             ctx.fillStyle = '#3e7a36';
             ctx.beginPath();
             ctx.arc(obj.pos.x + obj.size.x/2, obj.pos.y + obj.size.y/2, obj.size.x/3, 0, Math.PI*2);
             ctx.fill();
         }
    });

    s.entities.houses.forEach(h => drawHouse(ctx, h));

    // Draw Cars
    s.entities.cars.forEach(c => drawCar(ctx, c));

    s.entities.puddles.forEach(pud => {
        const cx = pud.pos.x + pud.size.x/2;
        const cy = pud.pos.y + pud.size.y/2;
        
        ctx.fillStyle = COLORS.PUDDLE;
        
        ctx.beginPath();
        if (pud.points && pud.points.length > 0) {
             const pts = pud.points;
             const len = pts.length;
             const firstMidX = (pts[len-1].x + pts[0].x) / 2;
             const firstMidY = (pts[len-1].y + pts[0].y) / 2;
             ctx.moveTo(cx + firstMidX, cy + firstMidY);
             
             for(let i=0; i<len; i++) {
                 const p1 = pts[i];
                 const p2 = pts[(i+1)%len];
                 const midX = (p1.x + p2.x) / 2;
                 const midY = (p1.y + p2.y) / 2;
                 ctx.quadraticCurveTo(cx + p1.x, cy + p1.y, cx + midX, cy + midY);
             }
        } else {
             ctx.ellipse(cx, cy, pud.size.x/2, pud.size.y/2, 0, 0, Math.PI*2);
        }
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx - pud.size.x*0.15, cy - pud.size.y*0.15, pud.size.x*0.1, pud.size.y*0.06, -0.4, 0, Math.PI*2);
        ctx.fill();
    });

    s.entities.powerups.forEach(p => {
        if (p.life !== undefined && p.life < 2.0 && Math.floor(Date.now() / 100) % 2 === 0) return;

        if (p.kind === PowerUpType.COFFEE) {
            const x = p.pos.x + 2;
            const y = p.pos.y + 2;
            
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fff';
            
            ctx.fillStyle = '#e8e8e8'; 
            ctx.fillRect(x + 2, y + 2, 8, 8);
            ctx.strokeStyle = '#e8e8e8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x+10, y+4);
            ctx.quadraticCurveTo(x+14, y+6, x+10, y+8);
            ctx.stroke();
            ctx.fillStyle = '#6f4e37';
            ctx.fillRect(x + 3, y + 3, 6, 2);
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(x+2, y+2, 8, 8);
            
            ctx.shadowBlur = 0; 
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.moveTo(x+4, y); ctx.lineTo(x+4, y-2);
            ctx.moveTo(x+8, y); ctx.lineTo(x+8, y-2);
            ctx.stroke();
            
            ctx.shadowBlur = 0; 

        } else if (p.kind === PowerUpType.CLOCK) {
            const x = p.pos.x;
            const y = p.pos.y;

            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fceea7';

            ctx.fillStyle = '#c19a6b';
            
            ctx.fillRect(x + 4, y + 2, 8, 2);
            ctx.fillRect(x + 4, y + 12, 8, 2);

            ctx.fillStyle = '#aaddff';
            ctx.beginPath();
            ctx.moveTo(x + 4, y + 4); 
            ctx.lineTo(x + 12, y + 4); 
            ctx.lineTo(x + 8, y + 8); 
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x + 8, y + 8); 
            ctx.lineTo(x + 12, y + 12); 
            ctx.lineTo(x + 4, y + 12); 
            ctx.fill();

            ctx.fillStyle = '#fceea7';
            ctx.fillRect(x + 7.5, y + 8, 1, 2);
            ctx.fillRect(x + 6, y + 11, 4, 1);
            
            ctx.strokeStyle = '#5a3a29';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 4, y + 2); ctx.lineTo(x + 12, y + 2);
            ctx.lineTo(x + 8, y + 7); ctx.lineTo(x + 4, y + 2);
            ctx.stroke();

            ctx.shadowBlur = 0; 
        } else if (p.kind === PowerUpType.TRAFFIC_LIGHT) {
            const x = p.pos.x;
            const y = p.pos.y;
            
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff0000';

            ctx.fillStyle = '#222';
            ctx.fillRect(x + 4, y + 1, 8, 14);
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 4, y + 1, 8, 14);

            ctx.fillStyle = '#ff0000'; 
            ctx.beginPath(); ctx.arc(x + 8, y + 4, 2, 0, Math.PI*2); ctx.fill();
            
            ctx.fillStyle = '#ffcc00'; 
            ctx.beginPath(); ctx.arc(x + 8, y + 8, 2, 0, Math.PI*2); ctx.fill();

            ctx.fillStyle = '#00ff00'; 
            ctx.beginPath(); ctx.arc(x + 8, y + 12, 2, 0, Math.PI*2); ctx.fill();
            
            ctx.shadowBlur = 0;
        } else if (p.kind === PowerUpType.RAINCOAT) {
             const x = p.pos.x;
             const y = p.pos.y;

             ctx.shadowBlur = 15;
             ctx.shadowColor = '#f4d03f';
             
             ctx.fillStyle = '#f4d03f';
             ctx.beginPath();
             ctx.moveTo(x + 8, y + 2); // Top Hood
             ctx.lineTo(x + 14, y + 14); // Bottom Right
             ctx.lineTo(x + 2, y + 14); // Bottom Left
             ctx.closePath();
             ctx.fill();

             ctx.fillStyle = '#d4ac0d';
             ctx.fillRect(x + 7, y + 2, 2, 12);

             ctx.strokeStyle = '#fff';
             ctx.lineWidth = 1;
             ctx.stroke();

             ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = POWERUP_COLORS[p.kind];
            ctx.beginPath();
            ctx.arc(p.pos.x + 8, p.pos.y + 8, 6, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });

    // --- Draw Projectiles ---
    s.entities.projectiles.forEach(proj => {
        // Linear interpolation
        const cx = proj.startPos.x + (proj.targetPos.x - proj.startPos.x) * proj.progress;
        const cy = proj.startPos.y + (proj.targetPos.y - proj.startPos.y) * proj.progress;
        
        // Arc calculation (parabola)
        const height = Math.sin(proj.progress * Math.PI) * proj.arcHeight;
        
        // Draw Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw Envelope
        ctx.save();
        ctx.translate(cx, cy - height);
        ctx.rotate(proj.rotation);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-5, -3, 10, 6); // Envelope body
        
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.strokeRect(-5, -3, 10, 6); // Border

        // Envelope details
        ctx.beginPath();
        ctx.moveTo(-5, -3);
        ctx.lineTo(0, 1);
        ctx.lineTo(5, -3);
        ctx.stroke();

        // Wax seal?
        ctx.fillStyle = '#cc3333';
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    });

    // --- Player (Walking Postman Top View) ---
    const p = s.entities.player;
    ctx.save();
    ctx.translate(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2);
    
    // Draw Immunity Aura
    if (p.buffs.puddleImmunity > 0) {
        ctx.save();
        ctx.strokeStyle = '#f4d03f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(244, 208, 63, 0.2)';
        ctx.fill();
        ctx.restore();
    }

    let angle = 0;
    if (p.direction === 'right') angle = 0;
    else if (p.direction === 'down') angle = Math.PI / 2;
    else if (p.direction === 'left') angle = Math.PI;
    else if (p.direction === 'up') angle = -Math.PI / 2;
    
    ctx.rotate(angle);
    
    if (p.invulnerabilityTimer > 0) {
        if (Math.floor(Date.now() / 100) % 2 === 0) {
             ctx.globalAlpha = 0.3;
        }
    }

    const isMoving = Math.abs(inputRef.current.x) > 0.1 || Math.abs(inputRef.current.y) > 0.1;
    const walkOffset = isMoving ? Math.sin(Date.now() / 50) * 3 : 0;

    // FEET
    ctx.fillStyle = '#1a1a1a'; // Black shoes
    // Left Foot
    ctx.fillRect(-4 + walkOffset, -6, 6, 4);
    // Right Foot
    ctx.fillRect(-4 - walkOffset, 2, 6, 4);

    // BODY (Uniform)
    ctx.fillStyle = COLORS.PLAYER; // Blue
    // Shoulders/Torso rectangle
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-5, -7, 10, 14, 3);
    else ctx.fillRect(-5, -7, 10, 14);
    ctx.fill();

    // MAILBAG (Strap + Bag)
    ctx.fillStyle = '#8B4513'; // SaddleBrown
    // Just the bag on the side.
    ctx.fillRect(-2, 3, 8, 5); // Bag sticking out

    // HEAD
    ctx.fillStyle = '#ffdbac'; // Skin
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // CAP (Visor facing +X)
    ctx.fillStyle = COLORS.PLAYER_ACCENT; // Dark Blue
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, Math.PI, 0); // Back of cap
    ctx.fill();
    // Visor
    ctx.fillRect(0, -5.5, 5, 11); // Top of cap
    ctx.fillStyle = '#1a1a1a'; // Visor rim or just dark blue
    ctx.fillStyle = COLORS.PLAYER_ACCENT;
    ctx.fillRect(3, -5.5, 3, 11); // Brim sticking out forward

    // HANDS / ENVELOPE
    if (isMoving) {
        // Hands swinging?
        ctx.fillStyle = '#ffdbac';
        ctx.beginPath();
        ctx.arc(2 - walkOffset, -8, 2.5, 0, Math.PI*2); // Left hand
        ctx.fill();
        ctx.beginPath();
        ctx.arc(2 + walkOffset, 8, 2.5, 0, Math.PI*2); // Right hand
        ctx.fill();
    } else {
        // Holding envelope static?
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4, -3, 5, 6); // Envelope
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();

    s.entities.particles.forEach(part => {
        ctx.globalAlpha = Math.max(0, part.life);
        ctx.fillStyle = part.color;
        ctx.fillRect(part.pos.x, part.pos.y, part.size.x, part.size.y);
    });
    ctx.globalAlpha = 1;

    // Draw Popups
    s.entities.textPopups.forEach(popup => {
        ctx.save();
        ctx.font = `bold ${popup.fontSize}px "VT323"`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.max(0, popup.life);
        
        // Outline
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'black';
        ctx.strokeText(popup.text, popup.pos.x, popup.pos.y);
        
        // Text
        ctx.fillStyle = popup.color;
        ctx.fillText(popup.text, popup.pos.x, popup.pos.y);
        ctx.restore();
    });

    ctx.restore();

    const target = s.entities.houses.find(h => h.isTarget);
    if (target) {
        const dx = (target.doorPos.x) - (p.pos.x + 8);
        const dy = (target.doorPos.y) - (p.pos.y + 8);
        const angle = Math.atan2(dy, dx);
        
        const radius = 120; 
        const cx = Math.max(40, Math.min(width - 40, width / 2 + Math.cos(angle) * radius));
        const cy = Math.max(40, Math.min(height - 40, height / 2 + Math.sin(angle) * radius));

        ctx.save();
        ctx.translate(cx, cy);
        
        ctx.translate(0, Math.sin(Date.now() / 200) * 3);

        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';

        ctx.rotate(angle);

        ctx.fillStyle = '#fbf236'; 
        ctx.beginPath();
        ctx.moveTo(14, 0);     
        ctx.lineTo(-10, -12);  
        ctx.lineTo(-4, 0);     
        ctx.lineTo(-10, 12);   
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    if (s.trafficPauseTimer > 0) {
        const alpha = s.trafficPauseTimer / 10.0; 
        ctx.save();
        ctx.strokeStyle = `rgba(255, 80, 80, ${alpha})`;
        ctx.lineWidth = 15;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0000';
        ctx.strokeRect(0, 0, width, height);
        ctx.restore();
    }
  };

  useEffect(() => {
    if (!state.current.isPlaying) initGame();
    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
        const deltaTime = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        
        if (!isPaused && !state.current.isGameOver) {
            const dt = Math.min(deltaTime, 0.1);
            update(dt);
        }

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                draw(ctx);
                
                if (state.current.isGameOver && !gameOverSentRef.current) {
                    gameOverSentRef.current = true;
                    
                    const w = ctx.canvas.width;
                    const h = ctx.canvas.height;
                    
                    // --- SCREENSHOT GENERATION ---
                    
                    // 0. Capture snapshot of game (Background)
                    const snapCanvas = document.createElement('canvas');
                    snapCanvas.width = w;
                    snapCanvas.height = h;
                    const snapCtx = snapCanvas.getContext('2d');
                    if (snapCtx) snapCtx.drawImage(canvasRef.current, 0, 0);

                    // 1. Draw Blurred Background
                    ctx.filter = 'blur(4px) brightness(0.4)';
                    ctx.drawImage(snapCanvas, 0, 0);
                    ctx.filter = 'none';

                    const cx = w / 2;
                    const cy = h / 2;

                    // 2. Logo
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetY = 4;
                    
                    ctx.fillStyle = '#fbf236';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const logoText = "PIXEL POSTMAN";
                    let logoSize = 80;
                    ctx.font = `bold ${logoSize}px "VT323"`;
                    
                    // Fit text within 90% of screen width
                    const measured = ctx.measureText(logoText);
                    if (measured.width > w * 0.9) {
                        logoSize = Math.floor(logoSize * (w * 0.9 / measured.width));
                    }
                    ctx.font = `bold ${logoSize}px "VT323"`;
                    
                    ctx.fillText(logoText, cx, h * 0.15);
                    
                    // 3. Date
                    ctx.fillStyle = '#fff';
                    ctx.font = '24px "VT323"';
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetY = 2;
                    ctx.fillText(new Date().toLocaleDateString().toUpperCase(), cx, h * 0.22);

                    // 4. Status Illustration (Circle with Pixel Art)
                    const ilY = cy - 20;
                    const ilSize = 120;
                    
                    // Circle BG
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.fillStyle = '#222034';
                    ctx.beginPath();
                    ctx.arc(cx, ilY, ilSize/2 + 10, 0, Math.PI*2);
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 4;
                    ctx.stroke();

                    // Draw Character (Scale 5x)
                    const scale = 5;
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetY = 0;
                    
                    // Helper to draw pixel sprite centered at cx, ilY
                    drawFrontFacingPostman(ctx, cx, ilY, scale, state.current.score >= 10);

                    // 5. Score
                    const scoreY = cy + 100;
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetY = 5;
                    
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 100px "VT323"';
                    ctx.fillText(state.current.score.toString(), cx, scoreY);
                    
                    ctx.font = '30px "VT323"';
                    ctx.fillStyle = '#ccc';
                    ctx.fillText("DELIVERIES", cx, scoreY + 40);

                    // 6. Rank
                    let rank = "INTERN";
                    if (state.current.score >= 10) rank = "MAILMAN";
                    if (state.current.score >= 25) rank = "COURIER";
                    if (state.current.score >= 50) rank = "EXPERT";
                    if (state.current.score >= 80) rank = "LEGEND";
                    
                    ctx.fillStyle = '#fbf236'; // Yellow
                    ctx.font = 'bold 40px "VT323"';
                    ctx.fillText(rank, cx, scoreY + 90);
    
                    try {
                        const dataUrl = canvasRef.current.toDataURL('image/png');
                        onGameOver(state.current.score, dataUrl, gameOverReasonRef.current);
                    } catch(e) {
                        console.error("Screenshot failed", e);
                        onGameOver(state.current.score, null, gameOverReasonRef.current);
                    }
                    cancelAnimationFrame(requestRef.current!);
                    return;
                }
            }
        }
        if (!state.current.isGameOver) {
            requestRef.current = requestAnimationFrame(loop);
        }
    };
    
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [initGame, onScoreUpdate, onGameOver, isPaused]);

  useEffect(() => {
    const handleResize = () => {
        if(canvasRef.current) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <canvas ref={canvasRef} className="block w-full h-full" />;
};