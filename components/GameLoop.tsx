
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  GameState, EntityType, Player, House, Vector2, Car, PowerUpType, Particle, Entity, TileType, CarState, Puddle
} from '../types';
import { 
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, COLORS, MAP_PIXEL_WIDTH, MAP_PIXEL_HEIGHT,
  INITIAL_TIME, PLAYER_SPEED, DASH_SPEED, CAR_SPEED, POWERUP_COLORS,
  ROAD_INTERVAL_X, ROAD_INTERVAL_Y, ROAD_WIDTH_TILES
} from '../constants';
import { audio } from '../audio';

interface GameLoopProps {
  input: { x: number; y: number; dash: boolean };
  isPaused: boolean;
  onScoreUpdate: (score: number, combo: number, time: number, health: number) => void;
  onGameOver: (finalScore: number, screenshot: string | null, reason: string) => void;
}

export const GameLoop: React.FC<GameLoopProps> = ({ input, isPaused, onScoreUpdate, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const gameOverSentRef = useRef<boolean>(false);
  const gameOverReasonRef = useRef<string>('');
  
  const inputRef = useRef(input);
  const lastMoveSoundTime = useRef<number>(0);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  
  const state = useRef<GameState>({
    isPlaying: false,
    isGameOver: false,
    score: 0,
    combo: 0,
    timer: INITIAL_TIME,
    deliveries: 0,
    lastDeliveryTime: 0,
    trafficPauseTimer: 0,
    map: [],
    entities: {
      player: {
        id: 'p1', type: EntityType.PLAYER,
        pos: { x: 0, y: 0 }, size: { x: 12, y: 24 }, // Bicycle size
        velocity: { x: 0, y: 0 }, speed: PLAYER_SPEED,
        isDashing: false, dashCooldown: 0, frame: 0, direction: 'right', stunned: 0,
        buffs: { speedBoost: 0 },
        health: 3, maxHealth: 3, invulnerabilityTimer: 0
      },
      houses: [],
      cars: [],
      puddles: [],
      powerups: [],
      particles: [],
      staticObjects: []
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
        // Explicitly forbidding Footpath, Driveway, Grass, Garden.
        if (tile !== TileType.ROAD) return false;
    }
    return true;
  };

  // Determine allowed flow direction based on grid (Right Hand Traffic)
  // Even X = DOWN, Odd X = UP
  // Even Y = LEFT, Odd Y = RIGHT
  const getTrafficFlow = (tx: number, ty: number) => {
    const flows: {x:number, y:number, d:'up'|'down'|'left'|'right'}[] = [];
    
    // Vertical Roads
    if (tx % 2 === 0) flows.push({ x: 0, y: 1, d: 'down' });
    else flows.push({ x: 0, y: -1, d: 'up' });

    // Horizontal Roads
    if (ty % 2 === 0) flows.push({ x: -1, y: 0, d: 'left' });
    else flows.push({ x: 1, y: 0, d: 'right' });

    return flows;
  };

  // Find a random road tile
  const getRandomRoadPosition = (map: TileType[][], entitySize: Vector2) : Vector2 => {
      let attempts = 0;
      while(attempts < 1000) {
          const tx = Math.floor(Math.random() * MAP_WIDTH);
          const ty = Math.floor(Math.random() * MAP_HEIGHT);
          if (map[ty][tx] === TileType.ROAD) {
             const pos = { x: tx * TILE_SIZE + 4, y: ty * TILE_SIZE + 4 }; // Offset slightly
             if (isWalkable(pos, entitySize, map)) return pos;
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

    // Draw Roads
    for(let y = 0; y < MAP_HEIGHT; y++) {
        for(let x = 0; x < MAP_WIDTH; x++) {
            // Margin 2 tiles for Grass borders
            if (x < 2 || x >= MAP_WIDTH - 2 || y < 2 || y >= MAP_HEIGHT - 2) {
                map[y][x] = TileType.GRASS;
                continue;
            }

            // Grid
            // Offset Y by 3 so first road is at y=3, leaving exactly 3 tiles above for a house
            if ((x - 2) % ROAD_INTERVAL_X < ROAD_WIDTH_TILES || (y - 3) % ROAD_INTERVAL_Y < ROAD_WIDTH_TILES) {
                map[y][x] = TileType.ROAD;
            }
        }
    }

    // Place Houses
    const roofColors = [COLORS.HOUSE_ROOF, COLORS.HOUSE_ROOF_DARK, COLORS.HOUSE_ROOF_LIGHT, '#8a6f50', '#a35a40'];
    
    for(let y = 0; y < MAP_HEIGHT - 2; y++) {
        for(let x = 0; x < MAP_WIDTH - 2; x++) {
            if (map[y][x] === TileType.GRASS) {
                const wTiles = 4;
                const hTiles = 3; // Typically deeper for yards
                
                let facing: 'up'|'down'|'left'|'right' | null = null;
                // Check Above
                if (y > 0 && map[y-1][x] === TileType.ROAD) facing = 'up';
                // Check Below (need to look ahead)
                else if (y + hTiles < MAP_HEIGHT && map[y+hTiles][x] === TileType.ROAD) facing = 'down';

                if (facing && Math.random() > 0.4) {
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
                        const shapeType = Math.random() > 0.3 ? 'L' : 'rect';
                        const w = wTiles * TILE_SIZE;
                        const h = hTiles * TILE_SIZE;
                        const pos = { x: x * TILE_SIZE, y: y * TILE_SIZE };
                        
                        let drivewayPos = { x: pos.x + w - TILE_SIZE, y: pos.y };
                        let doorPos = { x: pos.x + w/2, y: pos.y + (facing==='up'?0:h) }; 
                        let cutoutCorner: 'tl'|'tr'|'bl'|'br' | undefined = undefined;

                        // Configuration for American Style Houses with Driveways
                        // Driveway is consistently on the RIGHT side of the lot
                        if (facing === 'down') {
                            // House at Top, Driveway Right, Road Bottom
                            drivewayPos = { x: pos.x + w - TILE_SIZE, y: pos.y + h - TILE_SIZE };
                            doorPos = { x: pos.x + TILE_SIZE * 1.5, y: pos.y + h - 8 };
                            
                            if (shapeType === 'L') {
                                cutoutCorner = 'bl';
                            }
                        } else {
                            // Facing UP (Road is above)
                            // House at Bottom, Driveway Right, Road Top
                            drivewayPos = { x: pos.x + w - TILE_SIZE, y: pos.y };
                            doorPos = { x: pos.x + TILE_SIZE * 1.5, y: pos.y + 8 };

                             if (shapeType === 'L') {
                                cutoutCorner = 'tl';
                            }
                        }

                        // Apply to Map
                        for(let dy=0; dy<hTiles; dy++) {
                            for(let dx=0; dx<wTiles; dx++) {
                                const tileX = x + dx;
                                const tileY = y + dy;
                                
                                // Default to garden
                                map[tileY][tileX] = TileType.GARDEN;

                                // House Logic
                                let isHousePart = false;
                                
                                if (facing === 'down' && dy < 2) isHousePart = true;
                                if (facing === 'up' && dy >= 1) isHousePart = true;

                                if (isHousePart && shapeType === 'L') {
                                    const hDy = facing === 'up' ? dy - 1 : dy;
                                    
                                    if (cutoutCorner === 'tl' && dx < 2 && hDy < 1) isHousePart = false;
                                    if (cutoutCorner === 'tr' && dx >= 2 && hDy < 1) isHousePart = false;
                                    if (cutoutCorner === 'bl' && dx < 2 && hDy >= 1) isHousePart = false;
                                    if (cutoutCorner === 'br' && dx >= 2 && hDy >= 1) isHousePart = false;
                                }

                                if (isHousePart) {
                                    map[tileY][tileX] = TileType.HOUSE;
                                }
                            }
                        }

                        // Driveway Logic
                        if (facing === 'down') {
                             for(let dy=0; dy<hTiles; dy++) {
                                 map[y+dy][x+wTiles-1] = TileType.DRIVEWAY;
                             }
                        } else {
                             for(let dy=0; dy<hTiles; dy++) {
                                 map[y+dy][x+wTiles-1] = TileType.DRIVEWAY;
                             }
                        }

                        houses.push({
                           id: `h_${x}_${y}`,
                           type: EntityType.HOUSE,
                           pos: pos,
                           size: { x: w, y: h },
                           facing: facing,
                           isTarget: false,
                           doorPos: doorPos,
                           gardenPos: pos,
                           gardenSize: { x: w, y: h },
                           drivewayPos: drivewayPos,
                           drivewaySize: { x: TILE_SIZE, y: TILE_SIZE },
                           roofColor: roofColors[Math.floor(Math.random() * roofColors.length)],
                           shape: shapeType,
                           cutoutCorner: cutoutCorner
                       });
                    }
                }
            }
        }
    }
    
    // Generate Footpaths and Static Objects
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (map[y][x] === TileType.GRASS || map[y][x] === TileType.GARDEN) {
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

                if (hasRoad && map[y][x] !== TileType.GARDEN) { 
                    map[y][x] = TileType.FOOTPATH;
                    
                    const centerX = x * TILE_SIZE + TILE_SIZE / 2;
                    const centerY = y * TILE_SIZE + TILE_SIZE / 2;
                    
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

    if (houses.length > 0) {
      houses[Math.floor(Math.random() * houses.length)].isTarget = true;
    }

    let startPos = { x: 64, y: 64 };
    for(let y=0; y<MAP_HEIGHT; y++) {
        for(let x=0; x<MAP_WIDTH; x++) {
            if (map[y][x] === TileType.ROAD) {
                startPos = { x: x*TILE_SIZE + 10, y: y*TILE_SIZE + 10 };
                break;
            }
        }
    }

    const puddles: Puddle[] = [];
    // Reduced puddle size to be smaller than half road (Road is 64px, Half is 32px)
    // Max width 28px
    for(let i=0; i<12; i++) {
        const w = 15 + Math.random() * 13; // 15 to 28
        const h = 12 + Math.random() * 10; // 12 to 22
        const pos = getRandomRoadPosition(map, {x: w, y: h});
        
        const points: Vector2[] = [];
        const segments = 8 + Math.floor(Math.random() * 4); 
        const angleStep = (Math.PI * 2) / segments;
        
        for(let s=0; s<segments; s++) {
             const angle = s * angleStep;
             const rX = (w/2) * (0.6 + Math.random() * 0.4); 
             const rY = (h/2) * (0.6 + Math.random() * 0.4);
             
             points.push({
                x: Math.cos(angle) * rX,
                y: Math.sin(angle) * rY
             });
        }

        puddles.push({
            id: `pud_${i}`, type: EntityType.PUDDLE,
            pos: pos,
            size: { x: w, y: h },
            points: points
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
                size: { x: 22, y: 12 }, // Sedan aspect ratio (longer than wide)
                velocity: { x: 0, y: 0 },
                speed: CAR_SPEED,
                frozenTimer: 0,
                direction: h.facing === 'up' ? 'down' : 'up', // Parked facing out usually
                state: CarState.PARKED,
                homePos: { x: carX, y: carY }
            });
        }
    });

    state.current = {
      isPlaying: true,
      isGameOver: false,
      score: 0,
      combo: 0,
      timer: INITIAL_TIME,
      deliveries: 0,
      lastDeliveryTime: performance.now(),
      trafficPauseTimer: 0,
      map,
      entities: {
        player: { ...state.current.entities.player, pos: startPos, health: 3, maxHealth: 3, invulnerabilityTimer: 0 },
        houses,
        cars,
        puddles,
        powerups: [],
        particles: [],
        staticObjects
      },
      camera: { x: 0, y: 0 }
    };
    gameOverSentRef.current = false;
    gameOverReasonRef.current = '';
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
        
        if (tileY+1 < MAP_HEIGHT && (s.map[tileY+1][tileX] === TileType.ROAD || s.map[tileY+2]?.[tileX] === TileType.ROAD)) car.direction = 'down';
        else if (tileY-1 >= 0 && (s.map[tileY-1][tileX] === TileType.ROAD || s.map[tileY-2]?.[tileX] === TileType.ROAD)) car.direction = 'up';
    }
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

    let spawnChance = 0.003; 
    
    if (s.timer <= 60) {
        const intensity = 1 - (Math.max(0, s.timer) / 60);
        spawnChance = 0.003 + (intensity * 0.04);
    }

    if (Math.random() < spawnChance) {
        activateCar();
    }
    
    if (Math.random() < 0.005 && s.entities.powerups.length < 5) {
         const types = [PowerUpType.COFFEE, PowerUpType.TRAFFIC_LIGHT, PowerUpType.CLOCK];
         const kind = types[Math.floor(Math.random() * types.length)];
         const pos = getRandomRoadPosition(s.map, {x:16, y:16});
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
        if (p.isDashing) currentSpeed = DASH_SPEED;
        else if (p.buffs.speedBoost > 0) currentSpeed = PLAYER_SPEED * 1.5;

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

        if (currentInput.dash && p.dashCooldown <= 0) {
            p.isDashing = true;
            p.dashCooldown = 1.0; 
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
        if (p.dashCooldown > 0) p.dashCooldown -= deltaTime;
        if (p.isDashing) {
             if (p.dashCooldown < 0.8) p.isDashing = false; 
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
        
        if (inPuddle && !p.isDashing) {
            if (p.invulnerabilityTimer <= 0) {
                p.health -= 1;
                p.invulnerabilityTimer = 2.0; 
                audio.playSplash(); // SFX
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

    if (p.buffs.speedBoost > 0) p.buffs.speedBoost -= deltaTime;

    // --- Delivery Logic ---
    const targetHouse = s.entities.houses.find(h => h.isTarget);
    if (targetHouse) {
        const dist = getDistance(p.pos, targetHouse.doorPos);
        if (dist < 45) {
            s.score += 1 + (s.combo > 5 ? 1 : 0);
            s.combo++;
            s.deliveries++;
            audio.playDelivery(); // SFX
            
            const timeSinceLast = performance.now() / 1000 - s.lastDeliveryTime;
            let bonusTime = 2;
            if (timeSinceLast < 5) bonusTime += 2; 
            s.timer = Math.min(s.timer + bonusTime, INITIAL_TIME); 
            s.lastDeliveryTime = performance.now() / 1000;

            for(let i=0; i<10; i++) {
                s.entities.particles.push({
                    id: `confetti_${Math.random()}`, type: EntityType.PARTICLE,
                    pos: { ...targetHouse.doorPos }, size: { x: 3, y: 3 },
                    velocity: { x: (Math.random()-0.5)*100, y: (Math.random()-0.5)*100 - 50 },
                    life: 1.0, color: COLORS.TARGET_GLOW
                });
            }

            targetHouse.isTarget = false;
            let nextHouse = s.entities.houses[Math.floor(Math.random() * s.entities.houses.length)];
            while(nextHouse === targetHouse) {
                nextHouse = s.entities.houses[Math.floor(Math.random() * s.entities.houses.length)];
            }
            nextHouse.isTarget = true;
            
            activateCar();
        }
    }

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
                
                const flows = getTrafficFlow(tx, ty);
                const bestFlow = flows[0];
                if (bestFlow) {
                    car.direction = bestFlow.d;
                    car.velocity = { x: bestFlow.x * car.speed, y: bestFlow.y * car.speed };
                }
            }
            if (checkCollision(p, car) && !p.isDashing && p.invulnerabilityTimer <= 0) {
                 p.health -= 1;
                 p.invulnerabilityTimer = 2.0;
                 audio.playHit(); // SFX
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

            const allowedFlows = getTrafficFlow(tileX, tileY);
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

        if (checkCollision(p, car) && p.stunned <= 0 && !p.isDashing) {
            if (p.invulnerabilityTimer <= 0) {
                p.health -= 1;
                p.invulnerabilityTimer = 2.0;
                audio.playHit(); // SFX
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
                    p.buffs.speedBoost = 5.0; 
                    p.health = Math.min(p.health + 1, p.maxHealth); 
                    break;
                case PowerUpType.CLOCK: 
                    s.timer = Math.min(s.timer + 10, INITIAL_TIME); 
                    break;
                case PowerUpType.TRAFFIC_LIGHT: 
                    s.entities.cars.forEach(c => c.frozenTimer = 10.0); 
                    s.trafficPauseTimer = 10.0;
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

    s.camera.x = p.pos.x - window.innerWidth / 2;
    s.camera.y = p.pos.y - window.innerHeight / 2;
    s.camera.x = Math.max(0, Math.min(s.camera.x, MAP_PIXEL_WIDTH - window.innerWidth));
    s.camera.y = Math.max(0, Math.min(s.camera.y, MAP_PIXEL_HEIGHT - window.innerHeight));

    onScoreUpdate(s.score, s.combo, s.timer, p.health);
  };

  const drawHouse = (ctx: CanvasRenderingContext2D, h: House) => {
        const rx = h.pos.x;
        const ry = h.pos.y;
        const rw = h.size.x;
        const rh = h.size.y;

        const drawPitchedRect = (x: number, y: number, w: number, rectH: number, ridgeAxis: 'horz' | 'vert') => {
            ctx.fillStyle = COLORS.HOUSE_WALL;
            ctx.fillRect(x, y, w, rectH);
            
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
        ctx.roundRect(-11, -6, 22, 12, 2);
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
                
                const isVertRoad = (x - 2) % ROAD_INTERVAL_X < ROAD_WIDTH_TILES;
                const isHorzRoad = (y - 3) % ROAD_INTERVAL_Y < ROAD_WIDTH_TILES;
                
                if (isVertRoad && !isHorzRoad) {
                    if ((x - 2) % ROAD_INTERVAL_X === 1) {
                         ctx.fillStyle = COLORS.ROAD_MARKING;
                         for(let i=4; i<TILE_SIZE; i+=16) {
                            ctx.fillRect(px - 1, py + i, 2, 8); 
                         }
                    }
                }
                
                if (isHorzRoad && !isVertRoad) {
                    if ((y - 3) % ROAD_INTERVAL_Y === 1) {
                         ctx.fillStyle = COLORS.ROAD_MARKING;
                         for(let i=4; i<TILE_SIZE; i+=16) {
                            ctx.fillRect(px + i, py - 1, 8, 2);
                         }
                    }
                }

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
                ctx.fillStyle = COLORS.GARDEN;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                if ((x+y)%2 === 0) {
                     ctx.fillStyle = '#ffb7b2';
                     ctx.beginPath();
                     ctx.arc(px+8, py+8, 2, 0, Math.PI*2);
                     ctx.fill();
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

    s.entities.cars.forEach(car => {
        drawCar(ctx, car);

        if (car.state === CarState.PARKED) {
             ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
             ctx.font = 'bold 12px monospace';
             ctx.textAlign = 'center';
             ctx.fillText('P', car.pos.x + car.size.x/2, car.pos.y);
             ctx.textAlign = 'start'; 
        }
    });

    // --- Player (Bicycle Top View) ---
    const p = s.entities.player;
    ctx.save();
    ctx.translate(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2);
    
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

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 8, 4, 0, 0, Math.PI*2);
    ctx.fill();

    const bikeColor = '#efefef';
    const wheelColor = '#222';
    
    ctx.fillStyle = wheelColor;
    ctx.fillRect(-10, -2, 6, 4); 
    ctx.fillRect(6, -2, 6, 4);   
    
    ctx.fillStyle = bikeColor;
    ctx.fillRect(-6, -1, 12, 2); 
    
    ctx.fillStyle = '#666';
    ctx.fillRect(4, -6, 2, 12); 
    
    ctx.fillStyle = COLORS.PLAYER; 
    ctx.beginPath();
    ctx.ellipse(-2, 0, 5, 3, 0, 0, Math.PI*2);
    ctx.fill();
    
    ctx.fillStyle = COLORS.PLAYER_ACCENT;
    ctx.beginPath();
    ctx.arc(-2, 0, 3, 0, Math.PI*2); 
    ctx.fill();
    
    ctx.globalAlpha = 1;
    ctx.restore();

    s.entities.particles.forEach(part => {
        ctx.globalAlpha = Math.max(0, part.life);
        ctx.fillStyle = part.color;
        ctx.fillRect(part.pos.x, part.pos.y, part.size.x, part.size.y);
    });
    ctx.globalAlpha = 1;

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
                    ctx.save();
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '30px "VT323"';
                    ctx.textAlign = 'center';
                    ctx.shadowColor = 'black';
                    ctx.shadowBlur = 4;
                    ctx.fillText("PIXEL POSTMAN", ctx.canvas.width/2, ctx.canvas.height/2 - 20);
                    ctx.fillStyle = '#fbf236';
                    ctx.font = '40px "VT323"';
                    ctx.fillText("SCORE: " + state.current.score, ctx.canvas.width/2, ctx.canvas.height/2 + 20);
                    ctx.restore();
                    
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
