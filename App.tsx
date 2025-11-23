
import React, { useState, useEffect, useCallback } from 'react';
import { GameLoop } from './components/GameLoop';
import { VirtualJoystick } from './components/VirtualJoystick';
import { PowerUpType } from './types';
import { COLORS, INITIAL_TIME } from './constants';
import { audio } from './audio';

// Icons
const IconClock = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconPause = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconHeart: React.FC<{ filled: boolean }> = ({ filled }) => (
  <svg className={`w-6 h-6 ${filled ? 'text-red-500 fill-red-500' : 'text-gray-500 fill-gray-800'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={filled ? 0 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);
const IconShare = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>;

const RulesContent = () => (
  <div className="text-left text-lg space-y-3 text-[#cbdbfc] pb-4">
    <div className="font-bold text-yellow-200 text-xl sticky top-0 bg-[#222034] py-2 z-10 border-b border-white/10">MISSION RULES:</div>
    <ul className="list-disc pl-5 space-y-2 text-base">
        <li>Follow the <span className="text-yellow-400 font-bold">YELLOW ARROW</span> to the target house.</li>
        <li>Deliver mail to the <span className="text-yellow-400 font-bold">BLINKING MAILBOX</span>.</li>
        <li><span className="text-green-400">Speed</span> is key! Chain deliveries for <span className="text-orange-400">COMBO</span> points.</li>
        <li><strong>Stay on the Road!</strong> Lawns are off-limits.</li>
        <li>Avoid <span className="text-red-400">CARS</span> and <span className="text-blue-400">PUDDLES</span> (-1 Heart).</li>
        <li><strong>Game Over</strong> when Time hits 0:00 or Hearts are gone.</li>
    </ul>
    
    <div className="font-bold text-yellow-200 mt-4 sticky top-0 bg-[#222034] py-2 z-10 border-b border-white/10">POWERUPS (10s Duration):</div>
    <div className="grid grid-cols-1 gap-2 text-sm">
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-[#e8e8e8] border border-black inline-block"></span> 
            <span><strong className="text-white">Coffee</strong>: Speed Boost + Heal 1 Heart</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-[#222] border border-gray-500 inline-block relative overflow-hidden flex justify-center items-center"><span className="w-1 h-1 bg-red-500 rounded-full"></span></span>
            <span><strong className="text-white">Traffic Light</strong>: Freezes all Cars</span>
        </div>
        <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-[#c19a6b] border border-[#5a3a29] inline-block"></span>
            <span><strong className="text-white">Hourglass</strong>: Adds 10 Seconds</span>
        </div>
    </div>

    <div className="mt-4 text-center text-gray-400 text-sm">
        Controls: WASD / Arrows to Move • SHIFT to Dash • SPACE to Pause
    </div>
  </div>
);

export default function App() {
  // Input State
  const [input, setInput] = useState({ x: 0, y: 0, dash: false });
  const [keys, setKeys] = useState<Record<string, boolean>>({});

  // UI State
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [time, setTime] = useState(INITIAL_TIME);
  const [health, setHealth] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameKey, setGameKey] = useState(0); // to reset game
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);

  // Audio Logic
  useEffect(() => {
    // Determine which track to play
    if (gameOver) {
      audio.playMusic('GAME_OVER');
    } else if (paused) {
      audio.pauseMusic(); // Or play a pause track
    } else if (gameStarted) {
      audio.resumeMusic();
      audio.playMusic('GAME');
    } else {
      // Start/Menu screen
      audio.playMusic('MENU');
    }
    
    // Cleanup on unmount (stop music)
    return () => {};
  }, [gameStarted, paused, gameOver]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default scrolling for Space/Arrows
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === 'Space') {
          if (gameStarted && !gameOver) {
              setPaused(prev => !prev);
          }
      } else {
          setKeys(prev => ({ ...prev, [e.code]: true }));
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
              setInput(prev => ({ ...prev, dash: true }));
          }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') {
          setKeys(prev => ({ ...prev, [e.code]: false }));
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
              setInput(prev => ({ ...prev, dash: false }));
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameStarted, gameOver]);

  // Merge Keyboard & Joystick
  useEffect(() => {
    let x = 0;
    let y = 0;
    
    if (keys['ArrowUp'] || keys['KeyW']) y -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) y += 1;
    if (keys['ArrowLeft'] || keys['KeyA']) x -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) x += 1;

    setInput(prev => ({ ...prev, x, y }));
  }, [keys]);

  const handleJoystickMove = (x: number, y: number) => {
    setInput(prev => ({ ...prev, x, y }));
  };

  const handleJoystickStop = () => {
    if (!Object.values(keys).some(k => k)) {
      setInput(prev => ({ ...prev, x: 0, y: 0 }));
    }
  };

  const handleScoreUpdate = useCallback((s: number, c: number, t: number, h: number) => {
    setScore(s);
    setCombo(c);
    setTime(Math.ceil(t));
    setHealth(h);
  }, []);

  const handleGameOver = useCallback((finalScore: number, screenshot: string | null, reason: string) => {
    setScore(finalScore);
    setLastScreenshot(screenshot);
    setGameOverReason(reason);
    setGameOver(true);
    setPaused(false);
  }, []);

  const handleShare = async () => {
    if (!lastScreenshot) return;

    try {
        const blob = await (await fetch(lastScreenshot)).blob();
        const file = new File([blob], "pixel_postman_score.png", { type: blob.type });

        if (navigator.share) {
            await navigator.share({
                title: 'Pixel Postman Score',
                text: `I delivered ${score} letters in Pixel Postman! Can you beat my score?`,
                files: [file]
            });
        } else {
            // Fallback for desktop: download the image
            const link = document.createElement('a');
            link.href = lastScreenshot;
            link.download = 'pixel_postman_score.png';
            link.click();
        }
    } catch (error) {
        console.error('Error sharing:', error);
        // Fallback text share
        if (navigator.share) {
            navigator.share({
                title: 'Pixel Postman',
                text: `I scored ${score} in Pixel Postman!`,
                url: window.location.href
            }).catch(console.error);
        }
    }
  };

  const startGame = () => {
    audio.init(); // Initialize audio context on user gesture
    setGameStarted(true);
    setGameOver(false);
    setPaused(false);
    setGameKey(prev => prev + 1);
    setScore(0);
    setCombo(0);
    setTime(INITIAL_TIME);
    setHealth(3);
  };

  const resumeGame = () => {
      audio.init();
      setPaused(false);
  };

  return (
    <div className="w-full h-screen relative bg-gray-900 text-white select-none overflow-hidden">
      
      {/* Main Game Layer */}
      {gameStarted && (
        <GameLoop 
          key={gameKey}
          input={input} 
          isPaused={paused}
          onScoreUpdate={handleScoreUpdate} 
          onGameOver={handleGameOver} 
        />
      )}

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
        
        {/* Top HUD */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col bg-black/50 p-2 rounded border-2 border-white/20">
              <span className="text-2xl font-bold text-yellow-400 flex items-center gap-2">
                SCORE: {score}
              </span>
              {combo > 1 && (
                  <span className="text-orange-400 text-lg animate-pulse">
                    COMBO x{combo}!
                  </span>
              )}
            </div>
            {/* Health Bar */}
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <IconHeart key={i} filled={i < health} />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
             <div className={`flex items-center gap-2 text-3xl font-bold p-2 rounded border-2 bg-black/50 ${time < 10 ? 'text-red-500 animate-pulse border-red-500' : 'text-white border-white/20'}`}>
                <IconClock />
                {time}
             </div>
             {gameStarted && !gameOver && (
                 <button 
                    className="pointer-events-auto bg-black/50 p-2 rounded border-2 border-white/20 text-white hover:bg-white/20 active:scale-95 transition-all"
                    onClick={() => setPaused(!paused)}
                 >
                     <IconPause />
                 </button>
             )}
          </div>
        </div>

        {/* Controls Hint (Desktop) */}
        {!gameOver && !paused && gameStarted && (
          <div className="hidden md:block text-center text-white/50 text-sm">
            WASD to Move • SHIFT to Dash • SPACE to Pause
          </div>
        )}

        {/* Mobile Controls */}
        <div className={`flex md:hidden justify-between items-end pointer-events-auto pb-8 ${(paused || gameOver) ? 'opacity-0 pointer-events-none' : ''}`}>
            <VirtualJoystick onMove={handleJoystickMove} onStop={handleJoystickStop} />
            
            <button 
              className="w-20 h-20 bg-blue-500/50 rounded-full border-4 border-blue-300 active:bg-blue-500 backdrop-blur shadow-lg flex items-center justify-center font-bold text-xl"
              onTouchStart={() => setInput(prev => ({ ...prev, dash: true }))}
              onTouchEnd={() => setInput(prev => ({ ...prev, dash: false }))}
              onMouseDown={() => setInput(prev => ({ ...prev, dash: true }))}
              onMouseUp={() => setInput(prev => ({ ...prev, dash: false }))}
            >
              DASH
            </button>
        </div>
      </div>

      {/* Menu Screens */}
      {(!gameStarted || gameOver || paused) && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 pointer-events-auto backdrop-blur-sm p-4">
          <div className="bg-[#222034] border-4 border-white p-6 md:p-8 max-w-lg w-full text-center shadow-2xl flex flex-col max-h-[85vh]">
            <h1 className="text-5xl md:text-6xl font-bold text-[#fbf236] mb-4 tracking-widest shrink-0" style={{ textShadow: '4px 4px #b86f50' }}>
              {paused ? 'PAUSED' : 'PIXEL\nPOSTMAN'}
            </h1>
            
            <div 
              className="flex-1 overflow-y-auto min-h-0 border-t border-b border-white/10 py-4 mb-4 custom-scrollbar relative touch-pan-y"
              style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
                {gameOver ? (
                   <div className="h-full flex flex-col justify-center">
                     <p className="text-red-400 text-3xl mb-2 font-bold animate-pulse">
                        {gameOverReason === 'TIMEOUT' ? "TIME'S UP!" : "WIPEOUT!"}
                     </p>
                     <div className="text-4xl mb-4 text-white">Final Score: <span className="text-yellow-400">{score}</span></div>
                     {lastScreenshot && (
                        <button 
                            onClick={handleShare}
                            className="mb-4 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded flex items-center justify-center gap-2 mx-auto shadow-lg"
                        >
                            <IconShare /> Share Score Screenshot
                        </button>
                     )}
                     <p className="text-gray-400 text-sm">
                        {gameOverReason === 'TIMEOUT' 
                            ? "You ran out of time. Deliver faster!" 
                            : "You took too much damage. Watch out for cars and puddles!"}
                     </p>
                   </div>
                ) : (
                    <RulesContent />
                )}
            </div>

            <div className="shrink-0 w-full flex flex-col gap-3">
              <button 
                onClick={paused ? resumeGame : startGame}
                className="w-full bg-[#ac3232] hover:bg-[#d95763] text-white text-3xl font-bold py-4 px-6 border-b-8 border-[#663931] active:border-b-0 active:mt-2 transition-all rounded"
              >
                {paused ? 'RESUME' : (gameOver ? 'TRY AGAIN' : 'START ROUTE')}
              </button>

              {paused && (
                <button 
                  onClick={startGame}
                  className="w-full bg-[#596e79] hover:bg-[#748b99] text-white text-xl font-bold py-3 px-6 border-b-6 border-[#37454d] active:border-b-0 active:mt-2 transition-all rounded"
                >
                  RESTART GAME
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
