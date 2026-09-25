import { COLS } from '../levels';
import type { Outfit } from '../outfits';
import { UMBRELLA_STOP } from '../sim';
import type { Sim, SimEvent } from '../sim';
import { Background } from './background';
import { drawPair } from './characters';
import type { Mood } from './characters';
import { FONT, INK, rr } from './paint';
import type { Ctx } from './paint';
import { StaticSprites, drawPigeon } from './props';
import { VehicleSprites } from './vehicles';

type PKind = 'puff' | 'star' | 'spark' | 'drop' | 'confetti' | 'feather' | 'dust';

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
  hit: string[];
  umbrella: string;
  coffee: string;
  extraUmbrella: string;
  win: string[];
  destination: string;
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
  private bgSim: Sim | null = null;
  private vehicles!: VehicleSprites;
  private statics!: StaticSprites;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shake = 0;
  private winT = -1;
  private time = 0;
  reduceMotion = false;
  texts: Texts = {
    honk: 'Beep!',
    hit: ['Hey!'],
    umbrella: 'STOP!',
    coffee: 'Espresso!',
    extraUmbrella: '+1',
    win: ['Yay!'],
    destination: '',
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D non disponibile');
    this.ctx = ctx;
    for (let i = 0; i < 260; i++) {
      this.particles.push({
        alive: false,
        kind: 'puff',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        size: 0,
        rot: 0,
        vr: 0,
        color: '#fff',
      });
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
    if (this.bgSim) {
      const sim = this.bgSim;
      this.bgSim = null;
      this.setLevel(sim, this.texts.destination);
    }
  }

  private camRange(rows: number): [number, number] {
    const H = this.layout.height / this.cell;
    const hud = this.layout.hudTop / this.cell;
    const lo = -1.3;
    // in cima si vede anche l'insegna del negozio di destinazione
    const hi = rows + 2.7 + hud - H;
    return [lo, hi];
  }

  private camTarget(sim: Sim): number {
    const [lo, hi] = this.camRange(sim.rows.length);
    if (hi <= lo) return (lo + hi) / 2;
    const H = (this.layout.height - this.layout.hudTop) / this.cell;
    const target = sim.playerPos().y - H * 0.34;
    return Math.max(lo, Math.min(hi, target));
  }

  setLevel(sim: Sim, destinationLabel: string) {
    this.texts.destination = destinationLabel;
    this.bg?.dispose();
    const [lo, hi] = this.camRange(sim.rows.length);
    const H = this.layout.height / this.cell;
    const yMin = Math.min(lo, (lo + hi) / 2) - 1;
    const yMax = Math.max(hi, (lo + hi) / 2) + H + 1;
    this.bg = new Background(sim.level, this.s, this.xLeft, this.xRight, yMin, yMax, destinationLabel);
    this.bgSim = sim;
    this.camY = this.camTarget(sim);
    this.winT = -1;
    for (const p of this.particles) p.alive = false;
    this.floaters = [];
    this.shake = 0;
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

  onEvent(e: SimEvent, sim: Sim) {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    switch (e.type) {
      case 'step': {
        const p = sim.playerPos();
        for (let i = 0; i < 3; i++)
          this.spawn('dust', p.x + (Math.random() - 0.5) * 0.3, p.y - 0.25, (Math.random() - 0.5) * 0.6, 0.3, 0.35, 0.07, '#e8dcc8');
        break;
      }
      case 'hit':
        this.shake = 0.35;
        this.float(pick(this.texts.hit), e.x, e.y, '#e84a4a', true, 1.1);
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
      case 'umbrella':
        this.float(this.texts.umbrella, e.x, e.y, '#e84a4a', true, 1.2);
        break;
      case 'pickup':
        if (e.kind === 'candy') {
          this.float('+1', e.x, e.y + 0.3, '#e84a8a');
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.spawn('spark', e.x, e.y, Math.cos(a) * 2, Math.sin(a) * 2, 0.45, 0.08, i % 2 ? '#ffffff' : '#f7c948');
          }
        } else if (e.kind === 'coffee') {
          this.float(this.texts.coffee, e.x, e.y + 0.3, '#6b3f25');
        } else {
          this.float(this.texts.extraUmbrella, e.x, e.y + 0.3, '#e84a4a');
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
      case 'win': {
        this.winT = 0;
        const p = sim.playerPos();
        this.float(pick(this.texts.win), p.x, p.y, '#3fae5a', true, 1.6);
        for (let i = 0; i < 70; i++)
          this.spawn(
            'confetti',
            p.x + (Math.random() - 0.5) * 3,
            p.y + 1 + Math.random() * 2,
            (Math.random() - 0.5) * 4,
            2 + Math.random() * 4,
            2.2,
            0.09,
            CONFETTI[i % CONFETTI.length],
          );
        break;
      }
      default:
        break;
    }
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
  }

  // ------------------------------------------------------------ disegno

  private X(x: number) {
    return (x - this.xLeft) * this.s;
  }

  private Y(y: number) {
    return this.canvas.height - (y - this.camY) * this.s;
  }

  render(sim: Sim, outfit: Outfit, dt: number, showPlayer = true) {
    const ctx = this.ctx;
    this.time += dt;
    this.updateFx(dt);
    if (this.winT >= 0) this.winT += dt;

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
    const rTop = Math.min(sim.rows.length - 1, Math.ceil(visTop));
    const rBot = Math.max(0, Math.floor(this.camY) - 1);

    // semafori del tram
    for (let r = rBot; r <= rTop; r++) {
      const rs = sim.rows[r];
      if (rs.def.kind !== 'tram' || !rs.warn) continue;
      const on = Math.floor(sim.time * 4) % 2 === 0;
      ctx.fillStyle = on ? 'rgba(255,214,70,0.33)' : 'rgba(232,74,74,0.22)';
      ctx.fillRect(0, this.Y(r + 1), this.canvas.width, s);
      for (const x of [0.25, COLS - 0.25]) {
        const px = this.X(x);
        const py = this.Y(r + 0.5);
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(px, py, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = on ? '#ffd646' : '#e84a4a';
        ctx.beginPath();
        ctx.arc(px, py, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const pp = sim.playerPos();
    const playerRow = Math.floor(pp.y);
    for (let r = rTop; r >= rBot; r--) {
      const rs = sim.rows[r];
      const cy = this.Y(r + 0.5);
      // oggetti da raccogliere
      for (const pk of sim.pickups) {
        if (pk.row !== r) continue;
        const sp = this.statics.pickup(pk.kind);
        if (pk.taken) {
          if (pk.takenT > 0.35) continue;
          const a = 1 - pk.takenT / 0.35;
          ctx.globalAlpha = a;
          const lift = pk.takenT * 2.5 * s;
          ctx.drawImage(sp.canvas, this.X(pk.col + 0.5) - sp.ox, cy - sp.oy - lift);
          ctx.globalAlpha = 1;
          continue;
        }
        const bob = Math.sin(this.time * 3 + pk.col) * 0.06 * s;
        ctx.fillStyle = 'rgba(30,25,50,0.15)';
        ctx.beginPath();
        ctx.ellipse(this.X(pk.col + 0.5), cy + 0.22 * s, 0.2 * s, 0.06 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(sp.canvas, this.X(pk.col + 0.5) - sp.ox, cy - sp.oy - bob);
      }
      // arredo
      for (const b of rs.def.blockers) {
        const sp = this.statics.prop(b.kind);
        ctx.drawImage(sp.canvas, this.X(b.col + 0.5) - sp.ox, cy - sp.oy);
      }
      // piccioni a terra
      for (const g of sim.pigeons) {
        if (g.gone || g.flying || Math.floor(g.y) !== r) continue;
        this.withWorld(g.x, g.y - 0.1, g.flip ? -1 : 1, () => drawPigeon(ctx, g.t, false));
      }
      // veicoli
      for (const v of rs.vehicles) {
        const x = this.X(v.x);
        if (x < -4 * s || x > this.canvas.width + 4 * s) continue;
        const sp = this.vehicles.get(v.kind, v.color, v.dir);
        ctx.drawImage(sp.canvas, Math.round(x - sp.ox), Math.round(cy - sp.oy));
        if (v.braking && v.kind !== 'bike' && v.kind !== 'tram') {
          const bx = x - v.dir * (v.len / 2 - 0.05) * s;
          const by = cy + 0.08 * s;
          ctx.fillStyle = 'rgba(255,60,50,0.35)';
          ctx.beginPath();
          ctx.arc(bx, by, 0.16 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff4a3d';
          ctx.beginPath();
          ctx.arc(bx, by, 0.06 * s, 0, Math.PI * 2);
          ctx.fill();
        }
        if (v.stopT > UMBRELLA_STOP - 0.8 && v.stopT > 0) this.exclaim(x, cy - 0.75 * s);
      }
      if (showPlayer && r === playerRow) this.drawPlayer(sim, outfit);
    }
    if (showPlayer && (playerRow > rTop || playerRow < rBot)) this.drawPlayer(sim, outfit);

    // piccioni in volo, sopra tutto
    for (const g of sim.pigeons) {
      if (g.gone || !g.flying) continue;
      this.withWorld(g.x, g.y, g.flip ? -1 : 1, () => drawPigeon(ctx, g.t, true));
    }

    this.drawParticles();

    // colonne fuori gioco (schermi larghi, es. iPad)
    if (this.xLeft < -0.05) {
      ctx.fillStyle = 'rgba(30,25,60,0.28)';
      ctx.fillRect(0, 0, this.X(0), this.canvas.height);
      ctx.fillRect(this.X(COLS), 0, this.canvas.width - this.X(COLS), this.canvas.height);
    }

    this.drawFloaters(sim);
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

  private drawPlayer(sim: Sim, outfit: Outfit) {
    const ctx = this.ctx;
    const p = sim.player;
    let { x, y } = sim.playerPos();
    let alpha = 1;
    if (sim.status === 'won' && this.winT >= 0) {
      // la coppia entra nel negozio
      const k = Math.min(1, Math.max(0, (this.winT - 0.6) / 1.1));
      x += (COLS / 2 - x) * k;
      y += 0.55 * k;
      alpha = 1 - Math.max(0, (this.winT - 1.3) / 0.5);
      if (alpha <= 0) return;
    }
    if (p.invuln > 0 && Math.floor(sim.time * 14) % 2 === 0) alpha *= 0.35;
    let mood: Mood = 'idle';
    if (sim.status === 'won') mood = 'happy';
    else if (p.stunned > 0 || sim.status === 'lost') mood = 'angry';
    else if (p.umbrellaT > 0) mood = 'umbrella';
    else if (p.moving) mood = 'walk';
    const hop = p.moving ? Math.sin(Math.PI * p.t) * 0.2 : 0;
    const legs = p.moving ? Math.sin(Math.PI * p.t) * (p.steps % 2 ? 1 : -1) : 0;
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
      drawPair(ctx, outfit, { facing: p.facing, legs, mood, t: sim.time }, hop);
      if (p.coffeeT > 0 && sim.status === 'playing') {
        // vapore del caffè: la nonna ha il turbo
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
      // stelline che girano sopra la testa
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
        const pos = sim.status === 'won' ? { x: f.x, y: f.y } : sim.playerPos();
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

  /** Posizione a schermo (punti CSS) di una cella: serve all'HUD per i suggerimenti. */
  screenOf(x: number, y: number): { x: number; y: number } {
    const d = this.layout.dpr;
    return { x: this.X(x) / d, y: this.Y(y) / d };
  }
}
