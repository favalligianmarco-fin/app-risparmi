import type { PickupKind, PropKind } from '../world';
import { drawSlipper } from './characters';
import { INK, circle, ctx2d, ellipse, fillInk, makeCanvas, rr } from './paint';
import type { Ctx } from './paint';
import type { Sprite } from './vehicles';

/** Arredo urbano, oggetti da raccogliere e piccioni. Coordinate in celle, (0,0) = centro cella. */

function groundShadow(ctx: Ctx, w: number, y = 0.26) {
  ctx.fillStyle = 'rgba(30,25,50,0.2)';
  ellipse(ctx, 0, y, w, w * 0.3);
  ctx.fill();
}

function paintProp(ctx: Ctx, kind: PropKind) {
  switch (kind) {
    case 'bench': {
      groundShadow(ctx, 0.46);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-0.34, 0.25);
      ctx.lineTo(-0.34, -0.02);
      ctx.moveTo(0.34, 0.25);
      ctx.lineTo(0.34, -0.02);
      ctx.stroke();
      rr(ctx, -0.44, -0.08, 0.88, 0.14, 0.04);
      fillInk(ctx, '#4f9a5a');
      rr(ctx, -0.44, -0.36, 0.88, 0.12, 0.04);
      fillInk(ctx, '#5fb06a');
      rr(ctx, -0.44, -0.22, 0.88, 0.12, 0.04);
      fillInk(ctx, '#5fb06a');
      return;
    }
    case 'pot': {
      groundShadow(ctx, 0.3);
      ctx.beginPath();
      ctx.moveTo(-0.24, -0.12);
      ctx.lineTo(0.24, -0.12);
      ctx.lineTo(0.18, 0.24);
      ctx.lineTo(-0.18, 0.24);
      ctx.closePath();
      fillInk(ctx, '#d9774a');
      rr(ctx, -0.27, -0.18, 0.54, 0.1, 0.04);
      fillInk(ctx, '#e58a5c');
      for (const [x, y, c] of [
        [-0.14, -0.3, '#e84a4a'],
        [0.02, -0.4, '#f28bb6'],
        [0.15, -0.28, '#e84a4a'],
        [-0.02, -0.24, '#f7c948'],
      ] as const) {
        circle(ctx, x, y + 0.04, 0.1);
        fillInk(ctx, '#5fb06a', 0.025);
        circle(ctx, x, y, 0.06);
        fillInk(ctx, c, 0.022);
      }
      return;
    }
    case 'bollard': {
      groundShadow(ctx, 0.18);
      rr(ctx, -0.09, -0.34, 0.18, 0.58, 0.08);
      fillInk(ctx, '#7d8494');
      ctx.fillStyle = '#f5f0e6';
      ctx.fillRect(-0.09, -0.22, 0.18, 0.06);
      circle(ctx, 0, -0.34, 0.09);
      fillInk(ctx, '#9aa1b0');
      return;
    }
    case 'bin': {
      groundShadow(ctx, 0.24);
      rr(ctx, -0.18, -0.26, 0.36, 0.5, 0.06);
      fillInk(ctx, '#3f8f4f');
      ctx.strokeStyle = '#2f6b3a';
      ctx.lineWidth = 0.025;
      for (const x of [-0.08, 0, 0.08]) {
        ctx.beginPath();
        ctx.moveTo(x, -0.18);
        ctx.lineTo(x, 0.18);
        ctx.stroke();
      }
      rr(ctx, -0.21, -0.33, 0.42, 0.1, 0.04);
      fillInk(ctx, '#4f9a5a');
      return;
    }
    case 'tree': {
      groundShadow(ctx, 0.42, 0.24);
      rr(ctx, -0.3, 0.08, 0.6, 0.24, 0.05);
      fillInk(ctx, '#9b7a5a');
      rr(ctx, -0.06, -0.4, 0.12, 0.56, 0.04);
      fillInk(ctx, '#8a5a3c');
      for (const [x, y, r] of [
        [0, -0.72, 0.3],
        [-0.22, -0.56, 0.22],
        [0.22, -0.56, 0.22],
        [0, -0.48, 0.24],
      ] as const) {
        circle(ctx, x, y, r);
        fillInk(ctx, '#5fb06a');
      }
      ctx.fillStyle = '#7bc47f';
      circle(ctx, -0.08, -0.8, 0.1);
      ctx.fill();
      circle(ctx, 0.14, -0.62, 0.07);
      ctx.fill();
      ctx.fillStyle = '#e84a4a';
      for (const [x, y] of [
        [-0.16, -0.6],
        [0.1, -0.78],
        [0.2, -0.5],
      ]) {
        circle(ctx, x, y, 0.035);
        ctx.fill();
      }
      return;
    }
    case 'hydrant': {
      groundShadow(ctx, 0.2);
      rr(ctx, -0.12, -0.28, 0.24, 0.52, 0.08);
      fillInk(ctx, '#e0443c');
      rr(ctx, -0.2, -0.12, 0.4, 0.1, 0.04);
      fillInk(ctx, '#c7372f');
      circle(ctx, 0, -0.3, 0.1);
      fillInk(ctx, '#e0443c');
      return;
    }
    case 'fountain': {
      // il "nasone": fontanella in ghisa
      groundShadow(ctx, 0.3);
      ellipse(ctx, 0, 0.2, 0.28, 0.08);
      fillInk(ctx, '#7c8699');
      rr(ctx, -0.13, -0.5, 0.26, 0.72, 0.1);
      fillInk(ctx, '#3a5a48');
      rr(ctx, 0.1, -0.34, 0.16, 0.07, 0.03);
      fillInk(ctx, '#3a5a48', 0.022);
      ctx.strokeStyle = '#8fd3f4';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(0.25, -0.31);
      ctx.quadraticCurveTo(0.3, -0.1, 0.26, 0.16);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-0.08, -0.44, 0.05, 0.56);
      return;
    }
  }
}

export function paintPickup(ctx: Ctx, kind: PickupKind) {
  if (kind === 'candy') {
    // caramella incartata
    ctx.beginPath();
    ctx.moveTo(-0.14, 0);
    ctx.lineTo(-0.3, -0.1);
    ctx.lineTo(-0.28, 0.1);
    ctx.closePath();
    fillInk(ctx, '#f28bb6', 0.025);
    ctx.beginPath();
    ctx.moveTo(0.14, 0);
    ctx.lineTo(0.3, -0.1);
    ctx.lineTo(0.28, 0.1);
    ctx.closePath();
    fillInk(ctx, '#f28bb6', 0.025);
    ellipse(ctx, 0, 0, 0.17, 0.13);
    fillInk(ctx, '#e84a8a');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-0.08, -0.1);
    ctx.lineTo(-0.02, 0.11);
    ctx.moveTo(0.04, -0.12);
    ctx.lineTo(0.1, 0.09);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ellipse(ctx, -0.06, -0.06, 0.04, 0.02, -0.4);
    ctx.fill();
  } else if (kind === 'coffee') {
    // tazzina di espresso col piattino
    ellipse(ctx, 0, 0.12, 0.26, 0.07);
    fillInk(ctx, '#ffffff');
    ctx.beginPath();
    ctx.moveTo(-0.16, -0.12);
    ctx.lineTo(0.16, -0.12);
    ctx.quadraticCurveTo(0.15, 0.12, 0, 0.12);
    ctx.quadraticCurveTo(-0.15, 0.12, -0.16, -0.12);
    ctx.closePath();
    fillInk(ctx, '#ffffff');
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.arc(0.18, -0.03, 0.06, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ellipse(ctx, 0, -0.12, 0.16, 0.045);
    fillInk(ctx, '#6b3f25', 0.025);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(-0.05, -0.2);
    ctx.quadraticCurveTo(-0.1, -0.3, -0.04, -0.38);
    ctx.moveTo(0.05, -0.2);
    ctx.quadraticCurveTo(0, -0.3, 0.06, -0.4);
    ctx.stroke();
  } else if (kind === 'slipper') {
    // ciabatta di scorta
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    circle(ctx, 0, -0.1, 0.24);
    ctx.fill();
    drawSlipper(ctx, 0.02, 0.06, -0.5, 1.15);
  } else {
    // un cuore in più
    ctx.beginPath();
    ctx.moveTo(0, 0.14);
    ctx.bezierCurveTo(-0.3, -0.06, -0.2, -0.3, 0, -0.16);
    ctx.bezierCurveTo(0.2, -0.3, 0.3, -0.06, 0, 0.14);
    ctx.closePath();
    fillInk(ctx, '#e84a4a');
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ellipse(ctx, -0.09, -0.12, 0.05, 0.03, -0.5);
    ctx.fill();
  }
}

/** Piccione: becchetta per terra oppure vola via. */
export function drawPigeon(ctx: Ctx, t: number, flying: boolean) {
  ctx.lineJoin = 'round';
  if (!flying) {
    ctx.fillStyle = 'rgba(30,25,50,0.18)';
    ellipse(ctx, 0, 0.1, 0.13, 0.04);
    ctx.fill();
  }
  const peck = flying ? 0 : Math.max(0, Math.sin(t * 5)) ** 8 * 0.06;
  // coda e corpo
  ctx.beginPath();
  ctx.moveTo(-0.08, -0.02);
  ctx.lineTo(-0.2, 0.02);
  ctx.lineTo(-0.18, -0.06);
  ctx.closePath();
  fillInk(ctx, '#6f778a', 0.02);
  ellipse(ctx, 0, -0.05, 0.12, 0.08);
  fillInk(ctx, '#a5adbf', 0.022);
  if (flying) {
    const flap = Math.sin(t * 30);
    ctx.beginPath();
    ctx.moveTo(-0.04, -0.08);
    ctx.lineTo(-0.02 - 0.08, -0.08 - 0.16 * flap);
    ctx.lineTo(0.06, -0.08);
    ctx.closePath();
    fillInk(ctx, '#8b93a6', 0.02);
  } else {
    ellipse(ctx, -0.02, -0.06, 0.08, 0.045, 0.2);
    fillInk(ctx, '#8b93a6', 0.018);
  }
  // collo iridescente e testa
  circle(ctx, 0.1, -0.12 + peck, 0.055);
  fillInk(ctx, '#7c8699', 0.02);
  ctx.fillStyle = '#6fbf9a';
  circle(ctx, 0.075, -0.08 + peck * 0.5, 0.03);
  ctx.fill();
  ctx.fillStyle = INK;
  circle(ctx, 0.115, -0.13 + peck, 0.012);
  ctx.fill();
  ctx.fillStyle = '#f2a65a';
  ctx.beginPath();
  ctx.moveTo(0.15, -0.12 + peck);
  ctx.lineTo(0.19, -0.105 + peck);
  ctx.lineTo(0.15, -0.095 + peck);
  ctx.closePath();
  ctx.fill();
  if (!flying) {
    ctx.strokeStyle = '#e08a5a';
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(-0.02, 0.02);
    ctx.lineTo(-0.02, 0.08);
    ctx.moveTo(0.03, 0.02);
    ctx.lineTo(0.03, 0.08);
    ctx.stroke();
  }
}

export class StaticSprites {
  private cache = new Map<string, Sprite>();

  constructor(private readonly scale: number) {}

  private build(key: string, paint: (ctx: Ctx) => void): Sprite {
    let sp = this.cache.get(key);
    if (sp) return sp;
    const s = this.scale;
    const canvas = makeCanvas(1.2 * s, 1.8 * s);
    const ctx = ctx2d(canvas);
    const ox = canvas.width / 2;
    const oy = 1.2 * s;
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    paint(ctx);
    sp = { canvas, ox, oy };
    this.cache.set(key, sp);
    return sp;
  }

  prop(kind: PropKind): Sprite {
    return this.build(`prop:${kind}`, (ctx) => paintProp(ctx, kind));
  }

  pickup(kind: PickupKind): Sprite {
    return this.build(`pickup:${kind}`, (ctx) => paintPickup(ctx, kind));
  }
}
