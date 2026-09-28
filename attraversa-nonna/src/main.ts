import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';

import { GameAudio } from './audio';
import type { Sfx } from './audio';
import { t } from './i18n';
import { Input } from './input';
import { runMinigame } from './minigames';
import { initNative, notify, setHaptics, tap } from './native';
import { NONNE, nonnaById } from './nonne';
import { bgStats } from './render/background';
import type { BuildingStyle, Theme } from './render/background';
import { Renderer } from './render/renderer';
import { Sim } from './sim';
import type { Dir, OverCause } from './sim';
import { defaultSave, flushSave, loadSave, storeSave } from './storage';
import type { Save } from './storage';
import { UI } from './ui';
import type { Controller, HintKind } from './ui';
import type { Stop, StopKind } from './world';

type Mode = 'title' | 'menu' | 'playing' | 'paused' | 'stop' | 'over';

const HUD_HEIGHT = 64;

/** Tempi medi (ms) di simulazione e disegno: utili per misurare la fluidità nei test. */
const perf = { sim: 0, render: 0, bg: bgStats };
(window as unknown as { __perf: typeof perf }).__perf = perf;

const THEME_OF: Record<StopKind, Theme> = {
  tiramisu: 'home',
  poste: 'post',
  ago: 'haberdashery',
  pranzo: 'trattoria',
};

function stopStyle(stop: Stop): BuildingStyle {
  return { theme: THEME_OF[stop.kind], label: t.stops[stop.kind], note: t.stopNotes[stop.kind] };
}

function safeTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

class Game implements Controller {
  save: Save = defaultSave();
  private audio = new GameAudio();
  private canvas = document.getElementById('game') as HTMLCanvasElement;
  private renderer = new Renderer(this.canvas);
  private ui = new UI(this);
  private input: Input;
  private sim!: Sim;
  private mode: Mode = 'title';
  private last = 0;
  private attract = false;
  private hint: HintKind | null = null;
  private hintTimer = 0;
  /** 0 tocca, 1 scorri, 2 ciabatta, 3 finito */
  private tutorial = 3;
  private overTimer = 0;
  /** Risoluzione massima del canvas: scende da sola se il telefono non tiene i 60 fps. */
  private dprCap = 3;
  private slowFor = 0;
  /** Caramelle della corsa già messe da parte dai checkpoint, e record prima della corsa. */
  private banked = 0;
  private runBest = 0;
  /** In questa corsa il record è già stato superato; ultima tappa da 100 m festeggiata. */
  private recordDone = false;
  private milestone = 0;

  constructor() {
    this.renderer.texts = { ...t.fx, near: t.near, newBest: t.newBest, record: t.best };
    this.renderer.onSpeak = (text) => this.audio.mumble(text, this.voicePitch());
    this.renderer.styleOf = stopStyle;
    this.renderer.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.input = new Input(
      this.canvas,
      (d) => this.onMove(d),
      () => this.useSlipper(),
      () => this.pause(),
    );
    const slipper = document.getElementById('btn-slipper')!;
    slipper.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.useSlipper();
    });
    document.getElementById('btn-pause')!.addEventListener('click', () => {
      this.audio.play('click');
      this.pause();
    });
    // iOS permette l'audio solo dopo un gesto dell'utente
    // (a seconda della versione di iOS conta il tocco iniziale o il rilascio: si ascoltano entrambi)
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) {
      document.addEventListener(ev, () => this.audio.unlock(), { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'playing') this.pause();
        this.checkpoint();
        this.audio.suspend();
      } else {
        this.audio.resume();
        this.last = performance.now();
      }
    });
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => this.layout(), 120);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  async boot() {
    this.save = await loadSave();
    this.audio.setMusic(this.save.music);
    this.audio.setSfx(this.save.sfx);
    setHaptics(this.save.haptics);
    this.applyNonna();
    await initNative();
    try {
      await Promise.race([
        Promise.all([document.fonts.load('700 20px Fredoka'), document.fonts.load('600 20px Fredoka')]),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* si usa il carattere di sistema */
    }
    this.layout();
    this.openTitle();
    this.last = performance.now();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  private layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.renderer.resize({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr,
      hudTop: safeTop() + HUD_HEIGHT,
    });
  }

  private get nonna() {
    return nonnaById(this.save.nonna);
  }

  private applyNonna() {
    const n = this.nonna;
    this.renderer.voice = { hit: n.hit, slipper: n.slipper, happy: n.happy, closing: t.closingLines, back: t.backLines };
  }

  // ------------------------------------------------------------ ciclo principale

  private frame(ts: number) {
    const dt = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
    this.last = ts;
    if (this.mode !== 'paused' && this.mode !== 'stop') {
      const t0 = performance.now();
      this.sim.update(dt);
      perf.sim = perf.sim * 0.95 + (performance.now() - t0) * 0.05;
      this.handleEvents();
    }
    if (this.mode === 'playing') {
      this.ui.updateHud(this.sim);
      this.watchSmoothness(dt);
    }
    // durante il minigioco la strada è coperta: non serve ridisegnarla
    if (!(this.mode === 'stop' && document.querySelector('.mg'))) {
      const t0 = performance.now();
      this.renderer.render(this.sim, this.nonna.look, this.mode === 'paused' ? 0 : dt);
      perf.render = perf.render * 0.95 + (performance.now() - t0) * 0.05;
    }
    if (this.mode === 'title' || this.mode === 'menu') this.renderer.warmUp(1);
    requestAnimationFrame((n) => this.frame(n));
  }

  private watchSmoothness(dt: number) {
    if (dt <= 0 || dt >= 0.1) return;
    // più di ~20 ms a frame per oltre un secondo: meno pixel, stessa grafica
    if (dt > 0.02) this.slowFor += dt;
    else this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
    if (this.slowFor > 1.2 && this.dprCap > 1.5 && (window.devicePixelRatio || 1) > 1.5) {
      this.dprCap = Math.min(window.devicePixelRatio || 1, this.dprCap) > 2 ? 2 : 1.5;
      this.slowFor = 0;
      this.layout();
    }
  }

  private playSfx(name: Sfx) {
    this.audio.play(name);
  }

  sfx(name: 'click') {
    this.audio.play(name);
  }

  private handleEvents() {
    const sim = this.sim;
    if (this.attract) {
      sim.events.length = 0;
      return;
    }
    for (const e of sim.events) {
      this.renderer.onEvent(e, sim);
      switch (e.type) {
        case 'step':
          this.playSfx('step');
          tap('light');
          if (this.tutorial === 0) this.advanceTutorial();
          break;
        case 'bump':
          this.playSfx('bump');
          tap('light');
          break;
        case 'hit':
          this.playSfx('hit');
          notify('error');
          break;
        case 'screech':
          this.playSfx('screech');
          break;
        case 'honk':
          this.playSfx('honk');
          break;
        case 'pickup':
          this.playSfx(e.kind === 'candy' ? 'candy' : e.kind === 'coffee' ? 'coffee' : e.kind === 'slipper' ? 'slipperPickup' : 'heart');
          tap('medium');
          break;
        case 'slipper':
          this.playSfx('slipper');
          tap('heavy');
          if (this.hint === 'slipper') this.setHint(null);
          this.ui.pulseSlipper(false);
          break;
        case 'noSlipper':
          this.playSfx('noSlipper');
          break;
        case 'tramWarn':
          this.playSfx('tram');
          break;
        case 'tramPass':
          if (e.train !== 'tram') this.playSfx('horn');
          break;
        case 'splash':
          this.playSfx('splash');
          break;
        case 'pigeons':
          this.playSfx('pigeons');
          break;
        case 'closeWarn':
          this.playSfx('clank');
          if (!this.hint) this.flashHint('closing', 2400);
          break;
        case 'closeStep':
          this.playSfx('clank');
          tap('light');
          break;
        case 'backBlocked':
          tap('light');
          break;
        case 'meter':
          if (this.tutorial === 2 && e.meters >= 18) this.advanceTutorial();
          this.onMeter(e.meters);
          break;
        case 'nearMiss':
          this.playSfx('near');
          tap(e.train || e.streak >= 3 ? 'medium' : 'light');
          break;
        case 'stop':
          this.onStop(e.stop);
          break;
        case 'over':
          this.onOver(e.cause);
          break;
        default:
          break;
      }
    }
    sim.events.length = 0;
  }

  private onMove(d: Dir) {
    if (this.mode !== 'playing') return;
    if (this.tutorial === 1 && (d === 'left' || d === 'right')) this.advanceTutorial();
    this.sim.input(d);
  }

  private useSlipper() {
    if (this.mode !== 'playing') return;
    this.sim.useSlipper();
  }

  private setHint(h: HintKind | null) {
    window.clearTimeout(this.hintTimer);
    this.hint = h;
    this.ui.showHint(h);
  }

  private flashHint(h: HintKind, ms: number) {
    this.setHint(h);
    this.hintTimer = window.setTimeout(() => {
      if (this.hint === h) this.setHint(null);
    }, ms);
  }

  /** Suggerimenti della prima partita: tocca, scorri, ciabatta. */
  private advanceTutorial() {
    this.tutorial++;
    if (this.tutorial === 1) {
      this.setHint(null);
      window.setTimeout(() => {
        if (this.tutorial === 1 && this.mode === 'playing') this.flashHint('swipe', 6000);
      }, 1200);
    } else if (this.tutorial === 2) {
      if (this.hint === 'swipe') this.setHint(null);
    } else if (this.tutorial === 3) {
      this.flashHint('slipper', 4500);
      this.ui.pulseSlipper(true);
      window.setTimeout(() => this.ui.pulseSlipper(false), 4500);
      this.save.tutorial = true;
      storeSave(this.save);
    }
  }

  private onStop(stop: Stop) {
    this.input.enabled = false;
    this.setHint(null);
    this.renderer.enter(stop);
    this.playSfx('stop');
    const sim = this.sim;
    window.setTimeout(async () => {
      if (this.sim !== sim) return;
      this.mode = 'stop';
      this.ui.showHud(false);
      const res = await runMinigame(
        stop.kind,
        {
          look: this.nonna.look,
          sfx: (n) => this.playSfx(n),
          haptic: (k) => tap(k),
        },
        document.getElementById('app')!,
      );
      if (this.sim !== sim) return;
      sim.finishStop(res.success, res.reward);
      this.checkpoint();
      this.renderer.leave();
      if (sim.status === 'over') {
        this.handleEvents();
        return;
      }
      if (res.success) this.renderer.celebrate();
      this.ui.showHud(true);
      this.mode = 'playing';
      this.input.enabled = true;
      this.last = performance.now();
    }, 850);
  }

  private onOver(cause: OverCause) {
    this.input.enabled = false;
    this.setHint(null);
    this.mode = 'over';
    this.playSfx('over');
    notify('warning');
    const sim = this.sim;
    const meters = sim.meters;
    // il record da battere è quello di prima della corsa (i checkpoint l'avranno già aggiornato)
    const newBest = meters > this.runBest;
    const prevBest = this.runBest;
    this.save.best = Math.max(this.save.best, meters);
    this.save.candies += sim.candies - this.banked;
    this.banked = sim.candies;
    this.save.runs++;
    if (meters >= 25) this.save.tutorial = true;
    storeSave(this.save);
    window.clearTimeout(this.overTimer);
    this.overTimer = window.setTimeout(() => {
      if (this.sim !== sim || this.mode !== 'over') return;
      this.ui.showHud(false);
      this.ui.showOver({ cause, meters, best: newBest ? meters : prevBest, newBest: newBest && prevBest > 0, candies: sim.candies, stops: sim.stopsDone, near: sim.nearMisses });
    }, 1100);
  }

  // ------------------------------------------------------------ Controller (azioni dei menu)

  private setAttract() {
    // sullo sfondo dei menu: una strada vera, col traffico che scorre e la coppia sullo spartitraffico
    const sim = new Sim(20260925);
    sim.world.ensure(60);
    const median = sim.world.rows.findIndex((r, i) => i > 3 && r.kind === 'median');
    sim.placePlayer(median > 0 ? median : 0, 4);
    this.sim = sim;
    this.attract = true;
    this.renderer.closeOn = false;
    this.renderer.setSim(sim);
  }

  /** Traguardi durante la corsa: il proprio record superato e ogni 100 metri. */
  private onMeter(m: number) {
    if (this.attract) return;
    if (!this.recordDone && this.runBest > 0 && m > this.runBest) {
      this.recordDone = true;
      this.renderer.recordBroken();
      this.playSfx('record');
      notify('success');
      return;
    }
    const step = Math.floor(m / 100);
    if (step > this.milestone) {
      this.milestone = step;
      this.renderer.milestone(step * 100);
      this.playSfx('milestone');
    }
  }

  /** Il tono di voce della nonna scelta: ogni nonna borbotta un po' diversa. */
  private voicePitch() {
    let h = 0;
    for (const ch of this.save.nonna) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return 300 + (h % 140);
  }

  /**
   * Mette al sicuro record e caramelle della corsa in corso: se iOS chiude l'app
   * mentre è in background, o la si chiude a metà strada, non si perde niente.
   */
  private checkpoint() {
    if (this.attract || !['playing', 'paused', 'stop'].includes(this.mode)) return;
    const sim = this.sim;
    this.save.best = Math.max(this.save.best, sim.meters);
    this.save.candies += sim.candies - this.banked;
    this.banked = sim.candies;
    flushSave(this.save);
  }

  openTitle() {
    window.clearTimeout(this.overTimer);
    this.input.enabled = false;
    this.ui.showHud(false);
    this.setHint(null);
    if (!this.attract || !this.sim) this.setAttract();
    this.mode = 'title';
    this.ui.showTitle();
  }

  play() {
    window.clearTimeout(this.overTimer);
    this.sim = new Sim(randomSeed());
    this.attract = false;
    this.banked = 0;
    this.runBest = this.save.best;
    this.recordDone = false;
    this.milestone = 0;
    this.renderer.closeOn = true;
    this.renderer.recordRow = this.save.best;
    this.renderer.setSim(this.sim);
    this.ui.clear();
    this.ui.showHud(true);
    this.ui.resetHud(this.sim);
    this.mode = 'playing';
    this.input.enabled = true;
    this.last = performance.now();
    this.tutorial = this.save.tutorial ? 3 : 0;
    if (!this.save.tutorial) this.sim.graceRows = 12;
    this.setHint(this.tutorial === 0 ? 'tap' : null);
  }

  restart() {
    this.play();
  }

  openNonne() {
    this.mode = this.mode === 'over' ? 'over' : 'menu';
    this.ui.showNonne();
  }

  openSettings(from: 'title' | 'pause') {
    if (from === 'title') this.mode = 'menu';
    this.ui.showSettings(from);
  }

  openInfo(kind: 'privacy' | 'credits') {
    this.ui.showInfo(kind, this.mode === 'paused' ? 'pause' : 'title');
  }

  pause() {
    if (this.mode === 'playing' && this.sim.status === 'playing') {
      this.mode = 'paused';
      this.input.enabled = false;
    }
    if (this.mode === 'paused') this.ui.showPause();
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.ui.clear();
    this.input.enabled = true;
    this.last = performance.now();
  }

  toMenu() {
    this.attract = false;
    this.openTitle();
  }

  buy(id: string) {
    const n = NONNE.find((x) => x.id === id);
    if (!n || this.save.owned.includes(id) || this.save.candies < n.price) return;
    this.save.candies -= n.price;
    this.save.owned.push(id);
    this.choose(id);
    this.playSfx('buy');
    notify('success');
  }

  choose(id: string) {
    if (!this.save.owned.includes(id)) return;
    this.save.nonna = id;
    storeSave(this.save);
    this.applyNonna();
    this.ui.showNonne();
  }

  listen(id: string): string {
    const n = nonnaById(id);
    const all = [...n.hit, ...n.slipper];
    this.playSfx('honk');
    return all[Math.floor(Math.random() * all.length)];
  }

  setOption(key: 'music' | 'sfx' | 'haptics', on: boolean) {
    this.save[key] = on;
    storeSave(this.save);
    if (key === 'music') this.audio.setMusic(on);
    else if (key === 'sfx') this.audio.setSfx(on);
    else {
      setHaptics(on);
      if (on) tap('medium');
    }
  }

  resetProgress() {
    const fresh = defaultSave();
    fresh.music = this.save.music;
    fresh.sfx = this.save.sfx;
    fresh.haptics = this.save.haptics;
    this.save = fresh;
    storeSave(this.save);
    this.applyNonna();
    this.openTitle();
  }
}

const game = new Game();
// Solo in sviluppo: permette agli script di preparare le scene degli screenshot.
if (import.meta.env.DEV) Object.assign(window, { __game: game });
void game.boot();
