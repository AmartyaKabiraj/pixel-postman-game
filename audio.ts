
type Note = { freq: number; dur: number; type?: OscillatorType };
type MusicTrack = 'MENU' | 'GAME' | 'GAME_OVER' | 'NONE';

class AudioManager {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;

  isPlaying: boolean = false;
  currentTrack: MusicTrack = 'NONE';
  nextNoteTime: number = 0;
  noteIndex: number = 0;
  tempo: number = 120;
  timerID: number | null = null;
  
  // Simple melodies (Frequency arrays)
  melodies: Record<MusicTrack, number[]> = {
    MENU: [
      261.63, 329.63, 392.00, 523.25, // C Major Arp
      261.63, 329.63, 392.00, 493.88,
      293.66, 349.23, 440.00, 587.33,
      293.66, 349.23, 440.00, 246.94
    ],
    GAME: [
      110.00, 110.00, 220.00, 110.00, // A Minor driving bass
      130.81, 130.81, 261.63, 130.81,
      146.83, 146.83, 293.66, 146.83,
      164.81, 146.83, 130.81, 123.47
    ],
    GAME_OVER: [
      196.00, 185.00, 174.61, 164.81, 155.56, 146.83, 130.81, 110.00
    ],
    NONE: []
  };

  constructor() {
    // Lazy init
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; // Master volume
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.4;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq: number, type: OscillatorType, duration: number, when: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.value = freq;
    
    osc.connect(gain);
    gain.connect(this.musicGain);
    
    gain.gain.setValueAtTime(0.1, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    
    osc.start(when);
    osc.stop(when + duration);
  }

  scheduler() {
    if (!this.ctx || this.currentTrack === 'NONE') return;
    
    const lookahead = 25.0; // ms
    const scheduleAheadTime = 0.1; // s

    while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      const track = this.melodies[this.currentTrack];
      if (track && track.length > 0) {
        const freq = track[this.noteIndex % track.length];
        
        // Variation for game track
        if (this.currentTrack === 'GAME') {
             // Add a high hat tick
             this.playNoise(0.05, this.nextNoteTime, 0.05);
        }

        if (freq > 0) {
            this.playTone(freq, this.currentTrack === 'GAME' ? 'square' : 'triangle', 0.2, this.nextNoteTime);
        }

        const secondsPerBeat = 60.0 / this.tempo;
        this.nextNoteTime += secondsPerBeat * 0.5; // 8th notes
        this.noteIndex++;
      } else {
        // Fallback or end
        this.nextNoteTime += 0.5; 
      }
    }
    
    this.timerID = window.setTimeout(this.scheduler.bind(this), lookahead);
  }

  playMusic(track: MusicTrack) {
    this.init();
    if (this.currentTrack === track) return;
    
    this.currentTrack = track;
    this.noteIndex = 0;
    
    if (track === 'MENU') this.tempo = 100;
    if (track === 'GAME') this.tempo = 140;
    if (track === 'GAME_OVER') this.tempo = 60;
    
    if (this.ctx) {
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        if (this.timerID) clearTimeout(this.timerID);
        this.scheduler();
    }
  }

  stopMusic() {
    if (this.timerID) clearTimeout(this.timerID);
    this.currentTrack = 'NONE';
  }

  pauseMusic() {
      // Just mute/unmute or simple stop
      if (this.musicGain) {
          // Fade out
          this.musicGain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.1);
      }
  }

  resumeMusic() {
      if (this.musicGain) {
          this.musicGain.gain.setTargetAtTime(0.4, this.ctx!.currentTime, 0.1);
      }
  }

  // --- SFX ---

  playDash() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    // Filtered noise swoosh
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.3);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    
    noise.start(t);
  }

  playDelivery() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1760, t + 0.1); // Coin sound
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.4);
  }

  playHit() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.2); // Drop
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playSplash() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Noise
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(t);
  }

  playPowerup() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.3);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.3);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playMoveTick() {
      // Very short click for bike movement
      this.init();
      if (!this.ctx || !this.sfxGain) return;
      const t = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 200;
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.03);
  }

  playNoise(dur: number, when: number, vol: number) {
      if (!this.ctx || !this.musicGain) return;
      const bufferSize = this.ctx.sampleRate * dur;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0; i<bufferSize; i++) data[i] = Math.random() * 2 - 1;
      
      const node = this.ctx.createBufferSource();
      node.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
      
      node.connect(gain);
      gain.connect(this.musicGain);
      node.start(when);
  }
}

export const audio = new AudioManager();
