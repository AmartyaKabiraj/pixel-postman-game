import React, { useState, useEffect, useCallback } from 'react';
import { GameLoop } from './components/GameLoop';
import { VirtualJoystick } from './components/VirtualJoystick';
import { HomePage } from './components/HomePage';
import { RulesContent } from './components/RulesContent';
import { INITIAL_TIME, MAX_BOOST_CHARGE } from './constants';
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
const IconExit = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;

const BuffBar = ({ label, timer, max, color }: { label: string, timer: number, max: number, color: string }) => {
  if (timer <= 0) return null;
  const pct = Math.min(100, Math.max(0, (timer / max) * 100));
  return (
    <div className="flex flex-col w-32 md:w-48 mb-2 drop-shadow-md">
      <div className="flex justify-between text-xs font-bold text-white bg-black/50 px-1 rounded-t">
        <span>{label}</span>
        <span>{timer.toFixed(1)}s</span>
      </div>
      <div className="h-2 w-full bg-gray-700 rounded-b overflow-hidden border border-white/20">
        <div 
            className="h-full transition-all duration-100 ease-linear"
            style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

const BoostBar = ({ charge }: { charge: number }) => {
    return (
        <div className="flex flex-col mb-2 drop-shadow-md w-full max-w-[12rem]">
             <div className="text-xs font-bold text-white bg-black/50 px-1 rounded-t text-center tracking-widest">
                 RUN
             </div>
             <div className="flex h-4 w-full bg-gray-900 rounded-b border border-white/20 p-0.5 gap-0.5">
                 {[...Array(MAX_BOOST_CHARGE)].map((_, i) => (
                     <div 
                        key={i} 
                        className={`flex-1 rounded-sm transition-colors duration-200 ${i < charge ? 'bg-[#9d4edd] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]' : 'bg-[#1a1a1a]'}`}
                     />
                 ))}
             </div>
        </div>
    );
};

export default function App() {
  const [view, setView] = useState<'HOME' | 'GAME'>('HOME');

  // Input State
  const [input, setInput] = useState({ x: 0, y: 0, dash: false });
  const [keys, setKeys] = useState<Record<string, boolean>>({});

  // UI State
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(INITIAL_TIME);
  const [health, setHealth] = useState(3);
  const [activeBuffs, setActiveBuffs] = useState({ traffic: 0, immunity: 0 });
  const [boostCharge, setBoostCharge] = useState(0);
  const [boostUnlocked, setBoostUnlocked] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameKey, setGameKey] = useState(0); // to reset game
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);

  // Audio Logic
  useEffect(() => {
    if (view === 'HOME') {
        audio.playMusic('NONE'); // Or maybe a nice ambient if implemented
        return;
    }

    // Determine which track to play
    if (gameOver) {
      audio.playMusic('GAME_OVER');
    } else if (paused) {
      audio.pauseMusic(); 
    } else if (gameStarted) {
      audio.resumeMusic();
      audio.playMusic('GAME');
    } else {
      // Start/Menu screen
      audio.playMusic('MENU');
    }
  }, [gameStarted, paused, gameOver, view]);

  // Keyboard Listeners
  useEffect(() => {
    if (view !== 'GAME') return;

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
  }, [gameStarted, gameOver, view]);

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

  const handleScoreUpdate = useCallback((s: number, t: number, h: number, trafficT: number, immunityT: number, boostC: number, boostU: boolean) => {
    setScore(s);
    setTime(Math.ceil(t));
    setHealth(h);
    setActiveBuffs({ traffic: trafficT, immunity: immunityT });
    setBoostCharge(boostC);
    setBoostUnlocked(boostU);
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
            const link = document.createElement('a');
            link.href = lastScreenshot;
            link.download = 'pixel_postman_score.png';
            link.click();
        }
    } catch (error) {
        console.error('Error sharing:', error);
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
    audio.init(); 
    setGameStarted(true);
    setGameOver(false);
    setPaused(false);
    setGameKey(prev => prev + 1);
    setScore(0);
    setTime(INITIAL_TIME);
    setHealth(3);
    setActiveBuffs({ traffic: 0, immunity: 0 });
    setBoostCharge(0);
    setBoostUnlocked(false);
  };

  const resumeGame = () => {
      audio.init();
      setPaused(false);
  };

  const handleExit = () => {
      setView('HOME');
      setGameStarted(false);
      setGameOver(false);
      setPaused(false);
      setGameKey(prev => prev + 1); // Reset game loop state
      audio.stopMusic();
  };

  if (view === 'HOME') {
      return <HomePage onPlay={() => setView('GAME')} />;
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-gray-900 text-white select-none overflow-hidden touch-none">
      
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
        <div className="flex flex-col w-full pointer-events-none">
            <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col gap-2 pointer-events-auto">
                    <div className="flex flex-col bg-black/50 p-2 rounded border-2 border-white/20">
                    <span className="text-2xl font-bold text-yellow-400 flex items-center gap-2">
                        SCORE: {score}
                    </span>
                    </div>
                    {/* Health Bar */}
                    <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => (
                        <IconHeart key={i} filled={i < health} />
                    ))}
                    </div>
                    {/* Boost Bar */}
                    <BoostBar charge={boostCharge} />
                </div>

                <div className="flex flex-col items-end gap-2 pointer-events-auto">
                    <div className="flex gap-2">
                        <div className={`flex items-center gap-2 text-3xl font-bold p-2 rounded border-2 bg-black/50 ${time < 10 ? 'text-red-500 animate-pulse border-red-500' : 'text-white border-white/20'}`}>
                            <IconClock />
                            {time}
                        </div>
                        {gameStarted && !gameOver && (
                            <button 
                                className="bg-black/50 p-2 rounded border-2 border-white/20 text-white hover:bg-white/20 active:scale-95 transition-all"
                                onClick={() => setPaused(!paused)}
                            >
                                <IconPause />
                            </button>
                        )}
                    </div>
                    {/* Buff Bars moved to right */}
                    <div className="flex flex-col items-end">
                         <BuffBar label="TRAFFIC STOP" timer={activeBuffs.traffic} max={10} color="#ef4444" />
                         <BuffBar label="PUDDLE IMMUNITY" timer={activeBuffs.immunity} max={10} color="#facc15" />
                    </div>
                </div>
            </div>
        </div>

        {/* Controls Hint (Desktop) */}
        {!gameOver && !paused && gameStarted && (
          <div className="hidden md:block text-center text-white/50 text-sm">
            WASD to Move • SHIFT to Run • SPACE to Pause
          </div>
        )}

        {/* Mobile Controls */}
        <div className={`flex md:hidden justify-between items-end pointer-events-auto pb-12 ${(paused || gameOver) ? 'opacity-0 pointer-events-none' : ''}`}>
             <button 
              className={`w-20 h-20 rounded-full border-4 backdrop-blur shadow-lg flex items-center justify-center font-bold text-xl transition-all duration-300
                  ${boostUnlocked ? 'bg-[#9d4edd]/80 border-[#c77dff] active:bg-[#9d4edd] text-white opacity-100' : 'opacity-0 pointer-events-none scale-0'}
                  ${boostCharge > 0 ? '' : 'grayscale opacity-50'}
              `}
              onTouchStart={() => setInput(prev => ({ ...prev, dash: true }))}
              onTouchEnd={() => setInput(prev => ({ ...prev, dash: false }))}
              onMouseDown={() => setInput(prev => ({ ...prev, dash: true }))}
              onMouseUp={() => setInput(prev => ({ ...prev, dash: false }))}
            >
              RUN
            </button>

            <VirtualJoystick onMove={handleJoystickMove} onStop={handleJoystickStop} />
        </div>
      </div>

      {/* Menu Screens (Start / Pause / Game Over) */}
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
              {/* Start / Resume / Retry Button */}
              <button 
                onClick={paused ? resumeGame : startGame}
                className="w-full bg-[#ac3232] hover:bg-[#d95763] text-white text-3xl font-bold py-4 px-6 border-b-8 border-[#663931] active:border-b-0 active:mt-2 transition-all rounded"
              >
                {paused ? 'RESUME' : (gameOver ? 'TRY AGAIN' : 'START ROUTE')}
              </button>

              {/* Pause Menu Actions */}
              {paused && (
                <div className="flex gap-3">
                    <button 
                      onClick={startGame}
                      className="flex-1 bg-[#596e79] hover:bg-[#748b99] text-white text-xl font-bold py-3 px-2 border-b-6 border-[#37454d] active:border-b-0 active:mt-2 transition-all rounded flex items-center justify-center gap-2"
                    >
                      <span className="text-sm">RESTART</span>
                    </button>
                    <button 
                      onClick={handleExit}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold py-3 px-2 border-b-6 border-gray-900 active:border-b-0 active:mt-2 transition-all rounded flex items-center justify-center gap-2"
                    >
                       <IconExit /> <span className="text-sm">EXIT</span>
                    </button>
                </div>
              )}

              {/* Game Over Actions */}
              {gameOver && (
                  <button 
                    onClick={handleExit}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold py-3 px-6 border-b-6 border-gray-900 active:border-b-0 active:mt-2 transition-all rounded flex items-center justify-center gap-2"
                  >
                     <IconExit /> EXIT TO HOME
                  </button>
              )}
              
              {/* Start Menu Actions */}
              {!gameStarted && !gameOver && !paused && (
                  <button 
                    onClick={handleExit}
                    className="w-full bg-transparent hover:bg-white/10 text-white/50 text-sm font-bold py-2 px-6 rounded transition-all"
                  >
                     &lt; BACK TO HOME
                  </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}