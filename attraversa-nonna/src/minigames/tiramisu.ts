import { paintPickup } from '../render/props';
import { INK, circle, ellipse, fillInk, rr } from '../render/paint';
import { bubble, button, label, nonnaAt } from './common';
import type { Ctx, MiniEnv, MiniGame } from './common';

type Item = 'savoiardi' | 'caffe' | 'crema' | 'cacao';
const RECIPE: Item[] = ['savoiardi', 'caffe', 'crema', 'savoiardi', 'caffe', 'crema', 'cacao'];

export interface TiramisuTexts {
  items: Record<Item, string>;
  wrong: (item: string) => string;
  cheer: string[];
}

function icon(ctx: Ctx, item: Item, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  switch (item) {
    case 'savoiardi':
      for (const [dx, dy, a] of [
        [-0.08, 0.06, -0.3],
        [0.08, -0.04, -0.3],
      ] as const) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(a);
        rr(ctx, -0.32, -0.09, 0.64, 0.18, 0.09);
        fillInk(ctx, '#f0cf8e', 0.035);
        ctx.fillStyle = '#ffffff';
        for (let i = -2; i <= 2; i++) {
          circle(ctx, i * 0.1, -0.02 + (i % 2) * 0.04, 0.014);
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    case 'caffe':
      ctx.scale(0.95, 0.95);
      ctx.lineWidth = 0.03;
      paintPickup(ctx, 'coffee');
      break;
    case 'crema':
      ellipse(ctx, 0, 0.12, 0.34, 0.12);
      fillInk(ctx, '#9fd3f0', 0.035);
      ctx.beginPath();
      ctx.moveTo(-0.34, 0.1);
      ctx.quadraticCurveTo(-0.3, 0.3, 0, 0.3);
      ctx.quadraticCurveTo(0.3, 0.3, 0.34, 0.1);
      ctx.closePath();
      fillInk(ctx, '#7fbfe6', 0.035);
      ctx.beginPath();
      ctx.moveTo(-0.26, 0.08);
      ctx.quadraticCurveTo(-0.2, -0.12, 0, -0.1);
      ctx.quadraticCurveTo(0.08, -0.24, 0.12, -0.06);
      ctx.quadraticCurveTo(0.26, -0.06, 0.26, 0.08);
      ctx.closePath();
      fillInk(ctx, '#fffaf0', 0.035);
      break;
    case 'cacao':
      rr(ctx, -0.2, -0.26, 0.4, 0.52, 0.05);
      fillInk(ctx, '#8a5a3c', 0.035);
      rr(ctx, -0.22, -0.3, 0.44, 0.1, 0.03);
      fillInk(ctx, '#6b3f25', 0.03);
      ctx.fillStyle = '#f7c948';
      rr(ctx, -0.14, -0.08, 0.28, 0.16, 0.03);
      ctx.fill();
      ctx.fillStyle = '#6b3f25';
      for (let i = 0; i < 3; i++) {
        circle(ctx, -0.07 + i * 0.07, 0, 0.022);
        ctx.fill();
      }
      break;
  }
  ctx.restore();
}

/** Casa della nonna: si prepara il tiramisù toccando gli ingredienti nell'ordine giusto. */
export class Tiramisu implements MiniGame {
  readonly limit = 14;
  result: 'running' | 'win' | 'fail' = 'running';
  private step = 0;
  private slots: Item[] = ['savoiardi', 'caffe', 'crema', 'cacao'];
  private lock = 0;
  private shakeSlot = -1;
  private shakeT = 0;
  private pop = 0;
  private say = '';
  private sayT = 0;
  private t = 0;
  private rects: { x: number; y: number; w: number; h: number }[] = [];
  private pressed = -1;

  constructor(
    private readonly env: MiniEnv,
    private readonly tx: TiramisuTexts,
  ) {
    this.shuffle();
  }

  private shuffle() {
    for (let i = this.slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.slots[i], this.slots[j]] = [this.slots[j], this.slots[i]];
    }
  }

  update(dt: number) {
    this.t += dt;
    this.lock = Math.max(0, this.lock - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.pop = Math.max(0, this.pop - dt);
    this.sayT = Math.max(0, this.sayT - dt);
  }

  down(x: number, y: number) {
    const i = this.rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (i < 0 || this.result !== 'running') return;
    this.pressed = i;
    if (this.lock > 0) return;
    const want = RECIPE[this.step];
    if (this.slots[i] === want) {
      this.step++;
      this.pop = 0.25;
      this.env.sfx('good');
      this.env.haptic('light');
      if (this.step >= RECIPE.length) {
        this.result = 'win';
        return;
      }
      if (this.step % 2 === 0) {
        this.say = this.tx.cheer[Math.floor(Math.random() * this.tx.cheer.length)];
        this.sayT = 1.1;
      }
      this.shuffle();
    } else {
      this.lock = 0.8;
      this.shakeSlot = i;
      this.shakeT = 0.35;
      this.say = this.tx.wrong(this.tx.items[want]);
      this.sayT = 1.3;
      this.env.sfx('bad');
      this.env.haptic('heavy');
    }
  }

  up() {
    this.pressed = -1;
  }

  draw(ctx: Ctx, w: number, h: number) {
    // piano della cucina
    ctx.fillStyle = '#fbeede';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2dcc2';
    for (let y = 0; y < h * 0.55; y += 34) for (let x = (y / 34) % 2 ? 17 : 0; x < w; x += 34) ctx.fillRect(x, y, 30, 30);

    // la ricetta, con il passo corrente
    const n = RECIPE.length;
    const cw = Math.min(46, (w - 24) / n);
    const rx = (w - cw * n) / 2;
    RECIPE.forEach((it, i) => {
      const cx = rx + cw * i + cw / 2;
      const done = i < this.step;
      const cur = i === this.step;
      ctx.fillStyle = cur ? '#f7c948' : done ? '#d8f0c9' : '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      rr(ctx, cx - cw / 2 + 2, 10, cw - 4, cw - 4, 10);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = done ? 0.5 : 1;
      icon(ctx, it, cx, 10 + (cw - 4) / 2, cw * 0.7);
      ctx.globalAlpha = 1;
    });

    // la pirofila con gli strati
    const dw = Math.min(w - 40, 330);
    const dh = Math.min(170, h * 0.26);
    const dx = (w - dw) / 2;
    const dy = cw + 34;
    const layerH = dh / 5.2;
    let yb = dy + dh - 8;
    const scale = 1 + this.pop * 0.12;
    ctx.save();
    ctx.translate(w / 2, dy + dh / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -(dy + dh / 2));
    ctx.fillStyle = 'rgba(191,230,255,0.45)';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    rr(ctx, dx, dy, dw, dh, 16);
    ctx.fill();
    for (let i = 0; i < this.step; i++) {
      const it = RECIPE[i];
      if (it === 'savoiardi') {
        const soaked = RECIPE[i + 1] === 'caffe' && i + 1 < this.step;
        const cnt = 7;
        for (let k = 0; k < cnt; k++) {
          const bw = (dw - 24) / cnt;
          rr(ctx, dx + 12 + k * bw + 1, yb - layerH, bw - 2, layerH - 2, 6);
          fillInk(ctx, soaked ? '#b07a45' : '#f0cf8e', 1.5);
        }
        yb -= layerH;
      } else if (it === 'crema') {
        ctx.beginPath();
        ctx.moveTo(dx + 8, yb);
        for (let x = dx + 8; x <= dx + dw - 8; x += 12) ctx.quadraticCurveTo(x + 6, yb - layerH - 6, x + 12, yb - layerH + 2);
        ctx.lineTo(dx + dw - 8, yb);
        ctx.closePath();
        fillInk(ctx, '#fffaf0', 1.5);
        yb -= layerH;
      } else if (it === 'cacao') {
        ctx.fillStyle = '#6b3f25';
        for (let k = 0; k < 90; k++) {
          const px = dx + 12 + ((k * 37) % (dw - 24));
          const py = yb + 2 - ((k * 13) % 8);
          ctx.fillRect(px, py, 3, 3);
        }
      }
    }
    rr(ctx, dx, dy, dw, dh, 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(dx + 14, dy + 10, 10, dh - 20);
    ctx.restore();

    // i quattro ingredienti, rimescolati dopo ogni risposta giusta
    const gap = 12;
    const bw = (w - 32 - gap) / 2;
    const bh = Math.min(92, (h - (dy + dh + 150)) / 2 - gap);
    const by = h - 2 * bh - gap - 18;

    // la nonna che controlla, tra la pirofila e gli ingredienti
    const ny = Math.min(by - 14, dy + dh + 140);
    const nsize = Math.min(120, ny - dy - dh - 10);
    nonnaAt(ctx, this.env.look, 70, ny, nsize, this.lock > 0 ? 'angry' : this.pop > 0 ? 'happy' : 'idle', this.t);
    if (this.sayT > 0) bubble(ctx, this.say, Math.min(w - 110, 190), ny - nsize * 0.55, w - 150, this.lock > 0 ? '#c0392b' : '#2e8a45');

    this.rects = [];
    this.slots.forEach((it, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      let x = 16 + col * (bw + gap);
      const y = by + row * (bh + gap);
      if (i === this.shakeSlot && this.shakeT > 0) x += Math.sin(this.shakeT * 60) * 6;
      this.rects.push({ x, y, w: bw, h: bh });
      const pressed = this.pressed === i;
      button(ctx, x, y, bw, bh, this.lock > 0 && i === this.shakeSlot ? '#f6c1c1' : '#fff8ef', pressed);
      const dy2 = pressed ? 3 : 0;
      icon(ctx, it, x + bh * 0.5, y + bh / 2 + dy2, bh * 0.62);
      label(ctx, this.tx.items[it], x + bh * 0.5 + (bw - bh * 0.5) / 2 + 4, y + bh / 2 + dy2, Math.min(20, bw / 7));
    });
  }
}
