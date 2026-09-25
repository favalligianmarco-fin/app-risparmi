import { INK, circle, ellipse, fillInk, rr } from '../render/paint';
import { bubble, label, nonnaAt, pick } from './common';
import type { Ctx, MiniEnv, MiniGame } from './common';

export interface PranzoTexts {
  dishes: string[];
  lines: string[];
  tap: string;
}

const BITES = 9;

/** Pranzo dalla nonna: tre piatti da finire toccando più veloce che si può. */
export class Pranzo implements MiniGame {
  readonly limit = 9;
  result: 'running' | 'win' | 'fail' = 'running';
  private dish = 0;
  private bites = 0;
  private slide = 0;
  private fork = 0;
  private t = 0;
  private say: string;
  private sayT = 1.4;
  private crumbs: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];

  constructor(
    private readonly env: MiniEnv,
    private readonly tx: PranzoTexts,
  ) {
    this.say = tx.lines[0];
  }

  update(dt: number) {
    this.t += dt;
    this.sayT = Math.max(0, this.sayT - dt);
    this.fork = Math.max(0, this.fork - dt);
    if (this.slide > 0) this.slide = Math.max(0, this.slide - dt * 3);
    for (const c of this.crumbs) {
      c.life -= dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 600 * dt;
    }
    this.crumbs = this.crumbs.filter((c) => c.life > 0);
    // se ci si ferma, la nonna si preoccupa
    if (this.sayT <= 0 && this.fork <= 0 && this.result === 'running' && Math.random() < dt * 0.8) {
      this.say = pick(this.tx.lines.slice(1));
      this.sayT = 1.1;
    }
  }

  down() {
    if (this.result !== 'running' || this.slide > 0.35) return;
    this.bites++;
    this.fork = 0.12;
    this.env.sfx('chomp');
    this.env.haptic('light');
    for (let i = 0; i < 3; i++) {
      this.crumbs.push({
        x: (Math.random() - 0.5) * 60,
        y: -10,
        vx: (Math.random() - 0.5) * 220,
        vy: -200 - Math.random() * 160,
        life: 0.6,
        c: this.dish === 0 ? '#f0cf8e' : this.dish === 1 ? '#8a4b2a' : '#e84a4a',
      });
    }
    if (this.bites >= BITES) {
      this.bites = 0;
      this.dish++;
      this.env.sfx('good');
      if (this.dish >= 3) {
        this.result = 'win';
        return;
      }
      // "un altro pochino": arriva subito il piatto dopo
      this.slide = 1;
      this.say = this.tx.lines[1 + (this.dish % (this.tx.lines.length - 1))];
      this.sayT = 1.2;
    }
  }

  up() {}

  private food(ctx: Ctx, kind: number, left: number, r: number) {
    // left: frazione rimasta 0..1
    if (kind === 0) {
      // spaghetti al sugo con le polpettine
      ctx.strokeStyle = '#f0cf8e';
      ctx.lineWidth = 4;
      const n = Math.ceil(26 * left);
      for (let i = 0; i < n; i++) {
        const a = (i / 26) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.1, r * (0.3 + (i % 5) * 0.06), r * (0.22 + (i % 4) * 0.05), a, 0, Math.PI * 1.6);
        ctx.stroke();
      }
      if (left > 0.3) {
        ellipse(ctx, 0, -r * 0.05, r * 0.32 * left, r * 0.24 * left);
        fillInk(ctx, '#d63a3a', 2);
      }
      ctx.fillStyle = '#3f8f4f';
      if (left > 0.5) {
        ellipse(ctx, r * 0.05, -r * 0.1, 7, 4, 0.5);
        ctx.fill();
      }
    } else if (kind === 1) {
      const n = Math.ceil(6 * left);
      ellipse(ctx, 0, 0, r * 0.55 * Math.max(left, 0.3), r * 0.45 * Math.max(left, 0.3));
      ctx.fillStyle = '#d63a3a';
      ctx.fill();
      for (let i = 0; i < n; i++) {
        const a = (i / 6) * Math.PI * 2;
        circle(ctx, Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.24, r * 0.15);
        fillInk(ctx, '#8a4b2a', 2);
      }
    } else {
      // parmigiana: strati di melanzane, sugo e formaggio
      const wdt = r * 1.1 * Math.max(left, 0.15);
      rr(ctx, -wdt / 2, -r * 0.35, wdt, r * 0.7, 10);
      fillInk(ctx, '#f7c948', 2.5);
      ctx.fillStyle = '#d63a3a';
      ctx.fillRect(-wdt / 2 + 4, -r * 0.12, wdt - 8, r * 0.1);
      ctx.fillStyle = '#6b3f7a';
      ctx.fillRect(-wdt / 2 + 4, r * 0.05, wdt - 8, r * 0.08);
      ctx.fillStyle = '#fff4c4';
      for (let i = 0; i < 5; i++) ctx.fillRect(-wdt / 2 + 6 + i * (wdt / 5), -r * 0.3, 8, 5);
    }
  }

  draw(ctx: Ctx, w: number, h: number) {
    // tovaglia a quadretti
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(214,58,58,0.55)';
    for (let x = 0; x < w; x += 40) ctx.fillRect(x, 0, 20, h);
    for (let y = 0; y < h; y += 40) ctx.fillRect(0, y, w, 20);

    const cx = w / 2 + this.slide * w;
    const cy = h * 0.52;
    const r = Math.min(w * 0.36, h * 0.24);
    ctx.fillStyle = 'rgba(30,25,50,0.2)';
    ellipse(ctx, cx + 6, cy + 10, r * 1.05, r * 0.92);
    ctx.fill();
    ellipse(ctx, cx, cy, r, r * 0.88);
    fillInk(ctx, '#ffffff', 3);
    ellipse(ctx, cx, cy, r * 0.72, r * 0.62);
    ctx.strokeStyle = '#d9d4df';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (this.dish < 3) {
      ctx.save();
      ctx.translate(cx, cy);
      this.food(ctx, this.dish, 1 - this.bites / BITES, r);
      ctx.restore();
    }
    for (const c of this.crumbs) {
      ctx.fillStyle = c.c;
      circle(ctx, w / 2 + c.x, cy + c.y, 5);
      ctx.fill();
    }
    // forchettata
    if (this.fork > 0) {
      ctx.save();
      ctx.translate(w / 2 + 40, cy - 20 - this.fork * 200);
      ctx.rotate(-0.5);
      rr(ctx, -5, 0, 10, 90, 4);
      fillInk(ctx, '#c7ccd6', 2);
      for (let i = -1; i <= 1; i++) {
        rr(ctx, i * 7 - 2, -26, 4, 28, 2);
        fillInk(ctx, '#c7ccd6', 1.5);
      }
      ctx.restore();
    }
    // nome del piatto e contatore
    if (this.dish < 3) label(ctx, this.tx.dishes[this.dish], w / 2, cy + r + 40, 22);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < this.dish ? '#3fae5a' : '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 1) * 34, 30, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    nonnaAt(ctx, this.env.look, 62, h * 0.3, 110, this.result === 'win' ? 'happy' : 'idle', this.t);
    if (this.sayT > 0) bubble(ctx, this.say, 150, h * 0.3 - 110, w - 30, INK, 16);
    label(ctx, this.tx.tap, w / 2, h - 30, 18, '#2d2a3e', 700);
  }
}
