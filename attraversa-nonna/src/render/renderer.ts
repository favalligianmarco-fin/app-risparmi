import type { Look } from '../nonne';
import { SLIPPER_STOP } from '../sim';
import type { Sim, SimEvent } from '../sim';
import { COLS, DOOR_COL, doorRow, isTrain } from '../world';
import type { Stop } from '../world';
import { ARROW_Y, Background, DOOR_Y } from './background';
import type { BuildingStyle } from './background';
import { drawPair } from './characters';
import type { Mood } from './characters';
import { FONT, INK, rr } from './paint';
import type { Ctx } from './paint';
import { StaticSprites, drawPigeon } from './props';
import { BRAKE_Y, VehicleSprites } from './vehicles';

/** Quanto sporgono i nuvoloni sopra il fronte del temporale, in celle. */
const STORM_TOP = 1.2;
/** Quanti secondi prima di entrare in scena un mezzo accende la spia sul bordo. */
const EDGE_WARN = 0.7;

type PKind = 'puff' | 'star' | 'spark' | 'drop' | 'confetti' | 'feather' | 'dust' | 'ring';

interface Particle {
  alive: boolean;
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  t: number;
  max: number;
  color: string;
  /** true = fumetto attaccato alla nonna */
  bubble: boolean;
  size: number;
}

const CONFETTI = ['#e84a4a', '#f7c948', '#5fd3b0', '#5aa9f0', '#f28bb6', '#9f86e0'];

export interface Layout {
  /** dimensioni in punti CSS */
  width: number;
  height: number;
  dpr: number;
  /** spazio occupato in alto dall'HUD, in punti CSS */
  hudTop: number;
}

export interface Texts {
  honk: string;
  coffee: string;
  extraSlipper: string;
  extraHeart: string;
}

/** Le frasi della nonna scelta. */
export interface Voice {
  hit: string[];
  slipper: string[];
  happy: string[];
  /** Quando il temporale arriva addosso (uguali per tutte le nonne). */
  storm: string[];
}

export class Renderer {
  private ctx: Ctx;
  private layout: Layout = { width: 1, height: 1, dpr: 1, hudTop: 0 };
  /** punti CSS per cella */
  cell = 40;
  /** pixel reali per cella */
  private s = 40;
  private xLeft = 0;
  private xRight = COLS;
  private camY = -1.3;
  private bg: Background | null = null;
  private sim: Sim | null = null;
  private vehicles!: VehicleSprites;
  private statics!: StaticSprites;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shake = 0;
  private flash = 0;
  /** Dove cade il fulmine (frazione della larghezza) e dove sta il muso del nuvolone. */
  private boltX = 0.5;
  private faceX = 0;
  private stormSprite: HTMLCanvasElement | null = null;
  private stormKey = 0;
  /** Animazione della coppia che entra nel palazzo della sosta. */
  private enterT = -1;
  private enterStop: Stop | null = null;
  private time = 0;
  reduceMotion = false;
  texts: Texts = { honk: 'Beep!', coffee: 'Espresso!', extraSlipper: '+1', extraHeart: '+1' };
  voice: Voice = { hit: ['Hey!'], slipper: ['STOP!'], happy: ['Yay!'], storm: ['Hurry!'] };
  styleOf: (stop: Stop) => BuildingStyle = () => {
    throw new Error('styleOf non impostato');
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D non disponibile');
    this.ctx = ctx;
    for (let i = 0; i < 280; i++) {
      this.particles.push({ alive: false, kind: 'puff', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0, rot: 0, vr: 0, color: '#fff' });
    }
  }

  resize(layout: Layout) {
    this.layout = layout;
    const { width, height, dpr } = layout;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.cell = Math.min(width / COLS, (height - layout.hudTop) / 11);
    this.s = this.cell * dpr;
    const visCols = width / this.cell;
    this.xLeft = -(visCols - COLS) / 2;
    this.xRight = this.xLeft + visCols;
    this.vehicles = new VehicleSprites(this.s);
    this.statics = new StaticSprites(this.s);
    if (this.sim) this.setSim(this.sim, true);
  }

  private camTarget(sim: Sim): number {
    const H = (this.layout.height - this.layout.hudTop) / this.cell;
    return Math.max(-1.3, sim.playerPos().y - H * 0.34);
  }

  /** Fuori dalla corsa (titolo, menu) si preparano in anticipo gli sprite dei mezzi. */
  warmUp(budgetMs: number) {
    this.vehicles.warm(budgetMs);
  }

  /** Nuova corsa (o nuovo schermo): si riparte con uno sfondo pulito. */
  setSim(sim: Sim, keepCamera = false) {
    this.bg?.dispose();
    this.bg = new Background(sim.world, this.s, this.xLeft, this.xRight, (st) => this.styleOf(st));
    this.sim = sim;
    if (!keepCamera) {
      this.camY = this.camTarget(sim);
      for (const p of this.particles) p.alive = false;
      this.floaters = [];
      this.shake = 0;
      this.enterT = -1;
      this.enterStop = null;
    }
  }

  /** La coppia entra nel palazzo della sosta (dura ~0.8 s). */
  enter(stop: Stop) {
    this.enterStop = stop;
    this.enterT = 0;
  }

  leave() {
    this.enterT = -1;
    this.enterStop = null;
  }

  // ------------------------------------------------------------ effetti

  private spawn(kind: PKind, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) {
    const p = this.particles.find((q) => !q.alive);
    if (!p) return;
    p.alive = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = 0;
    p.max = life;
    p.size = size;
    p.rot = Math.random() * Math.PI * 2;
    p.vr = (Math.random() - 0.5) * 10;
    p.color = color;
  }

  private float(text: string, x: number, y: number, color: string, bubble = false, max = 1.1, size = 0.42) {
    if (bubble) this.floaters = this.floaters.filter((f) => !f.bubble);
    this.floaters.push({ text, x, y, t: 0, max, color, bubble, size });
  }

  say(kind: keyof Voice, color = '#2d2a3e', max = 1.4) {
    const lines = this.voice[kind];
    const text = lines[Math.floor(Math.random() * lines.length)];
    const p = this.sim?.playerPos() ?? { x: 4.5, y: 0 };
    this.float(text, p.x, p.y, color, true, max, 0.36);
  }

  onEvent(e: SimEvent, sim: Sim) {
    switch (e.type) {
      case 'step': {
        const p = sim.playerPos();
        for (let i = 0; i < 3; i++)
          this.spawn('dust', p.x + (Math.random() - 0.5) * 0.3, p.y - 0.25, (Math.random() - 0.5) * 0.6, 0.3, 0.35, 0.07, '#e8dcc8');
        break;
      }
      case 'hit':
        this.shake = 0.35;
        this.say('hit', '#c0392b', 1.5);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          this.spawn('star', e.x, e.y + 0.4, Math.cos(a) * 1.4, Math.sin(a) * 1.4 + 1, 0.7, 0.13, '#f7c948');
        }
        break;
      case 'screech':
        for (let i = 0; i < 8; i++)
          this.spawn('puff', e.x + (Math.random() - 0.5) * 0.8, e.y - 0.1, (Math.random() - 0.5) * 1.2, Math.random() * 0.8, 0.8, 0.14, '#e6e6ee');
        break;
      case 'honk':
        this.float(this.texts.honk, e.x, e.y + 0.55, '#ffffff', false, 0.8, 0.32);
        break;
      case 'slipper':
        this.say('slipper', '#c0392b', 1.4);
        // l'onda d'urto della ciabatta: si vede fin dove arriva
        this.spawn('ring', e.x, e.y + 0.5, 0, 0, 0.55, 0.2, '#3d8bd9');
        this.shake = 0.12;
        break;
      case 'pickup':
        if (e.kind === 'candy') {
          this.float('+1', e.x, e.y + 0.3, '#e84a8a');
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.spawn('spark', e.x, e.y, Math.cos(a) * 2, Math.sin(a) * 2, 0.45, 0.08, i % 2 ? '#ffffff' : '#f7c948');
          }
        } else if (e.kind === 'coffee') this.float(this.texts.coffee, e.x, e.y + 0.3, '#6b3f25');
        else if (e.kind === 'slipper') this.float(this.texts.extraSlipper, e.x, e.y + 0.3, '#3d8bd9');
        else {
          this.float(this.texts.extraHeart, e.x, e.y + 0.3, '#e84a4a');
          this.say('happy', '#3fae5a');
        }
        break;
      case 'splash':
        for (let i = 0; i < 10; i++)
          this.spawn('drop', e.x + (Math.random() - 0.5) * 0.4, e.y - 0.1, (Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 1.5, 0.55, 0.06, '#7fc4ea');
        break;
      case 'pigeons':
        for (let i = 0; i < 6; i++)
          this.spawn('feather', e.x + (Math.random() - 0.5), e.y + Math.random() * 0.5, (Math.random() - 0.5) * 0.8, 0.3, 1.4, 0.06, '#c9cfdb');
        break;
      case 'stormNear':
        this.say('storm', '#3d5fa8', 1.8);
        break;
      case 'thunder':
        this.boltX = 0.15 + Math.random() * 0.7;
        if (!this.reduceMotion) this.flash = 0.35;
        break;
      case 'over':
        if (e.cause === 'storm') {
          const p = sim.playerPos();
          for (let i = 0; i < 16; i++)
            this.spawn('drop', p.x + (Math.random() - 0.5) * 1.2, p.y + 1.2, (Math.random() - 0.5) * 1.5, -1 - Math.random() * 2, 0.8, 0.05, '#7fc4ea');
        }
        break;
      default:
        break;
    }
  }

  celebrate() {
    const sim = this.sim;
    if (!sim) return;
    const p = sim.playerPos();
    this.say('happy', '#3fae5a', 1.6);
    for (let i = 0; i < 60; i++)
      this.spawn('confetti', p.x + (Math.random() - 0.5) * 3, p.y + 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 2 + Math.random() * 4, 2.2, 0.09, CONFETTI[i % CONFETTI.length]);
  }

  private updateFx(dt: number) {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'drop' || p.kind === 'confetti') p.vy -= 9 * dt;
      if (p.kind === 'confetti') {
        p.vx *= 1 - dt * 1.5;
        p.vy = Math.max(p.vy, -2.2);
      }
      if (p.kind === 'feather') p.vy -= 0.4 * dt;
      if (p.kind === 'puff' || p.kind === 'dust') {
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
      }
    }
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.max);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.enterT >= 0) this.enterT += dt;
  }

  // ------------------------------------------------------------ disegno

  private X(x: number) {
    return (x - this.xLeft) * this.s;
  }

  private Y(y: number) {
    return this.canvas.height - (y - this.camY) * this.s;
  }

  render(sim: Sim, look: Look, dt: number, showPlayer = true) {
    const ctx = this.ctx;
    this.time += dt;
    this.updateFx(dt);

    const k = 1 - Math.exp(-dt * 5);
    this.camY += (this.camTarget(sim) - this.camY) * k;
    // la camera si allinea al pixel: niente sfarfallio sullo sfondo
    this.camY = Math.round(this.camY * this.s) / this.s;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.shake > 0 && !this.reduceMotion) {
      const a = this.shake * this.s * 0.25;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }
    ctx.fillStyle = '#6ec3f0';
    ctx.fillRect(-20, -20, this.canvas.width + 40, this.canvas.height + 40);
    this.bg?.draw(ctx, this.camY, this.canvas.height);

    const s = this.s;
    const visTop = this.camY + this.canvas.height / s;
    const rTop = Math.ceil(visTop) + 1;
    const rBot = Math.max(0, Math.floor(this.camY) - 1);

    // semafori del tram e passaggi a livello
    for (let r = rBot; r <= rTop; r++) {
      const rs = sim.rowState(r);
      const kind = rs.def.kind;
      if ((kind !== 'tram' && kind !== 'rail') || !(rs.warn || rs.trainOn)) continue;
      const on = Math.floor(sim.time * 4) % 2 === 0;
      if (kind === 'tram') {
        ctx.fillStyle = on ? 'rgba(255,214,70,0.33)' : 'rgba(232,74,74,0.22)';
        ctx.fillRect(0, this.Y(r + 1), this.canvas.width, s);
        for (const x of [0.25, COLS - 0.25]) this.lamp(this.X(x), this.Y(r + 0.5), on ? '#ffd646' : '#e84a4a');
      } else {
        ctx.fillStyle = on ? 'rgba(232,74,74,0.26)' : 'rgba(232,74,74,0.12)';
        ctx.fillRect(0, this.Y(r + 1), this.canvas.width, s);
        // sbarre abbassate e le due luci rosse che si alternano
        for (const side of [-1, 1]) {
          const px = side < 0 ? this.X(-0.2) : this.X(COLS + 0.2);
          const by = this.Y(r) - 0.1 * s;
          const len = 2.4 * s;
          const x0 = side < 0 ? px : px - len;
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = k % 2 ? '#ffffff' : '#e0443c';
            ctx.fillRect(x0 + (k * len) / 6, by - 0.05 * s, len / 6 + 1, 0.1 * s);
          }
          ctx.strokeStyle = INK;
          ctx.lineWidth = 0.025 * s;
          ctx.strokeRect(x0, by - 0.05 * s, len, 0.1 * s);
          this.lamp(px + side * -0.05 * s, this.Y(r + 0.72), on ? '#ff4a3d' : '#5a2320', 0.13);
          this.lamp(px + side * -0.05 * s, this.Y(r + 0.36), on ? '#5a2320' : '#ff4a3d', 0.13);
        }
      }
    }

    const pp = sim.playerPos();
    const playerRow = Math.floor(pp.y);
    for (let r = rTop; r >= rBot; r--) {
      const rs = sim.rowState(r);
      const def = rs.def;
      const cy = this.Y(r + 0.5);
      // oggetti da raccogliere
      def.pickups.forEach((pk, i) => {
        const sp = this.statics.pickup(pk.kind);
        const taken = rs.takenT[i];
        if (taken >= 0) {
          if (taken > 0.35) return;
          ctx.globalAlpha = 1 - taken / 0.35;
          ctx.drawImage(sp.canvas, this.X(pk.col + 0.5) - sp.ox, cy - sp.oy - taken * 2.5 * s);
          ctx.globalAlpha = 1;
          return;
        }
        const bob = Math.sin(this.time * 3 + pk.col + r) * 0.06 * s;
        ctx.fillStyle = 'rgba(30,25,50,0.15)';
        ctx.beginPath();
        ctx.ellipse(this.X(pk.col + 0.5), cy + 0.22 * s, 0.2 * s, 0.06 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(sp.canvas, this.X(pk.col + 0.5) - sp.ox, cy - sp.oy - bob);
      });
      // arredo (nelle piazze le celle bloccate sono i palazzi, già disegnati nello sfondo)
      if (!(def.stop && r > def.stop.entry)) {
        for (const b of def.blockers) {
          const sp = this.statics.prop(b.kind);
          ctx.drawImage(sp.canvas, this.X(b.col + 0.5) - sp.ox, cy - sp.oy);
        }
      }
      for (const g of sim.pigeons) {
        if (g.gone || g.flying || Math.floor(g.y) !== r) continue;
        this.withWorld(g.x, g.y - 0.1, g.flip ? -1 : 1, () => drawPigeon(ctx, g.t, false));
      }
      for (const v of rs.vehicles) {
        const x = this.X(v.x);
        // chi sta per entrare da fuori schermo si annuncia con una spia sul bordo
        if (sim.status === 'playing' && !isTrain(v.kind) && v.speed > 0.5) {
          const front = v.x + (v.dir * v.len) / 2;
          const far = v.dir > 0 ? this.xLeft - front : front - this.xRight;
          if (far > 0 && far < v.speed * EDGE_WARN) this.edgeWarn(v.dir > 0 ? -1 : 1, cy, 1 - far / (v.speed * EDGE_WARN));
        }
        // si salta solo chi è tutto fuori schermo (i treni sono lunghi anche 12 celle)
        const half = (v.len / 2 + 0.5) * s;
        if (x + half < 0 || x - half > this.canvas.width) continue;
        const sp = this.vehicles.get(v.kind, v.color, v.dir);
        ctx.drawImage(sp.canvas, Math.round(x - sp.ox), Math.round(cy - sp.oy));
        if (v.braking && v.kind !== 'bike' && !isTrain(v.kind)) {
          const bx = x - v.dir * (v.len / 2 - 0.06) * s;
          const by = cy + BRAKE_Y * s;
          ctx.fillStyle = 'rgba(255,60,50,0.35)';
          ctx.beginPath();
          ctx.arc(bx, by, 0.16 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff4a3d';
          ctx.beginPath();
          ctx.arc(bx, by, 0.06 * s, 0, Math.PI * 2);
          ctx.fill();
        }
        if (v.stopT > SLIPPER_STOP - 0.8 && v.stopT > 0) this.exclaim(x, cy - 0.75 * s);
      }
      if (showPlayer && r === playerRow) this.drawPlayer(sim, look);
    }
    if (showPlayer && (playerRow > rTop || playerRow < rBot)) this.drawPlayer(sim, look);

    for (const g of sim.pigeons) {
      if (g.gone || !g.flying) continue;
      this.withWorld(g.x, g.y, g.flip ? -1 : 1, () => drawPigeon(ctx, g.t, true));
    }

    this.drawDoorArrow(sim);
    this.drawParticles();
    this.drawStorm(sim);

    if (this.xLeft < -0.05) {
      ctx.fillStyle = 'rgba(30,25,60,0.28)';
      ctx.fillRect(0, 0, this.X(0), this.canvas.height);
      ctx.fillRect(this.X(COLS), 0, this.canvas.width - this.X(COLS), this.canvas.height);
    }

    this.drawFloaters(sim);

    if (this.flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${(this.flash / 0.35) * 0.35})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Spia sul bordo dello schermo: da quella parte sta arrivando un mezzo. */
  private edgeWarn(side: -1 | 1, cy: number, k: number) {
    const ctx = this.ctx;
    const s = this.s;
    const x = side < 0 ? 0 : this.canvas.width;
    const y = cy + 0.02 * s;
    ctx.globalAlpha = Math.min(1, 0.35 + k * 0.8);
    ctx.fillStyle = k > 0.6 ? '#e84a4a' : '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.03 * s;
    ctx.beginPath();
    ctx.arc(x, y, 0.24 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = k > 0.6 ? '#ffffff' : INK;
    ctx.lineWidth = 0.05 * s;
    ctx.beginPath();
    const tip = x - side * 0.14 * s;
    ctx.moveTo(tip + side * 0.08 * s, y - 0.09 * s);
    ctx.lineTo(tip, y);
    ctx.lineTo(tip + side * 0.08 * s, y + 0.09 * s);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private lamp(x: number, y: number, color: string, r = 0.2) {
    const ctx = this.ctx;
    const s = this.s;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, s * r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, s * r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Quando la coppia arriva in piazza, una freccia indica il portone da cui entrare. */
  private drawDoorArrow(sim: Sim) {
    if (sim.status !== 'playing') return;
    const row = sim.player.row;
    const stop = sim.world.stops.find((st) => row >= st.entry - 3 && row <= st.entry);
    if (!stop) return;
    const ctx = this.ctx;
    const s = this.s;
    const bob = Math.abs(Math.sin(this.time * 5)) * 0.18;
    const x = this.X(DOOR_COL + 0.5);
    const y = this.Y(doorRow(stop) + ARROW_Y + bob);
    ctx.fillStyle = '#f7c948';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.05 * s;
    ctx.beginPath();
    ctx.moveTo(x - 0.16 * s, y - 0.3 * s);
    ctx.lineTo(x + 0.16 * s, y - 0.3 * s);
    ctx.lineTo(x + 0.16 * s, y - 0.05 * s);
    ctx.lineTo(x + 0.34 * s, y - 0.05 * s);
    ctx.lineTo(x, y + 0.3 * s);
    ctx.lineTo(x - 0.34 * s, y - 0.05 * s);
    ctx.lineTo(x - 0.16 * s, y - 0.05 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Il temporale che insegue la coppia: un nuvolone arrabbiato che spunta sempre dal
   * fondo dello schermo e sale man mano che si avvicina, con la pioggia sotto.
   */
  private drawStorm(sim: Sim) {
    if (!sim.started) return;
    const ctx = this.ctx;
    const s = this.s;
    const W = this.canvas.width;
    const Hc = this.canvas.height;
    const t = this.time;
    const close = sim.stormCloseness();
    const edge = Math.min(this.Y(sim.stormY), Hc - (0.62 + close * 0.7) * s);
    // cielo coperto: più è vicino, più si scurisce tutto
    if (close > 0.2) {
      ctx.fillStyle = `rgba(40,44,78,${((close - 0.2) * 0.2).toFixed(3)})`;
      ctx.fillRect(0, 0, W, Hc);
    }
    // fronte del temporale già pronto in uno sprite, poi il buio pieno fino in fondo
    const front = this.stormFront();
    const sway = Math.sin(t * 0.7) * 0.08 * s;
    ctx.drawImage(front, Math.round(-0.3 * s + sway), Math.round(edge - STORM_TOP * s));
    const below = Math.round(edge - STORM_TOP * s) + front.height;
    if (below < Hc) {
      ctx.fillStyle = 'rgba(38,40,66,0.85)';
      ctx.fillRect(0, below, W, Hc - below);
    }
    // pioggia sotto il nuvolone e, quando è addosso, anche davanti
    ctx.strokeStyle = 'rgba(190,215,255,0.6)';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    const span = Hc - edge + s;
    for (let i = 0; i < 60; i++) {
      const x = ((i * 97.13 + t * s * 0.9) % (W + s)) - s * 0.5;
      const y = edge + ((i * 53.7 + t * s * 9) % span);
      ctx.moveTo(x, y);
      ctx.lineTo(x - s * 0.08, y + s * 0.32);
    }
    if (close > 0.55) {
      const n = Math.round((close - 0.55) * 60);
      for (let i = 0; i < n; i++) {
        const x = ((i * 131.7 + t * s * 0.9) % (W + s)) - s * 0.5;
        const y = (i * 71.3 + t * s * 10) % (edge + s);
        ctx.moveTo(x, y);
        ctx.lineTo(x - s * 0.07, y + s * 0.26);
      }
    }
    ctx.stroke();
    // il fulmine, quando tuona
    if (this.flash > 0.12) {
      const bx = this.boltX * W;
      ctx.strokeStyle = '#fff6b0';
      ctx.lineWidth = s * 0.07;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(bx, edge);
      ctx.lineTo(bx - s * 0.25, edge + s * 0.55);
      ctx.lineTo(bx + s * 0.08, edge + s * 0.6);
      ctx.lineTo(bx - s * 0.2, edge + s * 1.3);
      ctx.stroke();
      ctx.lineJoin = 'round';
    }
    this.drawStormFace(sim, edge, close);
  }

  /**
   * Il fronte del temporale (buio sfumato e due file di nuvoloni) disegnato una volta
   * sola per ogni risoluzione: a ogni frame basta copiarlo.
   */
  private stormFront(): HTMLCanvasElement {
    const s = this.s;
    const W = this.canvas.width + Math.ceil(0.6 * s);
    if (this.stormSprite && this.stormSprite.width === W && this.stormKey === s) return this.stormSprite;
    if (this.stormSprite) this.stormSprite.width = 0;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = Math.ceil((STORM_TOP + 1.7) * s);
    const g = c.getContext('2d')!;
    const e = STORM_TOP * s;
    const grad = g.createLinearGradient(0, e - s * 0.3, 0, c.height);
    grad.addColorStop(0, 'rgba(52,56,86,0)');
    grad.addColorStop(0.2, 'rgba(52,56,86,0.6)');
    grad.addColorStop(1, 'rgba(38,40,66,0.85)');
    g.fillStyle = grad;
    g.fillRect(0, e - s * 0.3, W, c.height);
    for (let i = -1; i < W / s + 1; i++) {
      const x = (i + 0.5) * s;
      const r = s * (0.55 + ((i * 37) % 5) * 0.06);
      g.fillStyle = '#4f5470';
      g.beginPath();
      g.arc(x + s * 0.3, e - s * 0.28, r * 0.8, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = -1; i < W / s + 1; i++) {
      const x = (i + 0.5 + Math.sin(i * 1.7) * 0.08) * s;
      const r = s * (0.55 + ((i * 37) % 5) * 0.06);
      g.fillStyle = '#5b6079';
      g.beginPath();
      g.arc(x, e - s * 0.1, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6d7290';
      g.beginPath();
      g.arc(x - r * 0.25, e - s * 0.25, r * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    this.stormSprite = c;
    this.stormKey = s;
    return c;
  }

  /** Il muso del nuvolone: segue la coppia, guarda in su e soffia. */
  private drawStormFace(sim: Sim, edge: number, close: number) {
    const ctx = this.ctx;
    const s = this.s;
    const px = this.X(sim.playerPos().x);
    this.faceX = this.faceX === 0 ? px : this.faceX + (px - this.faceX) * 0.03;
    const fx = this.faceX;
    const fy = edge - s * 0.18 + Math.sin(this.time * 2.2) * s * 0.05;
    ctx.fillStyle = '#737896';
    ctx.beginPath();
    ctx.arc(fx, fy, s * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a8fac';
    ctx.beginPath();
    ctx.arc(fx - s * 0.3, fy - s * 0.3, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // occhi che guardano la nonna, sopracciglia arrabbiate
    const look = Math.max(-1, Math.min(1, (px - fx) / (s * 2)));
    for (const side of [-1, 1]) {
      const ex = fx + side * s * 0.27;
      const ey = fy - s * 0.12;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, ey, s * 0.13, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ex + look * s * 0.05, ey - s * 0.06, s * 0.065, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = s * 0.07;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex + side * s * 0.14, ey - s * 0.3);
      ctx.lineTo(ex - side * s * 0.1, ey - s * 0.18 + close * s * 0.04);
      ctx.stroke();
    }
    // bocca che soffia, e le folate di vento verso la coppia
    ctx.fillStyle = '#2d2a3e';
    ctx.beginPath();
    ctx.ellipse(fx, fy + s * 0.2, s * 0.09, s * 0.07 + close * s * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    const puff = (this.time * 1.4) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - puff)).toFixed(3)})`;
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    for (const dx of [-0.18, 0, 0.18]) {
      const y0 = fy - s * (0.1 + puff * 0.9);
      ctx.moveTo(fx + dx * s, y0);
      ctx.quadraticCurveTo(fx + (dx + 0.08) * s, y0 - s * 0.15, fx + dx * s, y0 - s * 0.3);
    }
    ctx.stroke();
  }

  private withWorld(x: number, y: number, flipX: number, fn: () => void) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.X(x), this.Y(y));
    ctx.scale(this.s * flipX, this.s);
    fn();
    ctx.restore();
  }

  private exclaim(x: number, y: number) {
    const ctx = this.ctx;
    const s = this.s;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.03 * s;
    ctx.beginPath();
    ctx.arc(x, y, 0.16 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e84a4a';
    ctx.font = `700 ${Math.round(0.24 * s)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + 0.01 * s);
  }

  private drawPlayer(sim: Sim, look: Look) {
    const ctx = this.ctx;
    const p = sim.player;
    let { x, y } = sim.playerPos();
    let alpha = 1;
    let mood: Mood = 'idle';
    if (this.enterT >= 0 && this.enterStop && sim.status === 'stop') {
      // la coppia va verso la porta del palazzo e sparisce dentro
      const k = Math.min(1, this.enterT / 0.7);
      const door = { x: DOOR_COL + 0.5, y: doorRow(this.enterStop) + DOOR_Y };
      x += (door.x - x) * k;
      y += (door.y - y) * k;
      alpha = 1 - Math.max(0, (this.enterT - 0.5) / 0.3);
      mood = 'walk';
      if (alpha <= 0) return;
    } else if (p.stunned > 0 || sim.status === 'over') mood = 'angry';
    else if (p.slipperT > 0) mood = 'slipper';
    else if (p.moving) mood = 'walk';
    if (p.invuln > 0 && Math.floor(sim.time * 14) % 2 === 0) alpha *= 0.35;
    const hop = p.moving ? Math.sin(Math.PI * p.t) * 0.2 : 0;
    const walkT = this.enterT >= 0 ? this.enterT * 3 : p.t;
    const legs = p.moving || this.enterT >= 0 ? Math.sin(Math.PI * walkT) * (p.steps % 2 ? 1 : -1) : 0;
    let bx = 0;
    let by = 0;
    if (p.bumpT > 0) {
      const b = Math.sin((p.bumpT / 0.18) * Math.PI) * 0.12;
      bx = p.bumpDx * b;
      by = p.bumpDy * b;
    }
    ctx.globalAlpha = alpha;
    this.withWorld(x + bx, y - 0.24 + by, 1, () => {
      const breathe = mood === 'idle' ? 1 + Math.sin(sim.time * 2.6) * 0.012 : 1;
      ctx.scale(1, breathe);
      drawPair(ctx, look, { facing: p.facing, legs, mood, t: sim.time }, hop);
      if (p.coffeeT > 0 && sim.status === 'playing') {
        const tt = sim.time * 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 0.03;
        for (let i = 0; i < 2; i++) {
          const ox = -0.17 + (i - 0.5) * 0.12;
          const ph = (tt + i * 0.5) % 1;
          ctx.globalAlpha = alpha * (1 - ph);
          ctx.beginPath();
          ctx.moveTo(ox, -1.02 - ph * 0.25);
          ctx.quadraticCurveTo(ox + 0.06, -1.08 - ph * 0.25, ox, -1.14 - ph * 0.25);
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
      }
    });
    if (p.stunned > 0) {
      for (let i = 0; i < 3; i++) {
        const a = sim.time * 6 + (i * Math.PI * 2) / 3;
        const sx = x - 0.17 * p.facing + Math.cos(a) * 0.22;
        const sy = y + 0.9 + Math.sin(a) * 0.07;
        this.star(this.X(sx), this.Y(sy), 0.07 * this.s, a, '#f7c948');
      }
    }
    ctx.globalAlpha = 1;
  }

  private star(x: number, y: number, r: number, rot: number, color: string) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.45 : r;
      const a = rot + (i * Math.PI) / 5;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      else ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.25;
    ctx.stroke();
  }

  private drawParticles() {
    const ctx = this.ctx;
    const s = this.s;
    for (const p of this.particles) {
      if (!p.alive) continue;
      const k = p.life / p.max;
      const x = this.X(p.x);
      const y = this.Y(p.y);
      switch (p.kind) {
        case 'puff':
        case 'dust':
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size * s * (1 + k * 2), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'ring': {
          // raggio fino a ~5 righe: la portata della ciabatta
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = s * 0.12 * (1 - k) + 1;
          ctx.beginPath();
          ctx.ellipse(x, y, s * 5 * k + s * 0.3, s * 4 * k + s * 0.2, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'star':
          ctx.globalAlpha = 1 - k;
          this.star(x, y, p.size * s, p.rot, p.color);
          break;
        case 'spark':
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-p.size * s * 0.5, -p.size * s * 0.5, p.size * s, p.size * s);
          ctx.restore();
          break;
        case 'drop':
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size * s, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'confetti':
          ctx.globalAlpha = Math.min(1, (1 - k) * 3);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.rot * 1.7));
          ctx.fillRect(-p.size * s, -p.size * s * 0.5, p.size * s * 2, p.size * s);
          ctx.restore();
          break;
        case 'feather':
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(x, y, p.size * s * 1.6, p.size * s * 0.6, p.rot, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(sim: Sim) {
    const ctx = this.ctx;
    const s = this.s;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const k = f.t / f.max;
      const fontPx = Math.round(f.size * s);
      ctx.font = `700 ${fontPx}px ${FONT}`;
      if (f.bubble) {
        // fumetto sopra la testa della nonna
        const pos = sim.playerPos();
        const pop = Math.min(1, f.t / 0.12);
        const scale = 0.6 + 0.4 * pop;
        const x = this.X(pos.x - 0.17 * sim.player.facing);
        const y = this.Y(pos.y + 1.15) - Math.min(f.t, 0.3) * 0.2 * s;
        const w = ctx.measureText(f.text).width + 0.35 * s;
        const h = fontPx + 0.25 * s;
        ctx.save();
        ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        const bx = Math.max(-x / scale + 4, Math.min(-w / 2, this.canvas.width / scale - x / scale - w - 4));
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.035 * s;
        rr(ctx, bx, -h / 2, w, h, h * 0.45);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-0.08 * s, h / 2 - 1);
        ctx.lineTo(0, h / 2 + 0.16 * s);
        ctx.lineTo(0.1 * s, h / 2 - 1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-0.08 * s, h / 2);
        ctx.lineTo(0, h / 2 + 0.16 * s);
        ctx.lineTo(0.1 * s, h / 2);
        ctx.stroke();
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, bx + w / 2, 1);
        ctx.restore();
      } else {
        const x = this.X(f.x);
        const y = this.Y(f.y + k * 0.9);
        ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        ctx.lineWidth = 0.08 * s;
        ctx.strokeStyle = INK;
        ctx.lineJoin = 'round';
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }
}

