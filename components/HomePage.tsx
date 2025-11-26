import React, { useState } from 'react';
import { IsometricBackground } from './IsometricBackground';
import { RulesContent } from './RulesContent';

interface HomePageProps {
  onPlay: () => void;
}

const IconBook = () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
);

const IconPlay = () => (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const HomePage: React.FC<HomePageProps> = ({ onPlay }) => {
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#2d2d2d] overflow-hidden font-vt323 text-white touch-none">
      {/* Background Illustration */}
      <IsometricBackground />

      <style>{`
          @keyframes float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-10px); }
          }
          @keyframes slideUp {
              from { transform: translateY(50px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
          }
          @keyframes popIn {
              0% { transform: scale(0.8); opacity: 0; }
              70% { transform: scale(1.1); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
          }
          .anim-float { animation: float 4s ease-in-out infinite; }
          .anim-slide-up { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .anim-pop-in { animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
          .delay-1 { animation-delay: 0.1s; }
          .delay-2 { animation-delay: 0.3s; }
          .delay-3 { animation-delay: 0.5s; }
      `}</style>

      {/* Main Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6 pointer-events-none">
        
        {/* Title Section */}
        <div className="text-center mb-12 transform hover:scale-105 transition-transform duration-500 anim-slide-up">
            <h1 className="text-8xl md:text-9xl font-bold text-[#fbf236] tracking-widest leading-none relative z-10" 
                style={{ textShadow: '6px 6px 0px #b86f50, 10px 10px 0px #000, 0 0 30px rgba(251, 242, 54, 0.5)' }}>
                <span className="inline-block anim-float">PIXEL</span><br/>
                <span className="inline-block anim-float" style={{ animationDelay: '0.2s' }}>POSTMAN</span>
            </h1>
            <div className="mt-6 anim-slide-up delay-1">
                <p className="text-lg md:text-2xl text-blue-200 bg-[#222034]/80 inline-block px-6 py-2 rounded-full border border-white/20 shadow-lg backdrop-blur-md">
                    made by <span className="text-yellow-400 font-bold">Amartya</span> with <span className="text-blue-400 font-bold">Gemini</span>
                </p>
            </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-6 w-full max-w-xs pointer-events-auto anim-pop-in delay-2">
            <button 
                onClick={onPlay}
                className="group relative bg-[#4d9be6] hover:bg-[#639bff] text-white text-3xl font-bold py-5 px-8 rounded-xl shadow-[0_8px_0_#2a5d8f] active:shadow-none active:translate-y-[8px] transition-all flex items-center justify-center gap-4 border-2 border-white/30 overflow-hidden"
            >
                {/* Shine effect */}
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shine_1s_infinite] transform skew-x-12" />
                
                <span className="bg-white/20 p-2 rounded-full group-hover:scale-110 transition-transform shadow-inner">
                    <IconPlay />
                </span>
                <span className="drop-shadow-md">PLAY GAME</span>
            </button>

            <button 
                onClick={() => setShowRules(true)}
                className="group bg-[#353545] hover:bg-[#45455a] text-[#cbdbfc] text-xl font-bold py-4 px-6 rounded-xl shadow-[0_6px_0_#1a1a2e] active:shadow-none active:translate-y-[6px] transition-all flex items-center justify-center gap-3 border-2 border-white/10"
            >
                <span className="group-hover:rotate-12 transition-transform">
                    <IconBook />
                </span>
                HOW TO PLAY
            </button>
        </div>
      </div>

      {/* Rules Modal */}
      {showRules && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowRules(false)}>
              <div className="bg-[#222034] border-4 border-white p-6 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl transform transition-all animate-pop-in" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2 flex-shrink-0">
                      <h2 className="text-3xl font-bold text-[#fbf236] tracking-wider">GAME RULES</h2>
                      <button onClick={() => setShowRules(false)} className="text-gray-400 hover:text-white text-4xl font-bold px-2 leading-none hover:rotate-90 transition-transform">&times;</button>
                  </div>
                  <div className="overflow-y-auto custom-scrollbar pr-2 flex-1">
                      <RulesContent />
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/10 text-center flex-shrink-0">
                      <button onClick={() => setShowRules(false)} className="bg-[#4d9be6] text-white py-3 px-8 rounded-lg font-bold shadow-[0_4px_0_#2a5d8f] hover:bg-[#639bff] active:shadow-none active:translate-y-[4px] text-xl transition-all">GOT IT</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};