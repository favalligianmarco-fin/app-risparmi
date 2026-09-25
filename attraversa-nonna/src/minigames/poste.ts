import { INK, circle, fillInk, rr } from '../render/paint';
import { bubble, button, label, nonnaAt, pick } from './common';
import type { Ctx, MiniEnv, MiniGame } from './common';

export interface PosteTexts {
  hold: string;
  counter: string;
  caught: string[];
  done: string;
}

interface Person {
  /** posizione nella fila, 0..1 (1 = sportello) */
  x: number;
  body: string;
  hat: string | null;
  state: 'calm' | 'warn' | 'look';
  t: number;
}

const BODIES = ['#5aa9f0', '#9f86e0', '#3f8f4f', '#e8763f', '#8d8a99', '#c0392b'];

/**
 * Alla posta per la pensione: si avanza tenendo premuto, ma se qualcuno si gira
 * mentre la nonna sgattaiola avanti, la rimandano indietro.
 */
export class Poste implements MiniGame {
  readonly limit = 16;
  result: 'running' | 'win' | 'fail' = 'running';
  private nonnaX = 0.02;
  private holding = false;
  private moving = false;
  private stun = 0;
  private walk = 0;
  private people: Person[] = [];
  private nextWatch = 1.2;
  private say = '';
  private sayX = 0;
  private sayT = 0;
  private t = 0;
  private btn = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private readonly env: MiniEnv,
    private readonly tx: PosteTexts,
  ) {
    const xs = [0.18, 0.33, 0.48, 0.63, 0.78];
    this.people = xs.map((x, i) => ({
      x,
      body: BODIES[i % BODIES.length],
      hat: i % 2 ? pick(['#2d2a3e', '#8a5a3c', '#e84a4a']) : null,
      state: 'calm',
      t: 0,
    }));
  }

  update(dt: number) {
    this.t += dt;
    this.sayT = Math.max(0, this.sayT - dt);
    if (this.stun > 0) this.stun -= dt;
    // qualcuno, ogni tanto, si gira
    this.nextWatch -= dt;
    if (this.nextWatch <= 0) {
      const ahead = this.people.filter((p) => p.x > this.nonnaX && p.state === 'calm');
      if (ahead.length) {
        const p = pick(ahead);
        p.state = 'warn';
        p.t = 0.55;
      }
      this.nextWatch = 1.0 + Math.random() * 1.1;
    }
    for (const p of this.people) {
      if (p.state === 'calm') continue;
      p.t -= dt;
      if (p.t <= 0) {
        if (p.state === 'warn') {
          p.state = 'look';
          p.t = 0.85 + Math.random() * 0.45;
        } else p.state = 'calm';
      }
    }
    this.moving = this.holding && this.stun <= 0;
    if (this.moving) {
      this.nonnaX += dt * 0.105;
      this.walk += dt;
      const watcher = this.people.find((p) => p.state === 'look' && p.x > this.nonnaX - 0.02);
      if (watcher) {
        // beccata! si torna dietro a chi l'ha vista
        this.stun = 0.9;
        this.nonnaX = Math.max(0.02, Math.min(this.nonnaX, watcher.x) - 0.13);
        this.say = pick(this.tx.caught);
        this.sayX = watcher.x;
        this.sayT = 1.2;
        this.env.sfx('caught');
        this.env.haptic('heavy');
      }
    }
    if (this.nonnaX >= 0.88) {
      this.nonnaX = 0.88;
      this.result = 'win';
    }
  }

  down() {
    // si può tenere premuto in qualsiasi punto: il bottone è solo un promemoria
    this.holding = true;
  }

  up() {
    this.holding = false;
  }

  draw(ctx: Ctx, w: number, h: number) {
    // l'ufficio: pavimento a scacchi e muro color pastello
    const floorY = h * 0.62;
    ctx.fillStyle = '#f5dd9d';
    ctx.fillRect(0, 0, w, floorY);
    ctx.fillStyle = '#e8cf8a';
    ctx.fillRect(0, floorY - 40, w, 40);
    for (let y = floorY; y < h; y += 28) {
      for (let x = ((y - floorY) / 28) % 2 ? 28 : 0; x < w; x += 56) {
        ctx.fillStyle = '#d9d4df';
        ctx.fillRect(x, y, 28, 28);
      }
    }
    ctx.fillStyle = '#ece8f0';
    for (let y = floorY; y < h; y += 28) for (let x = ((y - floorY) / 28) % 2 ? 0 : 28; x < w; x += 56) ctx.fillRect(x, y, 28, 28);

    // sportello, contro il bordo destro
    const cx = w - 62;
    rr(ctx, cx, floorY - 150, 70, 150, 6);
    fillInk(ctx, '#f7c948', 3);
    rr(ctx, cx + 8, floorY - 140, 60, 70, 6);
    fillInk(ctx, '#bfe6ff', 2.5);
    circle(ctx, cx + 36, floorY - 102, 16);
    fillInk(ctx, '#f6d2b8', 2.5);
    ctx.fillStyle = INK;
    circle(ctx, cx + 30, floorY - 104, 2.5);
    ctx.fill();
    rr(ctx, w - 108, floorY - 182, 100, 26, 8);
    fillInk(ctx, '#2d3e8c', 2.5);
    label(ctx, this.tx.counter, w - 58, floorY - 169, 12, '#ffffff');

    // la fila: dalla nonna (a sinistra) fino allo sportello
    const x0 = 44;
    const unit = (cx - 10 - x0) / 0.9;
    const px = (v: number) => x0 + v * unit;
    for (const p of this.people) {
      const x = px(p.x);
      const top = floorY - 120;
      rr(ctx, x - 20, top + 30, 40, 80, 14);
      fillInk(ctx, p.body, 3);
      ctx.fillStyle = '#4a3b3b';
      ctx.fillRect(x - 14, top + 106, 10, 14);
      ctx.fillRect(x + 4, top + 106, 10, 14);
      circle(ctx, x, top + 16, 18);
      fillInk(ctx, '#f6d2b8', 3);
      if (p.hat) {
        ctx.beginPath();
        ctx.arc(x, top + 10, 18, Math.PI, 0);
        ctx.closePath();
        fillInk(ctx, p.hat, 3);
      }
      if (p.state === 'calm') {
        // di spalle: si vedono solo i capelli
        ctx.fillStyle = '#6b4f3a';
        ctx.beginPath();
        ctx.arc(x, top + 18, 15, Math.PI * 0.1, Math.PI * 0.9);
        ctx.fill();
      } else {
        // si gira a guardare
        ctx.fillStyle = INK;
        circle(ctx, x - 8, top + 16, p.state === 'look' ? 4 : 2.5);
        ctx.fill();
        circle(ctx, x + 4, top + 16, p.state === 'look' ? 4 : 2.5);
        ctx.fill();
        label(ctx, p.state === 'look' ? '!' : '?', x, top - 22, 28, p.state === 'look' ? '#e84a4a' : '#f28c28');
      }
    }

    // la nonna, davanti a tutti
    const nx = px(this.nonnaX);
    const step = this.moving ? Math.sin(this.walk * 14) : 0;
    const crouch = this.moving ? 6 : 0;
    nonnaAt(ctx, this.env.look, nx, floorY + 6 + crouch, Math.min(150, h * 0.24), this.stun > 0 ? 'angry' : this.nonnaX >= 0.88 ? 'happy' : 'walk', this.t, step);
    if (this.sayT > 0) bubble(ctx, this.say, px(this.sayX), floorY - 150, w - 30, '#c0392b', 16);
    if (this.result === 'win') bubble(ctx, this.tx.done, nx, floorY - 150, w - 30, '#2e8a45');

    // barra di avanzamento e bottone da tenere premuto
    const barY = floorY + 22;
    rr(ctx, 20, barY, w - 40, 12, 6);
    fillInk(ctx, '#ffffff', 2);
    rr(ctx, 20, barY, (w - 40) * Math.min(1, this.nonnaX / 0.88), 12, 6);
    fillInk(ctx, '#3fae5a', 2);

    const bw = Math.min(w - 40, 340);
    const bh = 76;
    this.btn = { x: (w - bw) / 2, y: h - bh - 20, w: bw, h: bh };
    button(ctx, this.btn.x, this.btn.y, bw, bh, this.holding ? '#f7c948' : '#fff8ef', this.holding);
    label(ctx, this.tx.hold, w / 2, this.btn.y + bh / 2 + (this.holding ? 3 : 0), 21);
  }
}
