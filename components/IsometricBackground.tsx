import React, { useRef, useEffect } from 'react';
import { COLORS } from '../constants';

export const IsometricBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // Setup Canvas
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.imageRendering = 'pixelated';
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // Isometric Helper
    const TILE_W = 40;
    const TILE_H = 20; // Flattened for iso

    const toIso = (x: number, y: number, z: number, center: {x:number, y:number}) => {
        const isoX = (x - y) * TILE_W;
        const isoY = (x + y) * TILE_H - z * TILE_W;
        return { x: center.x + isoX, y: center.y + isoY };
    };

    const drawBlock = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, center: {x:number, y:number}, ctx: CanvasRenderingContext2D) => {
        // x,y,z is bottom-center-left coordinate in grid space
        // w,h,d are dimensions in grid units (width=x, depth=y, height=z)
        
        // Vertices
        // Top Face
        const t1 = toIso(x, y, z + d, center);
        const t2 = toIso(x + w, y, z + d, center);
        const t3 = toIso(x + w, y + h, z + d, center);
        const t4 = toIso(x, y + h, z + d, center);
        
        // Bottom verts for sides
        const b2 = toIso(x + w, y, z, center);
        const b3 = toIso(x + w, y + h, z, center);
        const b4 = toIso(x, y + h, z, center);

        // Right Face (Darker)
        ctx.fillStyle = adjustColor(color, -20);
        ctx.beginPath();
        ctx.moveTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.lineTo(b3.x, b3.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.fill();

        // Left Face (Darkest)
        ctx.fillStyle = adjustColor(color, -40);
        ctx.beginPath();
        ctx.moveTo(t4.x, t4.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.lineTo(b3.x, b3.y);
        ctx.lineTo(b4.x, b4.y);
        ctx.fill();

        // Top Face (Base Color)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.lineTo(t4.x, t4.y);
        ctx.fill();
        
        // Highlight edges
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
    };

    const adjustColor = (color: string, amount: number) => {
        // Very basic hex adjustment
        if (color.startsWith('#')) {
            const num = parseInt(color.slice(1), 16);
            let r = (num >> 16) + amount;
            let g = ((num >> 8) & 0x00FF) + amount;
            let b = (num & 0x00FF) + amount;
            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));
            return `rgb(${r},${g},${b})`;
        }
        return color;
    };

    // Entities
    const cars = [
        { id: 1, x: -6, y: 0, speed: 0.03, axis: 'x', color: '#e64d4d', type: 'sedan' },
        { id: 2, x: 6, y: -0.5, speed: -0.04, axis: 'x', color: '#4d9be6', type: 'sedan' },
        { id: 3, x: 0, y: -6, speed: 0.02, axis: 'y', color: '#f4d03f', type: 'truck' }
    ];
    
    const clouds = [
        { x: -5, y: -5, z: 4, size: 2, speed: 0.005 },
        { x: 0, y: -8, z: 5, size: 3, speed: 0.008 },
        { x: -8, y: 0, z: 3, size: 2.5, speed: 0.006 }
    ];

    const houses = [
        { x: -3, y: -3, w: 1, h: 1, z: 0, H: 1.5, c: COLORS.HOUSE_WALL, r: COLORS.HOUSE_ROOF },
        { x: -2, y: -3, w: 1, h: 1, z: 0, H: 1.2, c: '#e8ceb5', r: '#8f563b' },
        { x: 3, y: 3, w: 1, h: 1, z: 0, H: 1.0, c: '#d6e8b5', r: '#d68e6e' },
        { x: 3, y: 2, w: 1, h: 1, z: 0, H: 1.4, c: '#b5d6e8', r: '#50668a' },
        { x: 2, y: -3, w: 0.5, h: 0.5, z: 0, H: 2.5, c: COLORS.TREE_TRUNK, r: COLORS.TREE, type: 'tree' },
        { x: -3, y: 2, w: 1, h: 1, z: 0, H: 1.6, c: '#e8ceb5', r: '#b86f50' }
    ];

    const render = () => {
        time += 0.016;
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        const center = { x: width / 2, y: height / 2 + 100 };

        ctx.clearRect(0, 0, width, height);
        
        // BG
        ctx.fillStyle = '#222034';
        ctx.fillRect(0, 0, width, height);

        // Draw Base Grid
        for(let x = -6; x <= 6; x++) {
            for(let y = -6; y <= 6; y++) {
                drawBlock(x, y, 0, 1, 1, 0.2, COLORS.GRASS, center, ctx);
            }
        }

        // Draw Roads
        for(let i = -6; i <= 6; i++) {
            drawBlock(i, 0, 0.05, 1, 1, 0.05, COLORS.ROAD, center, ctx);
            drawBlock(0, i, 0.05, 1, 1, 0.05, COLORS.ROAD, center, ctx);
        }
        // Intersection
        drawBlock(0, 0, 0.06, 1, 1, 0.05, '#555', center, ctx);

        // Houses / Trees
        houses.forEach(h => {
             if (h.type === 'tree') {
                 // Trunk
                 drawBlock(h.x + 0.25, h.y + 0.25, h.z, 0.5, 0.5, 0.8, h.c, center, ctx);
                 // Leaves
                 drawBlock(h.x, h.y, h.z + 0.6, 1, 1, 1.2, h.r, center, ctx);
             } else {
                 // Base
                 drawBlock(h.x, h.y, h.z, h.w, h.h, h.H, h.c, center, ctx);
                 // Roof
                 drawBlock(h.x, h.y, h.z + h.H, h.w, h.h, 0.4, h.r, center, ctx);
                 // Door
                 const doorPos = toIso(h.x + 0.5, h.y + 1.01, 0.1, center);
                 ctx.fillStyle = '#4a3c31';
                 ctx.beginPath();
                 // Simple door drawing on iso plane requires manual projection logic or just sticking it on the face
                 // Let's just draw simple windows
                 const w1 = toIso(h.x + 0.2, h.y + 1.01, h.H/2 + 0.2, center);
                 const w2 = toIso(h.x + 0.4, h.y + 1.01, h.H/2 + 0.2, center);
                 const w3 = toIso(h.x + 0.4, h.y + 1.01, h.H/2 - 0.2, center);
                 const w4 = toIso(h.x + 0.2, h.y + 1.01, h.H/2 - 0.2, center);
                 // ... too complex for this loop, keep simple blocks
             }
        });

        // Update & Draw Cars
        cars.forEach(car => {
            if (car.axis === 'x') {
                car.x += car.speed;
                if (car.speed > 0 && car.x > 8) car.x = -8;
                if (car.speed < 0 && car.x < -8) car.x = 8;
                
                // Draw Car
                const w = 0.8, h = 0.4, d = 0.5;
                drawBlock(car.x, car.y + 0.2, 0.1, w, h, d, car.color, center, ctx);
                // Windows
                drawBlock(car.x + 0.2, car.y + 0.2, 0.1 + d, w - 0.4, h, 0.3, '#8fd3ff', center, ctx);
            } else {
                car.y += car.speed;
                if (car.speed > 0 && car.y > 8) car.y = -8;
                if (car.speed < 0 && car.y < -8) car.y = 8;
                 
                const w = 0.4, h = 0.8, d = 0.6; // Truck is taller
                drawBlock(car.x + 0.2, car.y, 0.1, w, h, d, car.color, center, ctx);
                drawBlock(car.x + 0.2, car.y + 0.1, 0.1 + d, w, h - 0.6, 0.2, '#8fd3ff', center, ctx);
            }
        });

        // Postman (Bobbing)
        const bob = Math.sin(time * 5) * 0.1;
        const pmX = -1;
        const pmY = -1;
        
        // Body
        drawBlock(pmX, pmY, 0.1 + Math.max(0, bob), 0.4, 0.4, 0.6, COLORS.PLAYER, center, ctx);
        // Head
        drawBlock(pmX + 0.05, pmY + 0.05, 0.7 + Math.max(0, bob), 0.3, 0.3, 0.3, '#ffdbac', center, ctx);
        // Hat
        drawBlock(pmX, pmY, 1.0 + Math.max(0, bob), 0.4, 0.4, 0.1, COLORS.PLAYER_ACCENT, center, ctx);
        // Bag
        drawBlock(pmX + 0.3, pmY + 0.1, 0.3 + Math.max(0, bob), 0.2, 0.2, 0.3, '#8B4513', center, ctx);

        // "MAIL!" Text
        const textPos = toIso(pmX, pmY, 2 + bob * 2, center);
        ctx.font = 'bold 20px "VT323"';
        ctx.fillStyle = '#fbf236';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText('MAIL?', textPos.x, textPos.y);
        ctx.fillText('MAIL?', textPos.x, textPos.y);

        // Clouds
        ctx.globalAlpha = 0.6;
        clouds.forEach(cloud => {
            cloud.x += cloud.speed;
            if (cloud.x > 10) cloud.x = -10;
            
            drawBlock(cloud.x, cloud.y, cloud.z, cloud.size, cloud.size * 0.6, 0.5, '#ffffff', center, ctx);
            drawBlock(cloud.x + 0.5, cloud.y + 0.5, cloud.z + 0.2, cloud.size * 0.8, cloud.size * 0.5, 0.5, '#ffffff', center, ctx);
        });
        ctx.globalAlpha = 1;
        
        // Vignette
        const gradient = ctx.createRadialGradient(width/2, height/2, width/4, width/2, height/2, width);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(34,32,52,0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0,0, width, height);

        animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />;
};