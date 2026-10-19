// Procedural audio: every sound effect and all music are synthesised with the Web Audio API,
// so the game ships without audio files.

export type Sfx =
  | 'click'
  | 'tick'
  | 'spinStart'
  | 'reelStop'
  | 'win'
  | 'noMatch'
  | 'launch'
  | 'land'
  | 'merge'
  | 'promote'
  | 'upgrade'
  | 'equip'
  | 'salvage'
  | 'pickup'
  | 'place'
  | 'beam'
  | 'pellet'
  | 'shell'
  | 'explosion'
  | 'bigExplosion'
  | 'enemyDie'
  | 'slash'
  | 'mechHit'
  | 'enemyShot'
  | 'sniper'
  | 'baseHit'
  | 'heal'
  | 'scrap'
  | 'waveStart'
  | 'bossStart'
  | 'waveClear'
  | 'gameOver'
  | 'victory';

export type MusicMode = 'none' | 'build' | 'combat' | 'boss';

export interface AudioSettings {
  music: number;
  sfx: number;
  musicMuted: boolean;
  sfxMuted: boolean;
}

const STORAGE_KEY = 'mecha-slots-audio';
const VOLUME_STEPS = 10;

/** Minimum seconds between two plays of the same sound, so big fights don't turn into noise. */
const MIN_GAP: Partial<Record<Sfx, number>> = {
  tick: 0.05,
  beam: 0.05,
  pellet: 0.07,
  slash: 0.06,
  mechHit: 0.09,
  enemyShot: 0.05,
  sniper: 0.1,
  explosion: 0.07,
  enemyDie: 0.05,
  shell: 0.08,
  heal: 0.9,
  scrap: 0.06,
  baseHit: 0.25,
  land: 0.05,
};

const MAX_VOICES = 48;

function midi(n: number): number {
  return 440 * 2 ** ((n - 69) / 12);
}

interface ToneOpts {
  when?: number;
  attack?: number;
  dest?: AudioNode;
  filter?: { type: BiquadFilterType; freq: number; q?: number; to?: number };
  detune?: number;
}

interface Pattern {
  tempo: number;
  chords: number[][];
}

const PATTERNS: Record<Exclude<MusicMode, 'none'>, Pattern> = {
  // A minor: Am, F, C, G.
  build: { tempo: 84, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
  combat: { tempo: 128, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
  // Darker progression for boss waves: Am, Bb, Gm, Am.
  boss: { tempo: 140, chords: [[57, 60, 64], [58, 62, 65], [55, 58, 62], [57, 60, 64]] },
};

export class AudioEngine {
  settings: AudioSettings = { music: 5, sfx: 7, musicMuted: false, sfxMuted: false };

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private lastPlayed = new Map<Sfx, number>();
  private voices = 0;
  private pitch = 1;

  private mode: MusicMode = 'none';
  private pendingMode: MusicMode = 'none';
  private step = 0;
  private nextStepTime = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AudioSettings> | null;
      if (saved) this.settings = { ...this.settings, ...saved };
    } catch {
      // Storage unavailable: keep the defaults.
    }
  }

  /** Browsers only allow audio after a user gesture; call this from input handlers. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;
      this.applyVolumes();
      window.setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // ---------- Settings ----------

  get steps(): number {
    return VOLUME_STEPS;
  }

  changeVolume(kind: 'music' | 'sfx', delta: number): void {
    this.settings[kind] = Math.max(0, Math.min(VOLUME_STEPS, this.settings[kind] + delta));
    if (delta > 0) this.settings[kind === 'music' ? 'musicMuted' : 'sfxMuted'] = false;
    this.save();
  }

  toggleMute(kind: 'music' | 'sfx'): void {
    const key = kind === 'music' ? 'musicMuted' : 'sfxMuted';
    this.settings[key] = !this.settings[key];
    this.save();
  }

  /** Mutes everything, or unmutes everything if it was all muted. */
  toggleMuteAll(): void {
    const allMuted = this.settings.musicMuted && this.settings.sfxMuted;
    this.settings.musicMuted = !allMuted;
    this.settings.sfxMuted = !allMuted;
    this.save();
  }

  private save(): void {
    this.applyVolumes();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage unavailable: settings last for this session only.
    }
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const curve = (v: number) => (v / VOLUME_STEPS) ** 2;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.settings.musicMuted ? 0 : curve(this.settings.music) * 0.7, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfxMuted ? 0 : curve(this.settings.sfx), t, 0.05);
  }

  // ---------- Synth building blocks ----------

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, o: ToneOpts = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.when ?? 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * this.pitch, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * this.pitch), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    this.envelope(g, t, peak, o.attack ?? 0.004, dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.freq, t);
      if (o.filter.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t + dur);
      f.Q.value = o.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(o.dest ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    this.track(osc);
  }

  private noise(dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, o: ToneOpts = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = o.filter?.q ?? 0.8;
    const g = ctx.createGain();
    this.envelope(g, t, peak, o.attack ?? 0.002, dur);
    src.connect(f).connect(g).connect(o.dest ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    this.track(src);
  }

  private envelope(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
  }

  private track(node: AudioScheduledSourceNode): void {
    this.voices++;
    node.onended = () => this.voices--;
  }

  private notes(semis: number[], base: number, gap: number, dur: number, peak: number, type: OscillatorType = 'triangle'): void {
    semis.forEach((s, k) => this.tone(type, base * 2 ** (s / 12), base * 2 ** (s / 12), dur, peak, { when: k * gap }));
  }

  // ---------- Sound effects ----------

  play(name: Sfx, opts: { count?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.settings.sfxMuted || this.settings.sfx === 0) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0;
    if (gap && now - (this.lastPlayed.get(name) ?? -1) < gap) return;
    const essential = !(name in MIN_GAP);
    if (!essential && this.voices > MAX_VOICES) return;
    this.lastPlayed.set(name, now);
    this.pitch = 0.95 + Math.random() * 0.1;

    switch (name) {
      case 'click':
        this.pitch = 1;
        this.tone('square', 1300, 900, 0.03, 0.08);
        break;
      case 'tick':
        this.tone('square', 2400, 2000, 0.012, 0.03);
        break;
      case 'spinStart':
        this.tone('sawtooth', 160, 520, 0.22, 0.08, { filter: { type: 'lowpass', freq: 600, to: 2400 } });
        this.noise(0.2, 0.12, 'bandpass', 600, 2600);
        break;
      case 'reelStop':
        this.tone('sine', 190, 60, 0.09, 0.45);
        this.noise(0.03, 0.15, 'lowpass', 2500, 1200);
        break;
      case 'win': {
        this.pitch = 1;
        const big = (opts.count ?? 1) > 1;
        this.notes(big ? [0, 4, 7, 12, 16, 19] : [0, 4, 7, 12], 659, 0.07, 0.22, 0.16);
        this.noise(0.4, 0.05, 'highpass', 6000, 9000, { when: 0.1 });
        break;
      }
      case 'noMatch':
        this.tone('square', 240, 200, 0.09, 0.06, { filter: { type: 'lowpass', freq: 1200 } });
        this.tone('square', 190, 150, 0.14, 0.06, { when: 0.1, filter: { type: 'lowpass', freq: 1200 } });
        break;
      case 'launch':
        this.tone('sawtooth', 220, 1100, 0.4, 0.08, { filter: { type: 'lowpass', freq: 500, to: 4000 } });
        this.noise(0.45, 0.12, 'bandpass', 500, 3500);
        break;
      case 'land':
        this.tone('sine', 130, 40, 0.18, 0.45);
        this.noise(0.12, 0.15, 'lowpass', 900, 200);
        break;
      case 'merge':
        this.tone('triangle', 523, 1046, 0.2, 0.15);
        this.tone('sine', 1568, 1568, 0.25, 0.06, { when: 0.12 });
        this.noise(0.25, 0.06, 'highpass', 5000, 8000, { when: 0.05 });
        break;
      case 'promote':
        this.pitch = 1;
        this.notes([0, 4, 7, 12], 392, 0.09, 0.16, 0.12, 'square');
        this.tone('square', 392 * 2 ** (16 / 12), 392 * 2 ** (16 / 12), 0.5, 0.12, { when: 0.36, filter: { type: 'lowpass', freq: 3000 } });
        break;
      case 'upgrade':
        this.pitch = 1;
        for (const s of [0, 4, 7, 12]) this.tone('sawtooth', 330 * 2 ** (s / 12), 330 * 2 ** (s / 12), 0.6, 0.05, { attack: 0.02, filter: { type: 'lowpass', freq: 2500 } });
        this.noise(0.6, 0.05, 'highpass', 6000, 10000, { when: 0.05 });
        break;
      case 'equip':
        this.tone('square', 2200, 1800, 0.025, 0.06);
        this.tone('triangle', 880, 1320, 0.12, 0.12, { when: 0.03 });
        break;
      case 'salvage':
        this.tone('sawtooth', 700, 90, 0.32, 0.09, { filter: { type: 'lowpass', freq: 2000, to: 300 } });
        this.noise(0.25, 0.12, 'bandpass', 1500, 400);
        break;
      case 'pickup':
        this.tone('sine', 600, 900, 0.06, 0.08);
        break;
      case 'place':
        this.tone('sine', 420, 260, 0.08, 0.12);
        this.noise(0.05, 0.06, 'lowpass', 1500, 600);
        break;
      case 'beam':
        this.tone('sawtooth', 1700, 260, 0.13, 0.06, { filter: { type: 'bandpass', freq: 1800, q: 2 } });
        this.tone('sine', 2600, 900, 0.08, 0.04);
        break;
      case 'pellet':
        this.tone('square', 1100, 600, 0.05, 0.035);
        break;
      case 'shell':
        this.tone('sine', 110, 50, 0.22, 0.35);
        this.noise(0.12, 0.12, 'lowpass', 1200, 300);
        break;
      case 'explosion':
        this.noise(0.45, 0.32, 'lowpass', 1400, 150);
        this.tone('sine', 80, 30, 0.35, 0.3);
        break;
      case 'bigExplosion':
        this.noise(1.1, 0.55, 'lowpass', 2200, 90);
        this.tone('sine', 65, 22, 0.9, 0.5);
        this.noise(0.5, 0.2, 'bandpass', 900, 200, { when: 0.12 });
        break;
      case 'enemyDie':
        this.noise(0.28, 0.22, 'lowpass', 1800, 250);
        this.tone('square', 300, 80, 0.15, 0.04);
        break;
      case 'slash':
        this.noise(0.13, 0.16, 'bandpass', 2500, 6500, { filter: { type: 'bandpass', freq: 2500, q: 1.5 } });
        this.tone('sawtooth', 900, 2200, 0.09, 0.03);
        break;
      case 'mechHit':
        this.tone('square', 160, 90, 0.07, 0.07, { filter: { type: 'lowpass', freq: 1200 } });
        this.noise(0.05, 0.08, 'bandpass', 1200, 800);
        break;
      case 'enemyShot':
        this.noise(0.04, 0.06, 'highpass', 2500, 2000);
        this.tone('square', 650, 380, 0.04, 0.025);
        break;
      case 'sniper':
        this.tone('sawtooth', 2800, 180, 0.32, 0.06, { filter: { type: 'lowpass', freq: 5000, to: 600 } });
        this.tone('sine', 1400, 1400, 0.05, 0.05);
        break;
      case 'baseHit':
        this.pitch = 1;
        this.tone('square', 440, 440, 0.12, 0.08, { filter: { type: 'lowpass', freq: 2000 } });
        this.tone('square', 330, 330, 0.14, 0.08, { when: 0.13, filter: { type: 'lowpass', freq: 2000 } });
        this.noise(0.3, 0.2, 'lowpass', 800, 120);
        break;
      case 'heal':
        this.tone('sine', 880, 1320, 0.22, 0.04, { attack: 0.03 });
        break;
      case 'scrap':
        this.tone('square', 988, 988, 0.045, 0.035);
        this.tone('square', 1319, 1319, 0.12, 0.035, { when: 0.045 });
        break;
      case 'waveStart':
        this.pitch = 1;
        for (const f of [220, 277, 330]) this.tone('sawtooth', f, f, 0.7, 0.06, { attack: 0.06, filter: { type: 'lowpass', freq: 600, to: 2400 } });
        break;
      case 'bossStart':
        this.pitch = 1;
        for (let k = 0; k < 3; k++) {
          this.tone('sawtooth', 110, 110, 0.35, 0.09, { when: k * 0.45, attack: 0.03, filter: { type: 'lowpass', freq: 900 } });
          this.tone('sawtooth', 116.5, 116.5, 0.35, 0.09, { when: k * 0.45, attack: 0.03, filter: { type: 'lowpass', freq: 900 } });
        }
        break;
      case 'waveClear':
        this.pitch = 1;
        this.notes([0, 4, 7, 12, 16, 19, 24], 523, 0.06, 0.25, 0.1);
        break;
      case 'gameOver':
        this.pitch = 1;
        this.notes([0, -3, -7, -12], 330, 0.32, 0.6, 0.1, 'sawtooth');
        this.noise(1.2, 0.2, 'lowpass', 600, 80, { when: 0.1 });
        break;
      case 'victory':
        this.pitch = 1;
        this.notes([0, 4, 7, 12, 7, 12, 16, 24], 392, 0.12, 0.3, 0.1, 'square');
        for (const s of [0, 4, 7, 12]) this.tone('sawtooth', 392 * 2 ** (s / 12), 392 * 2 ** (s / 12), 1.4, 0.04, { when: 0.96, attack: 0.05, filter: { type: 'lowpass', freq: 2500 } });
        break;
    }
    this.pitch = 1;
  }

  // ---------- Music ----------

  setMusic(mode: MusicMode): void {
    this.pendingMode = mode;
    if (this.mode === 'none' && mode !== 'none' && this.ctx) {
      this.mode = mode;
      this.step = 0;
      this.nextStepTime = this.ctx.currentTime + 0.1;
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.mode === 'none') {
      if (this.pendingMode !== 'none') this.setMusic(this.pendingMode);
      return;
    }
    while (this.nextStepTime < ctx.currentTime + 0.15) {
      // Switch moods on the beat so changes feel musical.
      if (this.pendingMode !== this.mode && this.step % 4 === 0) {
        this.mode = this.pendingMode;
        this.step = 0;
        if (this.mode === 'none') return;
      }
      this.playStep(this.mode, this.step, this.nextStepTime - ctx.currentTime);
      this.nextStepTime += 60 / PATTERNS[this.mode].tempo / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(mode: Exclude<MusicMode, 'none'>, step: number, when: number): void {
    const pat = PATTERNS[mode];
    const chord = pat.chords[Math.floor(step / 16) % pat.chords.length];
    const s = step % 16;
    const beat = 60 / pat.tempo;
    const dest = this.musicBus;
    const savedPitch = this.pitch;
    this.pitch = 1;

    if (mode === 'build') {
      if (s === 0) for (const n of chord) this.pad(midi(n), when, beat * 4.2, 0.035);
      if ([0, 3, 6, 8, 10, 13].includes(s)) {
        const n = chord[[0, 1, 2, 1, 2, 0][[0, 3, 6, 8, 10, 13].indexOf(s)]] + 12;
        this.tone('triangle', midi(n), midi(n), beat * 0.6, 0.05, { when, dest });
      }
      if (s === 0 || s === 8) this.tone('sine', midi(chord[0] - 24), midi(chord[0] - 24), beat * 1.6, 0.12, { when, attack: 0.02, dest });
      if (s === 4 || s === 12) this.noise(0.05, 0.015, 'highpass', 8000, 8000, { when, dest });
    } else {
      const boss = mode === 'boss';
      if (s === 0) for (const n of chord) this.pad(midi(n), when, beat * 4, boss ? 0.03 : 0.022);
      // Drums.
      const kicks = boss ? [0, 3, 6, 8, 11, 14] : [0, 4, 8, 12];
      if (kicks.includes(s)) this.kick(when);
      if (s === 4 || s === 12) this.snare(when);
      if (boss || s % 2 === 0) this.noise(0.035, s % 4 === 2 ? 0.05 : 0.025, 'highpass', 7500, 7500, { when, dest });
      // Bass.
      if (boss || s % 2 === 0) {
        const n = chord[0] - 24 + (!boss && s % 4 === 2 ? 12 : 0);
        this.tone('sawtooth', midi(n), midi(n), beat * (boss ? 0.22 : 0.45), 0.09, { when, dest, filter: { type: 'lowpass', freq: boss ? 500 : 420 } });
        this.tone('sine', midi(n), midi(n), beat * 0.45, 0.07, { when, dest });
      }
      // Lead arpeggio.
      if (s % 2 === 1 || (boss && [0, 6, 12].includes(s))) {
        const n = chord[[0, 1, 2, 1][Math.floor(s / 2) % 4]] + 12 + (boss ? 0 : (s > 8 ? 12 : 0));
        this.tone('square', midi(n), midi(n), beat * 0.2, boss ? 0.035 : 0.028, { when, dest, filter: { type: 'lowpass', freq: 1800 } });
      }
    }
    this.pitch = savedPitch;
  }

  private pad(freq: number, when: number, dur: number, peak: number): void {
    for (const d of [-7, 7]) this.tone('sawtooth', freq, freq, dur, peak, { when, attack: dur * 0.25, detune: d, dest: this.musicBus, filter: { type: 'lowpass', freq: 900 } });
  }

  private kick(when: number): void {
    this.tone('sine', 150, 42, 0.22, 0.38, { when, dest: this.musicBus });
  }

  private snare(when: number): void {
    this.noise(0.16, 0.13, 'bandpass', 1900, 1500, { when, dest: this.musicBus });
    this.tone('triangle', 210, 150, 0.1, 0.06, { when, dest: this.musicBus });
  }
}

export const audio = new AudioEngine();
