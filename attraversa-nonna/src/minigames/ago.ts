import { INK, rr } from '../render/paint';
import { bubble, label, nonnaAt, pick } from './common';
import type { Ctx, MiniEnv, MiniGame } from './common';

export interface AgoTexts {
  intro: string;
  miss: string[];
  hit: string[];
  tap: string;
}

/**
 * Alla merceria: la nonna non ci vede più e il filo le trema in mano.
 * Si tocca quando la punta del filo è davanti alla cruna. Tre volte.
 */
export class Ago implements MiniGame {
  readonly limit = 15;
  result: 'running' | 'win' | 'fail' = 'running';
  private hits = 0;
  private misses = 0;
  private phase = Math.random() * 6;
  private t = 0;
  /** animazione del filo che passa (successo) o si piega (errore) */
  private shot = 0;
  private shotOk = false;
  private say = '';
  private sayT = 0;
  private cool = 0;

  constructor(
    private readonly env: MiniEnv,
    private readonly tx: AgoTexts,
  ) {
    this.say = tx.intro;
    this.sayT = 1.6;
  }

  private get speed() {
    return 2.6 + this.hits * 0.9;
  }

  private get eye() {
    // la cruna si fa più piccola a ogni giro
    return 34 - this.hits * 7;
  }

  /** Scostamento verticale della punta del filo rispetto alla cruna, in punti. */
  private offset(amp: number) {
    return Math.sin(this.phase) * amp + Math.sin(this.phase * 2.7) * amp * 0.25;
  }

  update(dt: number) {
    this.t += dt;
    this.sayT = Math.max(0, this.sayT - dt);
    this.cool = Math.max(0, this.cool - dt);
    if (this.shot > 0) {
      this.shot -= dt;
      if (this.shot <= 0 && this.shotOk && this.hits >= 3) this.result = 'win';
    } else this.phase += dt * this.speed;
  }

  private amp = 70;

  down() {
    if (this.shot > 0 || this.cool > 0 || this.result !== 'running') return;
    const off = this.offset(this.amp);
    this.shotOk = Math.abs(off) < this.eye / 2 - 3;
    this.shot = 0.45;
    if (this.shotOk) {
      this.hits++;
      this.env.sfx('thread');
      this.env.haptic('medium');
      this.say = pick(this.tx.hit);
    } else {
      this.misses++;
      this.cool = 0.5;
      this.env.sfx('bad');
      this.env.haptic('heavy');
      this.say = off < 0 ? this.tx.miss[0] : this.tx.miss[1];
      if (this.misses >= 3) this.say = this.tx.miss[2];
      if (this.misses >= 4) this.result = 'fail';
    }
    this.sayT = 1;
  }

  up() {}

  draw(ctx: Ctx, w: number, h: number) {
    // stoffa a quadretti della merceria
    ctx.fillStyle = '#f7ead6';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(217,119,74,0.18)';
    ctx.lineWidth = 8;
    for (let x = 0; x < w; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // l'ago, grande
    const nx = w * 0.64;
    const eyeY = h * 0.34;
    const top = eyeY - 60;
    const bottom = h * 0.78;
    ctx.fillStyle = '#c7ccd6';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nx - 12, top + 12);
    ctx.quadraticCurveTo(nx, top - 8, nx + 12, top + 12);
    ctx.lineTo(nx + 7, bottom - 40);
    ctx.lineTo(nx, bottom);
    ctx.lineTo(nx - 7, bottom - 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(nx - 6, top + 14, 3, bottom - top - 70);
    // la cruna
    const eh = this.eye;
    ctx.fillStyle = '#f7ead6';
    rr(ctx, nx - 4, eyeY - eh / 2, 8, eh, 4);
    ctx.fill();
    ctx.stroke();

    // il filo rosso che trema
    const amp = (this.amp = Math.min(80, h * 0.12));
    const off = this.offset(amp);
    const tipY = eyeY + off;
    let tipX = nx - 38;
    if (this.shot > 0) {
      const k = 1 - this.shot / 0.45;
      if (this.shotOk) tipX += k * 90;
      else tipX += Math.sin(k * Math.PI) * 26;
    }
    ctx.strokeStyle = '#d63a3a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, h * 0.62);
    ctx.bezierCurveTo(w * 0.2, h * 0.7, w * 0.3, tipY + 40, tipX, tipY);
    ctx.stroke();
    if (this.shot > 0 && !this.shotOk) {
      // il filo si piega contro l'ago
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + 8, tipY + (off < 0 ? -10 : 10));
      ctx.stroke();
    }
    // mira: una fascia chiara all'altezza della cruna
    ctx.fillStyle = 'rgba(63,174,90,0.16)';
    ctx.fillRect(nx - 60, eyeY - eh / 2, 56, eh);

    // punteggio: tre fili da infilare
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < this.hits ? '#3fae5a' : '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 1) * 34, 30, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    nonnaAt(ctx, this.env.look, w * 0.2, h * 0.9, 150, this.result === 'win' ? 'happy' : this.cool > 0 ? 'angry' : 'idle', this.t);
    if (this.sayT > 0) bubble(ctx, this.say, w * 0.3, h * 0.9 - 160, w - 30, this.cool > 0 ? '#c0392b' : INK, 16);
    label(ctx, this.tx.tap, w / 2, h - 24, 17, '#7d7690', 600);
  }
}
