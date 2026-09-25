import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';

import { GameAudio } from './audio';
import type { Sfx } from './audio';
import { t } from './i18n';
import { Input } from './input';
import { generateLevel } from './levels';
import { initNative, notify, setHaptics, tap } from './native';
import { OUTFITS, outfitById } from './outfits';
import { Renderer } from './render/renderer';
import { Sim } from './sim';
import type { Dir } from './sim';
import { defaultSave, loadSave, storeSave } from './storage';
import type { Save } from './storage';
import { UI, destPhrase } from './ui';
import type { Controller } from './ui';

type Mode = 'title' | 'menu' | 'playing' | 'paused' | 'result';

const HUD_HEIGHT = 64;

/** Tempi medi (ms) di simulazione e disegno: utili per misurare la fluidità nei test. */
const perf = { sim: 0, render: 0 };
(window as unknown as { __perf: typeof perf }).__perf = perf;

function safeTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

class Game implements Controller {
  save: Save = defaultSave();
  private audio = new GameAudio();
  private canvas = document.getElementById('game') as HTMLCanvasElement;
  private renderer = new Renderer(this.canvas);
  private ui = new UI(this);
  private input: Input;
  private sim!: Sim;
  private mode: Mode = 'title';
  private levelN = 1;
  private last = 0;
  private hint: 'tap' | 'swipe' | 'umbrella' | null = null;
  private resultTimer = 0;
  private attract = false;
  /** Risoluzione massima del canvas: scende da sola se il telefono non tiene i 60 fps. */
  private dprCap = 3;
  private slowFor = 0;

  constructor() {
    this.renderer.texts = { ...t.fx, destination: '' };
    this.renderer.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.input = new Input(
      this.canvas,
      (d) => this.onMove(d),
      () => this.useUmbrella(),
      () => this.pause(),
    );
    const umbrella = document.getElementById('btn-umbrella')!;
    umbrella.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.useUmbrella();
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
    await initNative();
    try {
      await Promise.race([
        Promise.all([document.fonts.load('700 20px Fredoka'), document.fonts.load('600 20px Fredoka')]),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* si usa il carattere di sistema */
    }
    this.layout(false);
    this.openTitle();
    this.last = performance.now();
    requestAnimationFrame((ts) => this.frame(ts));
    document.documentElement.classList.add('ready');
  }

  private layout(rebuild = true) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.renderer.resize({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr,
      hudTop: safeTop() + HUD_HEIGHT,
    });
    if (rebuild && this.sim) this.renderer.setLevel(this.sim, destPhrase(this.sim.level.n)[0]);
  }

  private get outfit() {
    return outfitById(this.save.outfit);
  }

  // ------------------------------------------------------------ ciclo principale

  private frame(ts: number) {
    const dt = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
    this.last = ts;
    if (this.mode !== 'paused') {
      const t0 = performance.now();
      this.sim.update(dt);
      perf.sim = perf.sim * 0.95 + (performance.now() - t0) * 0.05;
      this.handleEvents();
    }
    if (this.mode === 'playing') {
      this.ui.updateHud(this.sim);
      this.watchSmoothness(dt);
    }
    const t0 = performance.now();
    this.renderer.render(this.sim, this.outfit, this.mode === 'paused' ? 0 : dt);
    perf.render = perf.render * 0.95 + (performance.now() - t0) * 0.05;
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

  sfx(name: 'click' | 'star') {
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
          if (this.hint === 'tap') this.setHint(null);
          this.ui.hideBanner();
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
          this.playSfx(e.kind === 'candy' ? 'candy' : e.kind === 'coffee' ? 'coffee' : 'umbrellaPickup');
          tap('medium');
          break;
        case 'umbrella':
          this.playSfx('umbrella');
          tap('heavy');
          if (this.hint === 'umbrella') this.setHint(null);
          this.ui.pulseUmbrella(false);
          break;
        case 'noUmbrella':
          this.playSfx('noUmbrella');
          break;
        case 'tramWarn':
          this.playSfx('tram');
          break;
        case 'splash':
          this.playSfx('splash');
          break;
        case 'pigeons':
          this.playSfx('pigeons');
          break;
        case 'win':
          this.onWin();
          break;
        case 'lose':
          this.onLose();
          break;
        default:
          break;
      }
    }
    sim.events.length = 0;
  }

  private onMove(d: Dir) {
    if (this.mode !== 'playing') return;
    if (this.hint === 'swipe' && (d === 'left' || d === 'right')) this.setHint(null);
    this.sim.input(d);
  }

  private useUmbrella() {
    if (this.mode !== 'playing') return;
    this.sim.useUmbrella();
  }

  private setHint(h: 'tap' | 'swipe' | 'umbrella' | null) {
    this.hint = h;
    this.ui.showHint(h);
  }

  private onWin() {
    this.input.enabled = false;
    this.playSfx('win');
    notify('success');
    const sim = this.sim;
    const n = this.levelN;
    const stars = sim.stars();
    this.save.stars[n] = Math.max(this.save.stars[n] ?? 0, stars);
    this.save.unlocked = Math.max(this.save.unlocked, n + 1);
    this.save.candies += sim.candies;
    storeSave(this.save);
    window.clearTimeout(this.resultTimer);
    this.resultTimer = window.setTimeout(() => {
      if (this.mode !== 'playing' || this.sim !== sim) return;
      this.mode = 'result';
      this.ui.showHud(false);
      this.setHint(null);
      this.ui.showResult({
        won: true,
        level: n,
        stars,
        hits: sim.player.hits,
        time: sim.elapsed,
        par: sim.level.parTime,
        candies: sim.candies,
        candiesTotal: sim.candiesTotal,
      });
    }, 1900);
  }

  private onLose() {
    this.input.enabled = false;
    this.playSfx('lose');
    notify('warning');
    const sim = this.sim;
    window.clearTimeout(this.resultTimer);
    this.resultTimer = window.setTimeout(() => {
      if (this.mode !== 'playing' || this.sim !== sim) return;
      this.mode = 'result';
      this.ui.showHud(false);
      this.setHint(null);
      this.ui.showResult({ won: false, level: this.levelN, stars: 0, hits: 0, time: 0, par: 0, candies: 0, candiesTotal: 0 });
    }, 700);
  }

  // ------------------------------------------------------------ Controller (azioni dei menu)

  private setAttract() {
    // sullo sfondo dei menu: un incrocio vero, col traffico che scorre e la coppia sullo spartitraffico
    const lv = generateLevel(5);
    const sim = new Sim(lv, 12345);
    const median = lv.rows.findIndex((r) => r.kind === 'median');
    sim.player.row = sim.player.fromRow = median > 0 ? median : 0;
    sim.player.col = sim.player.fromCol = 4;
    sim.player.umbrellas = 0;
    this.sim = sim;
    this.attract = true;
    this.renderer.setLevel(sim, destPhrase(lv.n)[0]);
  }

  openTitle() {
    window.clearTimeout(this.resultTimer);
    this.input.enabled = false;
    this.ui.showHud(false);
    this.setHint(null);
    if (!this.attract || !this.sim) this.setAttract();
    this.mode = 'title';
    this.ui.showTitle();
  }

  play() {
    this.startLevel(this.save.unlocked);
  }

  startLevel(n: number) {
    window.clearTimeout(this.resultTimer);
    this.levelN = n;
    const lv = generateLevel(n);
    this.sim = new Sim(lv);
    this.attract = false;
    this.renderer.setLevel(this.sim, destPhrase(n)[0]);
    this.ui.clear();
    this.ui.showHud(true);
    this.ui.setLevel(n, this.sim);
    this.mode = 'playing';
    this.input.enabled = true;
    this.last = performance.now();
    const intro = lv.intro;
    this.setHint(intro === 'tap' ? 'tap' : intro === 'swipe' ? 'swipe' : null);
    if (intro === 'umbrella') this.ui.pulseUmbrella(true);
    const bannerHint = intro === 'umbrella' || intro === 'bike' || intro === 'tram' || intro === 'bus' ? t.hints[intro] : null;
    this.ui.showBanner(n, bannerHint);
  }

  openLevels() {
    this.mode = 'menu';
    this.ui.showLevels();
  }

  openWardrobe() {
    this.mode = 'menu';
    this.ui.showWardrobe();
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
      this.ui.hideBanner();
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

  restart() {
    this.startLevel(this.levelN);
  }

  next() {
    this.startLevel(this.levelN + 1);
  }

  toMenu() {
    this.attract = false;
    this.openTitle();
  }

  buy(id: string) {
    const o = OUTFITS.find((x) => x.id === id);
    if (!o || this.save.owned.includes(id) || this.save.candies < o.price) return;
    this.save.candies -= o.price;
    this.save.owned.push(id);
    this.save.outfit = id;
    storeSave(this.save);
    this.playSfx('buy');
    notify('success');
    this.ui.showWardrobe();
  }

  equip(id: string) {
    if (!this.save.owned.includes(id)) return;
    this.save.outfit = id;
    storeSave(this.save);
    this.ui.showWardrobe();
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
    this.openTitle();
  }
}

const game = new Game();
// Solo in sviluppo: permette agli script di preparare le scene degli screenshot.
if (import.meta.env.DEV) Object.assign(window, { __game: game });
void game.boot();
