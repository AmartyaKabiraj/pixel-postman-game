import React, { useEffect, useRef, useState } from 'react';

interface JoystickProps {
  onMove: (x: number, y: number) => void;
  onStop: () => void;
}

export const VirtualJoystick: React.FC<JoystickProps> = ({ onMove, onStop }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const maxRadius = 40;

  const handleStart = (clientX: number, clientY: number) => {
    setActive(true);
    updateStick(clientX, clientY);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!active) return;
    updateStick(clientX, clientY);
  };

  const handleEnd = () => {
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onStop();
  };

  const updateStick = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > maxRadius) {
      const angle = Math.atan2(deltaY, deltaX);
      deltaX = Math.cos(angle) * maxRadius;
      deltaY = Math.sin(angle) * maxRadius;
    }

    setPosition({ x: deltaX, y: deltaY });
    
    // Normalize output -1 to 1
    onMove(deltaX / maxRadius, deltaY / maxRadius);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-24 h-24 bg-white/10 rounded-full border-2 border-white/30 backdrop-blur-sm touch-none select-none"
      onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={handleEnd}
    >
      <div
        ref={stickRef}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
        className="absolute top-1/2 left-1/2 -ml-4 -mt-4 w-8 h-8 bg-white/80 rounded-full shadow-lg pointer-events-none"
      />
    </div>
  );
};