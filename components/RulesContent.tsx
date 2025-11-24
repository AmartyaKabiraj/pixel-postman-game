import React from 'react';

export const KeyCap = ({ label, wide = false }: { label: string, wide?: boolean }) => (
  <span className={`inline-flex items-center justify-center bg-gray-700 text-gray-100 border-b-4 border-gray-900 rounded ${wide ? 'w-16' : 'w-8'} h-8 font-bold text-lg leading-none mx-0.5 shadow-sm transform active:translate-y-1 active:border-b-0`}>
    {label}
  </span>
);

export const RulesContent = () => (
  <div className="w-full max-w-2xl mx-auto font-vt323 text-[#cbdbfc] select-none text-left space-y-6">
    
    {/* Section: The Mission */}
    <div className="bg-[#353545] border-2 border-white/20 p-4 rounded-lg shadow-lg relative mt-2">
         <div className="absolute -top-3 left-4 bg-[#fbf236] text-black px-3 font-bold transform -rotate-2 border-2 border-white shadow-sm text-lg tracking-widest">
            MISSION
         </div>
         <div className="flex items-center gap-4 mt-2">
             <div className="text-5xl drop-shadow-md">🏠</div>
             <div className="text-xl leading-tight">
                Follow the <span className="text-[#fbf236] font-bold">Yellow Arrow</span>.<br/> 
                Deliver mail to the <span className="text-red-400 animate-pulse font-bold bg-red-900/30 px-1 rounded">BLINKING HOUSE</span>!
             </div>
         </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section: Arsenal (Powerups) */}
        <div className="bg-[#2c3e50] border-2 border-blue-400/30 p-4 rounded-lg relative pt-6 shadow-lg flex flex-col h-full">
             <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 text-sm border border-white/20 uppercase tracking-widest font-bold shadow-sm whitespace-nowrap">
                Items
             </div>
             <div className="flex flex-col gap-4 mt-1">
                 <div className="flex gap-3 items-start bg-black/20 p-2 rounded border border-white/5">
                     <span className="text-2xl drop-shadow-sm w-10 text-center">☕</span>
                     <div>
                        <span className="text-yellow-200 font-bold block text-lg">COFFEE</span>
                        <span className="text-sm text-blue-100/80 leading-tight block">Refills your Run Meter and heals <span className="text-green-400 font-bold">1 Heart</span>.</span>
                     </div>
                 </div>
                 <div className="flex gap-3 items-start bg-black/20 p-2 rounded border border-white/5">
                     <span className="text-2xl drop-shadow-sm w-10 text-center">⏰</span>
                     <div>
                        <span className="text-white font-bold block text-lg">CLOCK</span>
                        <span className="text-sm text-blue-100/80 leading-tight block">Extends your deadline by adding <span className="text-white font-bold">10 seconds</span>.</span>
                     </div>
                 </div>
                 <div className="flex gap-3 items-start bg-black/20 p-2 rounded border border-white/5">
                     <span className="text-2xl drop-shadow-sm w-10 text-center">🚦</span>
                     <div>
                        <span className="text-orange-400 font-bold block text-lg">JAMMER</span>
                        <span className="text-sm text-blue-100/80 leading-tight block">Freezes all traffic for 10 seconds.</span>
                     </div>
                 </div>
                 <div className="flex gap-3 items-start bg-black/20 p-2 rounded border border-white/5">
                     <span className="text-2xl drop-shadow-sm w-10 text-center">🧥</span>
                     <div>
                        <span className="text-yellow-400 font-bold block text-lg">RAINCOAT</span>
                        <span className="text-sm text-blue-100/80 leading-tight block">Grants temporary immunity to puddle slips.</span>
                     </div>
                 </div>
             </div>
        </div>

         {/* Section: Threats (Hazards) */}
        <div className="bg-[#3e2c2c] border-2 border-red-400/30 p-4 rounded-lg relative pt-6 shadow-lg flex flex-col h-full">
             <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-3 text-sm border border-white/20 uppercase tracking-widest font-bold shadow-sm whitespace-nowrap">
                Danger
             </div>
             <div className="flex flex-col gap-4 mt-1">
                 <div className="flex gap-3 items-start bg-black/20 p-2 rounded border border-white/5">
                     <span className="text-2xl drop-shadow-sm w-10 text-center">🚗</span>
                     <div>
                        <span className="text-red-300 font-bold block text-lg">CARS</span>
                        <span className="text-sm text-red-100/80 leading-tight block">
                            Getting hit removes <span className="text-red-400 font-bold">1 Heart</span>. They back out of driveways unexpectedly!
                        </span>
                     </div>
                 </div>
                 <div className="flex gap-3 items-start bg-black/20 p-2 rounded border border-white/5">
                     <span className="text-2xl drop-shadow-sm w-10 text-center">💧</span>
                     <div>
                        <span className="text-blue-300 font-bold block text-lg">PUDDLE</span>
                        <span className="text-sm text-red-100/80 leading-tight block">
                            Walking through puddles without a raincoat causes you to slip and lose <span className="text-red-400 font-bold">1 Heart</span>. Dash over them!
                        </span>
                     </div>
                 </div>
                 <div className="flex gap-3 items-start bg-black/20 p-2 rounded border border-white/5">
                     <span className="text-2xl drop-shadow-sm w-10 text-center">⌛</span>
                     <div>
                        <span className="text-gray-300 font-bold block text-lg">TIME OUT</span>
                        <span className="text-sm text-red-100/80 leading-tight block">
                            If the timer hits zero, it's <span className="text-red-400 font-bold">GAME OVER</span>. Deliver mail to gain time.
                        </span>
                     </div>
                 </div>
             </div>
        </div>
    </div>

    {/* Section: Controls */}
    <div className="bg-white/5 border border-white/10 p-4 rounded-lg text-center shadow-lg">
         <div className="text-xs text-gray-400 mb-3 uppercase tracking-[0.2em] border-b border-white/5 pb-1 w-full">- Controls -</div>
         
         {/* Desktop */}
         <div className="hidden md:flex justify-center items-center gap-8">
            <div className="flex flex-col items-center gap-2">
                <div className="flex flex-col gap-1">
                    <div className="flex justify-center"><KeyCap label="W" /></div>
                    <div className="flex"><KeyCap label="A" /><KeyCap label="S" /><KeyCap label="D" /></div>
                </div>
                <span className="text-xs text-gray-400 tracking-wider">MOVE</span>
            </div>
            
            <div className="h-12 w-px bg-white/10"></div>

            <div className="flex flex-col items-center gap-2">
                <div className="flex items-end h-[52px]">
                   <KeyCap label="SHIFT" wide />
                </div>
                <span className="text-xs text-gray-400 tracking-wider">RUN</span>
            </div>

            <div className="h-12 w-px bg-white/10"></div>

            <div className="flex flex-col items-center gap-2">
                <div className="flex items-end h-[52px]">
                   <KeyCap label="SPACE" wide />
                </div>
                <span className="text-xs text-gray-400 tracking-wider">PAUSE</span>
            </div>
         </div>

         {/* Mobile */}
         <div className="md:hidden text-gray-300 flex justify-around items-center py-2">
             <div className="flex flex-col items-center gap-2">
                 <div className="w-12 h-12 rounded-full border-2 border-white/20 bg-white/5 flex items-center justify-center relative">
                    <div className="w-4 h-4 bg-white/50 rounded-full shadow-lg"></div>
                 </div>
                 <span className="text-xs uppercase tracking-wide opacity-70">Joystick</span>
             </div>
             <div className="flex flex-col items-center gap-2">
                 <div className="w-12 h-12 rounded-full bg-[#6f4e37] border-b-4 border-[#4a332a] flex items-center justify-center font-bold text-white/90 text-xs shadow-lg active:border-b-0 active:translate-y-1">
                    RUN
                 </div>
                 <span className="text-xs uppercase tracking-wide opacity-70">Button</span>
             </div>
         </div>
    </div>
  </div>
);