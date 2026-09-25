/**
 * Tutto l'audio è sintetizzato al volo con Web Audio: niente file da scaricare,
 * niente licenze musicali da gestire. Musica: una polka da fisarmonica in do maggiore.
 */

export type Sfx =
  | 'step'
  | 'bump'
  | 'candy'
  | 'coffee'
  | 'slipperPickup'
  | 'heart'
  | 'slipper'
  | 'noSlipper'
  | 'honk'
  | 'screech'
  | 'hit'
  | 'tram'
  | 'horn'
  | 'splash'
  | 'pigeons'
  | 'thunder'
  | 'stop'
  | 'over'
  | 'click'
  | 'buy'
  | 'good'
  | 'bad'
  | 'chomp'
  | 'tick'
  | 'cash'
  | 'thread'
  | 'caught';

const NOTE: Record<string, number> = {};
{
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let o = 1; o <= 7; o++) {
    names.forEach((n, i) => {
      NOTE[`${n}${o}`] = 440 * Math.pow(2, (o * 12 + i - 57) / 12);
    });
  }
}

// melodia: [nota, durata in ottavi]
const MELODY: [string, number][] = [
  ['E5', 1], ['G5', 1], ['C6', 2], ['G5', 1], ['E5', 1], ['G5', 2],
  ['F5', 1], ['E5', 1], ['D5', 1], ['E5', 1], ['C5', 4],
  ['D5', 1], ['G5', 1], ['B5', 2], ['A5', 1], ['G5', 1], ['F5', 2],
  ['E5', 1], ['F5', 1], ['D5', 1], ['B4', 1], ['G4', 4],
  ['E5', 1], ['G5', 1], ['C6', 2], ['D6', 1], ['C6', 1], ['B5', 2],
  ['A5', 1], ['C6', 1], ['A5', 1], ['F5', 1], ['A5', 4],
  ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1], ['F5', 1], ['E5', 1], ['D5', 1], ['B4', 1],
  ['C5', 2], ['E5', 2], ['C5', 4],
  ['A5', 1], ['A5', 1], ['A5', 1], ['G5', 1], ['F5', 2], ['A5', 2],
  ['G5', 1], ['G5', 1], ['G5', 1], ['F5', 1], ['E5', 2], ['G5', 2],
  ['F5', 1], ['F5', 1], ['F5', 1], ['E5', 1], ['D5', 2], ['F5', 2],
  ['E5', 1], ['D5', 1], ['C5', 1], ['D5', 1], ['E5', 4],
  ['A5', 1], ['C6', 1], ['A5', 1], ['C6', 1], ['A5', 2], ['F5', 2],
  ['G5', 1], ['C6', 1], ['G5', 1], ['E5', 1], ['C5', 2], ['E5', 2],
  ['D5', 1], ['F5', 1], ['B5', 1], ['A5', 1], ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
  ['C5', 2], ['G4', 1], ['B4', 1], ['C5', 4],
];

const CHORDS: Record<string, { bass: [string, string]; stab: string[] }> = {
  C: { bass: ['C3', 'G2'], stab: ['E4', 'G4', 'C5'] },
  F: { bass: ['F2', 'C3'], stab: ['F4', 'A4', 'C5'] },
  G7: { bass: ['G2', 'D3'], stab: ['F4', 'B4', 'D5'] },
};
const PROGRESSION = ['C', 'C', 'G7', 'G7', 'C', 'F', 'G7', 'C', 'F', 'C', 'G7', 'C', 'F', 'C', 'G7', 'C'];

const TEMPO = 138;
const EIGHTH = 60 / TEMPO / 2;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private musicTimer: number | null = null;
  private nextTime = 0;
  private eighthIdx = 0;
  private stepToggle = false;
  musicOn = true;
  sfxOn = true;

  /** Va chiamato dentro un gesto dell'utente (tocco): è lì che iOS permette di avviare l'audio. */
  unlock() {
    if (!this.ctx) {
      try {
        // "ambient": rispetta il tasto silenzioso dell'iPhone e non interrompe la musica dell'utente
        const nav = navigator as AudioSessionNavigator;
        if (nav.audioSession) nav.audioSession.type = 'ambient';
      } catch {
        /* non supportato */
      }
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.26;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // buffer muto: sblocca l'audio sulle versioni più vecchie di iOS
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (this.musicOn) this.startMusic();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
  }

  private rain: GainNode | null = null;

  /** Scroscio di pioggia continuo: 0 spento, 1 temporale addosso. */
  setRain(level: number) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const target = this.sfxOn ? Math.max(0, Math.min(1, level)) * 0.14 : 0;
    if (!this.rain) {
      if (target < 0.002) return;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5000;
      this.rain = c.createGain();
      this.rain.gain.value = 0.0001;
      src.connect(hp).connect(lp).connect(this.rain).connect(this.sfxBus);
      src.start();
    }
    this.rain.gain.setTargetAtTime(Math.max(0.0001, target), c.currentTime, 0.35);
  }

  // ------------------------------------------------------------ primitive

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, out?: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, peak, 0.006, dur);
    o.connect(g).connect(out ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, q = 1) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this.env(g, t, peak, 0.01, dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name: Sfx) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'step': {
        this.stepToggle = !this.stepToggle;
        const f = this.stepToggle ? 520 : 470;
        this.tone('sine', f, f * 0.7, t, 0.07, 0.16);
        break;
      }
      case 'bump':
        this.tone('sine', 170, 90, t, 0.12, 0.3);
        this.noiseBurst(t, 0.06, 0.08, 'lowpass', 800, 300);
        break;
      case 'candy':
        this.tone('triangle', NOTE.E6, NOTE.E6, t, 0.09, 0.2);
        this.tone('triangle', NOTE.B6, NOTE.B6, t + 0.07, 0.16, 0.18);
        break;
      case 'coffee':
        ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.tone('triangle', NOTE[n], NOTE[n], t + i * 0.055, 0.12, 0.16));
        break;
      case 'slipperPickup':
        this.tone('sine', 300, 900, t, 0.22, 0.2);
        break;
      case 'heart':
        ['E5', 'G5', 'B5', 'E6'].forEach((n, i) => this.tone('triangle', NOTE[n], NOTE[n], t + i * 0.06, 0.18, 0.14));
        break;
      case 'slipper':
        // sventolata e "ciaf!"
        this.noiseBurst(t, 0.22, 0.25, 'bandpass', 600, 2600, 1.2);
        this.noiseBurst(t + 0.2, 0.08, 0.45, 'highpass', 1800, 1200, 0.8);
        this.tone('sine', 220, 90, t + 0.2, 0.12, 0.35);
        break;
      case 'noSlipper':
        this.tone('square', 140, 120, t, 0.18, 0.06);
        break;
      case 'honk': {
        const k = 0.85 + Math.random() * 0.35;
        const c = this.ctx;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1500;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
        g.gain.setValueAtTime(0.09, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        f.connect(g).connect(this.sfxBus);
        for (const base of [392, 494]) {
          const o = c.createOscillator();
          o.type = 'square';
          o.frequency.value = base * k;
          o.connect(f);
          o.start(t);
          o.stop(t + 0.3);
        }
        break;
      }
      case 'screech':
        this.noiseBurst(t, 0.55, 0.3, 'bandpass', 2600, 1400, 9);
        this.tone('sawtooth', 1900, 1300, t, 0.45, 0.025);
        break;
      case 'hit':
        this.tone('sine', 320, 110, t + 0.05, 0.22, 0.35);
        this.tone('triangle', NOTE.G4, NOTE.C4, t + 0.1, 0.35, 0.12);
        break;
      case 'tram':
        for (const dt of [0, 0.38]) {
          for (const [f, a] of [
            [1180, 0.16],
            [2650, 0.07],
            [3960, 0.04],
          ] as const) {
            this.tone('sine', f, f, t + dt, 0.7, a);
          }
        }
        break;
      case 'horn': {
        // tromba del treno: due note un po' stonate
        for (const [f, dt] of [
          [NOTE.A4, 0],
          [NOTE.F4, 0.32],
        ] as const) {
          this.tone('sawtooth', f, f, t + dt, 0.3, 0.05);
          this.tone('square', f * 1.5, f * 1.5, t + dt, 0.3, 0.025);
        }
        break;
      }
      case 'splash':
        this.noiseBurst(t, 0.3, 0.25, 'lowpass', 2000, 300);
        break;
      case 'pigeons':
        for (let i = 0; i < 7; i++) this.noiseBurst(t + i * 0.055, 0.04, 0.12, 'bandpass', 1400, 1100, 2);
        break;
      case 'thunder':
        this.noiseBurst(t, 1.6, 0.5, 'lowpass', 500, 60, 0.7);
        this.noiseBurst(t + 0.1, 0.25, 0.25, 'lowpass', 1600, 300, 0.7);
        break;
      case 'stop':
        ['C5', 'E5', 'G5'].forEach((n, i) => this.tone('triangle', NOTE[n], NOTE[n], t + i * 0.09, 0.18, 0.14));
        break;
      case 'over':
        ['G4', 'F#4', 'F4', 'E4'].forEach((n, i) => this.tone('sawtooth', NOTE[n], NOTE[n] * (i === 3 ? 0.94 : 1), t + i * 0.22, i === 3 ? 0.6 : 0.2, 0.05));
        break;
      case 'good':
        this.tone('triangle', NOTE.A5, NOTE.A5, t, 0.1, 0.18);
        this.tone('triangle', NOTE.E6, NOTE.E6, t + 0.06, 0.16, 0.14);
        break;
      case 'bad':
        this.tone('square', 180, 150, t, 0.22, 0.07);
        break;
      case 'chomp':
        this.noiseBurst(t, 0.07, 0.25, 'lowpass', 900 + Math.random() * 400, 300, 1);
        this.tone('sine', 160, 110, t, 0.06, 0.2);
        break;
      case 'tick':
        this.tone('square', 880, 880, t, 0.06, 0.06);
        break;
      case 'cash':
        ['E6', 'G6', 'C7'].forEach((n, i) => this.tone('triangle', NOTE[n], NOTE[n], t + i * 0.07, 0.25, 0.12));
        this.noiseBurst(t + 0.2, 0.2, 0.08, 'highpass', 6000, 4000);
        break;
      case 'thread':
        this.tone('sine', 700, 1400, t, 0.18, 0.18);
        break;
      case 'caught':
        // fischio indignato
        this.tone('sine', 1500, 2200, t, 0.14, 0.12);
        this.tone('sine', 2200, 1300, t + 0.16, 0.2, 0.12);
        break;
      case 'click':
        this.tone('sine', 900, 600, t, 0.04, 0.12);
        break;
      case 'buy':
        ['G5', 'C6', 'E6'].forEach((n, i) => this.tone('triangle', NOTE[n], NOTE[n], t + i * 0.07, 0.2, 0.15));
        break;
    }
  }

  // ------------------------------------------------------------ musica

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null || !this.musicOn) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.eighthIdx = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 50);
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private accordion(freq: number, t: number, dur: number) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2100;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.1, t + Math.min(0.12, dur * 0.6));
    g.gain.setValueAtTime(0.1, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.musicBus);
    // tre ance leggermente scordate: l'effetto "musette"
    for (const cents of [-9, 0, 9]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  private schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    while (this.nextTime < c.currentTime + 0.25) {
      const t = this.nextTime;
      const bar = Math.floor(this.eighthIdx / 8) % PROGRESSION.length;
      const inBar = this.eighthIdx % 8;
      const chord = CHORDS[PROGRESSION[bar]];
      // "um-pa": basso sui tempi forti, accordo sui deboli
      if (inBar === 0 || inBar === 4) this.tone('triangle', NOTE[chord.bass[inBar === 0 ? 0 : 1]], NOTE[chord.bass[inBar === 0 ? 0 : 1]], t, 0.2, 0.34, this.musicBus);
      if (inBar === 2 || inBar === 6) for (const n of chord.stab) this.tone('triangle', NOTE[n], NOTE[n], t, 0.09, 0.07, this.musicBus);
      // melodia
      let acc = 0;
      for (let i = 0; i < MELODY.length; i++) {
        if (acc === this.eighthIdx % 128) {
          const [n, d] = MELODY[i];
          this.accordion(NOTE[n], t, d * EIGHTH * 0.92);
          break;
        }
        acc += MELODY[i][1];
        if (acc > this.eighthIdx % 128) break;
      }
      this.eighthIdx++;
      this.nextTime += EIGHTH;
    }
  }
}
