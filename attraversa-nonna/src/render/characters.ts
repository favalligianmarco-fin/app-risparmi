import type { Look } from '../nonne';
import { INK, circle, ellipse, fillInk, rr } from './paint';
import type { Ctx } from './paint';

/**
 * La nonna e il piccolo scout che la accompagna per mano.
 * Coordinate in celle, piedi in (0, 0), l'alto è verso y negativi.
 */

const SKIN = '#f6d2b8';
const SKIN_DARK = '#e7b594';
const STOCKING = '#ead0b4';
const GOLD = '#f2c14e';

export type Mood = 'idle' | 'walk' | 'angry' | 'slipper' | 'happy';

export interface PairPose {
  facing: 1 | -1;
  /** Sollevamento dei piedi durante il passo: -1..1 (il segno dice quale piede). */
  legs: number;
  mood: Mood;
  /** Tempo in secondi, per le animazioni cicliche. */
  t: number;
}

function limb(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, w = 0.065) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 0.034;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

function hand(ctx: Ctx, x: number, y: number, r = 0.036) {
  circle(ctx, x, y, r);
  fillInk(ctx, SKIN, 0.025);
}

/** La ciabatta della nonna: suola chiara, fascia blu. Centrata sul tallone, punta verso -y. */
export function drawSlipper(ctx: Ctx, x: number, y: number, angle: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, 0.02);
  ctx.bezierCurveTo(-0.07, 0.02, -0.08, -0.12, -0.06, -0.2);
  ctx.bezierCurveTo(-0.05, -0.27, 0.05, -0.27, 0.06, -0.2);
  ctx.bezierCurveTo(0.08, -0.12, 0.07, 0.02, 0, 0.02);
  ctx.closePath();
  fillInk(ctx, '#f2d7b0', 0.025);
  // fascia
  ctx.beginPath();
  ctx.moveTo(-0.072, -0.13);
  ctx.quadraticCurveTo(0, -0.17, 0.072, -0.13);
  ctx.lineTo(0.064, -0.22);
  ctx.quadraticCurveTo(0, -0.25, -0.064, -0.22);
  ctx.closePath();
  fillInk(ctx, '#3d8bd9', 0.022);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.012;
  ctx.setLineDash([0.018, 0.014]);
  ctx.beginPath();
  ctx.moveTo(-0.055, -0.16);
  ctx.quadraticCurveTo(0, -0.19, 0.055, -0.16);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function hasAcc(o: Look, a: Look['accessories'][number]) {
  return o.accessories.includes(a);
}

export function drawNonna(ctx: Ctx, o: Look, legs: number, mood: Mood, t: number, holding = true) {
  const liftL = Math.max(0, legs) * 0.06;
  const liftR = Math.max(0, -legs) * 0.06;
  // gambe e scarpe
  for (const [x, lift] of [
    [-0.06, liftL],
    [0.06, liftR],
  ] as const) {
    ctx.fillStyle = STOCKING;
    rr(ctx, x - 0.024, -0.21 - lift, 0.048, 0.2, 0.02);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.022;
    ctx.stroke();
    ellipse(ctx, x + 0.012, -0.022 - lift, 0.052, 0.03);
    fillInk(ctx, o.shoes, 0.025);
  }
  // gonna
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.48);
  ctx.lineTo(0.13, -0.48);
  ctx.lineTo(0.185, -0.18);
  ctx.quadraticCurveTo(0, -0.13, -0.185, -0.18);
  ctx.closePath();
  fillInk(ctx, o.dress);
  if (o.dots !== o.dress) {
    ctx.fillStyle = o.dots;
    for (const [dx, dy] of [
      [-0.08, -0.36],
      [0.06, -0.4],
      [0.1, -0.26],
      [-0.12, -0.23],
      [0, -0.24],
      [-0.03, -0.33],
    ]) {
      circle(ctx, dx, dy, 0.018);
      ctx.fill();
    }
  }
  if (hasAcc(o, 'apron')) {
    ctx.beginPath();
    ctx.moveTo(-0.1, -0.47);
    ctx.lineTo(0.1, -0.47);
    ctx.lineTo(0.12, -0.2);
    ctx.quadraticCurveTo(0, -0.17, -0.12, -0.2);
    ctx.closePath();
    fillInk(ctx, o.accent, 0.025);
    rr(ctx, -0.05, -0.34, 0.1, 0.07, 0.02);
    ctx.strokeStyle = 'rgba(45,42,62,0.45)';
    ctx.lineWidth = 0.015;
    ctx.stroke();
  }
  // busto / golfino
  rr(ctx, -0.145, -0.66, 0.29, 0.23, 0.1);
  fillInk(ctx, o.cardigan);
  ctx.fillStyle = '#fff8ef';
  ctx.beginPath();
  ctx.moveTo(-0.06, -0.655);
  ctx.lineTo(0, -0.6);
  ctx.lineTo(0.06, -0.655);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  circle(ctx, 0, -0.55, 0.012);
  ctx.fill();
  circle(ctx, 0, -0.49, 0.012);
  ctx.fill();
  if (hasAcc(o, 'shawl')) {
    ctx.beginPath();
    ctx.moveTo(-0.16, -0.64);
    ctx.quadraticCurveTo(0, -0.7, 0.16, -0.64);
    ctx.lineTo(0.13, -0.56);
    ctx.lineTo(0, -0.47);
    ctx.lineTo(-0.13, -0.56);
    ctx.closePath();
    fillInk(ctx, o.accent, 0.025);
    ctx.strokeStyle = o.accent;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      const fx = i * 0.018;
      const fy = -0.47 - Math.abs(i) * 0.03;
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy + 0.04);
    }
    ctx.stroke();
  }

  // braccio verso lo scout (a destra)
  if (holding) {
    limb(ctx, 0.12, -0.6, 0.22, -0.4, o.cardigan);
    hand(ctx, 0.23, -0.39);
  } else {
    limb(ctx, 0.12, -0.6, 0.16, -0.42, o.cardigan);
    hand(ctx, 0.165, -0.41);
  }

  // braccio libero (a sinistra): borsetta o ventaglio, ciabatta alzata, saluto
  if (mood === 'slipper') {
    // la ciabatta alzata di lato, ben in vista
    const sw = Math.sin(t * 18) * 0.22;
    limb(ctx, -0.12, -0.6, -0.26, -0.86, o.cardigan);
    drawSlipper(ctx, -0.27, -0.88, -0.75 + sw, 1.3);
    hand(ctx, -0.26, -0.87);
  } else if (mood === 'angry') {
    const sw = Math.sin(t * 28) * 0.45;
    limb(ctx, -0.12, -0.6, -0.25, -0.8, o.cardigan);
    drawSlipper(ctx, -0.26, -0.82, -0.9 + sw, 1.1);
    hand(ctx, -0.25, -0.81);
  } else if (mood === 'happy') {
    const wx = -0.24 + Math.sin(t * 14) * 0.05;
    limb(ctx, -0.12, -0.6, wx, -0.86, o.cardigan);
    hand(ctx, wx, -0.87);
  } else if (hasAcc(o, 'fan')) {
    limb(ctx, -0.12, -0.6, -0.2, -0.5, o.cardigan);
    const a = Math.sin(t * 6) * 0.25;
    ctx.save();
    ctx.translate(-0.21, -0.5);
    ctx.rotate(-0.6 + a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 0.15, -Math.PI * 0.95, -Math.PI * 0.05);
    ctx.closePath();
    fillInk(ctx, o.accent, 0.022);
    ctx.strokeStyle = 'rgba(45,42,62,0.5)';
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      const ang = -Math.PI * 0.95 + (i * Math.PI * 0.9) / 6;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * 0.15, Math.sin(ang) * 0.15);
    }
    ctx.stroke();
    ctx.restore();
    hand(ctx, -0.2, -0.5);
  } else {
    limb(ctx, -0.12, -0.6, -0.18, -0.42, o.cardigan);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.arc(-0.2, -0.4, 0.045, Math.PI, 0);
    ctx.stroke();
    rr(ctx, -0.27, -0.4, 0.14, 0.12, 0.035);
    fillInk(ctx, o.bag, 0.025);
    hand(ctx, -0.18, -0.42);
  }

  // collane
  if (hasAcc(o, 'pearls')) {
    ctx.fillStyle = '#ffffff';
    for (let i = -3; i <= 3; i++) {
      circle(ctx, i * 0.025, -0.645 + i * i * 0.002, 0.014);
      ctx.fill();
    }
  }
  if (hasAcc(o, 'corno') || hasAcc(o, 'peperoncino')) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-0.07, -0.655);
    ctx.quadraticCurveTo(0, -0.58, 0.07, -0.655);
    ctx.stroke();
    if (hasAcc(o, 'corno')) {
      ctx.beginPath();
      ctx.moveTo(-0.018, -0.6);
      ctx.quadraticCurveTo(-0.03, -0.54, 0.02, -0.51);
      ctx.quadraticCurveTo(0.002, -0.55, 0.018, -0.6);
      ctx.closePath();
      fillInk(ctx, '#e0443c', 0.012);
      ctx.fillStyle = GOLD;
      ctx.fillRect(-0.02, -0.61, 0.04, 0.015);
    } else {
      ctx.beginPath();
      ctx.moveTo(-0.02, -0.6);
      ctx.quadraticCurveTo(-0.02, -0.53, 0.012, -0.5);
      ctx.quadraticCurveTo(0.024, -0.55, 0.02, -0.6);
      ctx.closePath();
      fillInk(ctx, '#e0443c', 0.012);
      ctx.fillStyle = '#3f8f4f';
      ctx.fillRect(-0.016, -0.615, 0.032, 0.02);
    }
  }

  // testa
  const hy = -0.78;
  circle(ctx, 0, hy, 0.14);
  fillInk(ctx, SKIN);
  const covered = hasAcc(o, 'headscarf');
  const hat = hasAcc(o, 'straw-hat') || hasAcc(o, 'alpine') || hasAcc(o, 'felt-hat') || hasAcc(o, 'beret');
  ctx.fillStyle = o.hair;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.028;
  if (!covered) {
    if (!hat && !hasAcc(o, 'curlers')) {
      circle(ctx, 0, hy - 0.2, 0.065);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-0.14, hy - 0.01);
    ctx.quadraticCurveTo(-0.17, hy - 0.16, -0.06, hy - 0.15);
    ctx.quadraticCurveTo(0, hy - 0.19, 0.06, hy - 0.15);
    ctx.quadraticCurveTo(0.17, hy - 0.16, 0.14, hy - 0.01);
    ctx.quadraticCurveTo(0.12, hy - 0.09, 0.05, hy - 0.1);
    ctx.quadraticCurveTo(0, hy - 0.08, -0.05, hy - 0.1);
    ctx.quadraticCurveTo(-0.12, hy - 0.09, -0.14, hy - 0.01);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // fazzoletto annodato sotto il mento
    ctx.beginPath();
    ctx.moveTo(-0.15, hy + 0.06);
    ctx.quadraticCurveTo(-0.2, hy - 0.2, 0, hy - 0.2);
    ctx.quadraticCurveTo(0.2, hy - 0.2, 0.15, hy + 0.06);
    ctx.quadraticCurveTo(0.1, hy + 0.12, 0.04, hy + 0.14);
    ctx.lineTo(0.12, hy + 0.2);
    ctx.lineTo(0.02, hy + 0.17);
    ctx.lineTo(-0.04, hy + 0.14);
    ctx.quadraticCurveTo(-0.1, hy + 0.12, -0.15, hy + 0.06);
    ctx.closePath();
    fillInk(ctx, o.accent);
    // il viso resta scoperto
    ctx.beginPath();
    ctx.ellipse(0, hy + 0.01, 0.11, 0.115, 0, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.lineWidth = 0.02;
    ctx.strokeStyle = 'rgba(45,42,62,0.5)';
    ctx.stroke();
    ctx.fillStyle = o.hair;
    ctx.beginPath();
    ctx.ellipse(0, hy - 0.085, 0.08, 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (hasAcc(o, 'curlers')) {
    // bigodini con la retina
    const cols = ['#f28bb6', '#5aa9f0', '#f7c948', '#f28bb6', '#5aa9f0'];
    cols.forEach((c, i) => {
      const cx = -0.12 + i * 0.06;
      const cy = hy - 0.15 - Math.sin((i / 4) * Math.PI) * 0.05;
      rr(ctx, cx - 0.026, cy - 0.04, 0.052, 0.07, 0.022);
      fillInk(ctx, c, 0.018);
    });
    ctx.strokeStyle = 'rgba(45,42,62,0.35)';
    ctx.lineWidth = 0.008;
    ctx.beginPath();
    ctx.arc(0, hy - 0.08, 0.16, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  // guance e naso
  ctx.fillStyle = 'rgba(240,110,125,0.45)';
  circle(ctx, -0.085, hy + 0.045, 0.03);
  ctx.fill();
  circle(ctx, 0.085, hy + 0.045, 0.03);
  ctx.fill();
  circle(ctx, 0, hy + 0.02, 0.018);
  ctx.fillStyle = SKIN_DARK;
  ctx.fill();

  // occhi e occhiali
  const ey = hy - 0.005;
  const cross = mood === 'angry' || mood === 'slipper';
  if (hasAcc(o, 'sunglasses')) {
    ctx.fillStyle = '#1f1d2b';
    rr(ctx, -0.1, ey - 0.03, 0.085, 0.055, 0.025);
    ctx.fill();
    rr(ctx, 0.015, ey - 0.03, 0.085, 0.055, 0.025);
    ctx.fill();
    ctx.fillRect(-0.02, ey - 0.02, 0.04, 0.012);
  } else {
    ctx.fillStyle = INK;
    if (mood === 'happy') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.018;
      ctx.beginPath();
      ctx.arc(-0.052, ey + 0.008, 0.016, Math.PI, 0);
      ctx.moveTo(0.068, ey + 0.008);
      ctx.arc(0.052, ey + 0.008, 0.016, Math.PI, 0);
      ctx.stroke();
    } else {
      const r = cross ? 0.016 : 0.013;
      circle(ctx, -0.05, ey, r);
      ctx.fill();
      circle(ctx, 0.05, ey, r);
      ctx.fill();
    }
    if (hasAcc(o, 'glasses')) {
      ctx.strokeStyle = '#7a5a44';
      ctx.lineWidth = 0.016;
      circle(ctx, -0.052, ey, 0.04);
      ctx.stroke();
      circle(ctx, 0.052, ey, 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.013, ey);
      ctx.lineTo(0.013, ey);
      ctx.stroke();
    }
  }
  if (cross) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(-0.09, ey - 0.07);
    ctx.lineTo(-0.025, ey - 0.045);
    ctx.moveTo(0.09, ey - 0.07);
    ctx.lineTo(0.025, ey - 0.045);
    ctx.stroke();
  }
  // bocca
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.018;
  if (cross) {
    ellipse(ctx, 0, hy + 0.075, 0.028, 0.022);
    ctx.fillStyle = '#8c3b4a';
    ctx.fill();
    ctx.stroke();
  } else if (mood === 'happy') {
    ctx.beginPath();
    ctx.moveTo(-0.04, hy + 0.06);
    ctx.quadraticCurveTo(0, hy + 0.12, 0.04, hy + 0.06);
    ctx.closePath();
    ctx.fillStyle = '#8c3b4a';
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, hy + 0.045, 0.032, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }

  if (hasAcc(o, 'earrings')) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.014;
    circle(ctx, -0.14, hy + 0.06, 0.022);
    ctx.stroke();
    circle(ctx, 0.14, hy + 0.06, 0.022);
    ctx.stroke();
  }

  // cappelli e fiori
  if (hasAcc(o, 'straw-hat')) {
    ellipse(ctx, 0, hy - 0.12, 0.23, 0.065);
    fillInk(ctx, '#ecc97c');
    rr(ctx, -0.11, hy - 0.25, 0.22, 0.14, 0.06);
    fillInk(ctx, '#ecc97c');
    ctx.fillStyle = o.accent;
    ctx.fillRect(-0.11, hy - 0.16, 0.22, 0.035);
    circle(ctx, 0.1, hy - 0.16, 0.035);
    fillInk(ctx, '#ffffff', 0.02);
    circle(ctx, 0.1, hy - 0.16, 0.014);
    ctx.fillStyle = '#f7c948';
    ctx.fill();
  }
  if (hasAcc(o, 'felt-hat')) {
    ellipse(ctx, 0, hy - 0.13, 0.19, 0.05);
    fillInk(ctx, o.accent);
    rr(ctx, -0.1, hy - 0.26, 0.2, 0.14, 0.07);
    fillInk(ctx, o.accent);
    ctx.fillStyle = '#b83535';
    ctx.fillRect(-0.1, hy - 0.17, 0.2, 0.03);
  }
  if (hasAcc(o, 'alpine')) {
    ellipse(ctx, 0, hy - 0.12, 0.2, 0.05);
    fillInk(ctx, '#2f6b3a');
    ctx.beginPath();
    ctx.moveTo(-0.12, hy - 0.12);
    ctx.lineTo(-0.08, hy - 0.27);
    ctx.lineTo(0.08, hy - 0.27);
    ctx.lineTo(0.12, hy - 0.12);
    ctx.closePath();
    fillInk(ctx, '#3f8f4f');
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(0.08, hy - 0.16);
    ctx.quadraticCurveTo(0.2, hy - 0.3, 0.26, hy - 0.4);
    ctx.stroke();
  }
  if (hasAcc(o, 'beret')) {
    ctx.save();
    ctx.translate(0.02, hy - 0.14);
    ctx.rotate(-0.18);
    ellipse(ctx, 0, 0, 0.17, 0.065);
    fillInk(ctx, o.accent);
    ctx.fillStyle = o.accent;
    ctx.fillRect(-0.008, -0.1, 0.016, 0.04);
    ctx.restore();
  }
  if (hasAcc(o, 'flower')) {
    const fx = 0.1;
    const fy = hy - 0.13;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      circle(ctx, fx + Math.cos(a) * 0.03, fy + Math.sin(a) * 0.03, 0.025);
      fillInk(ctx, o.accent, 0.012);
    }
    circle(ctx, fx, fy, 0.018);
    fillInk(ctx, '#f7c948', 0.01);
  }
}

export function drawScout(ctx: Ctx, legs: number, mood: Mood, t: number) {
  const liftL = Math.max(0, -legs) * 0.06;
  const liftR = Math.max(0, legs) * 0.06;
  for (const [x, lift] of [
    [-0.045, liftL],
    [0.045, liftR],
  ] as const) {
    ctx.fillStyle = SKIN;
    rr(ctx, x - 0.02, -0.17 - lift, 0.04, 0.16, 0.02);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.022;
    ctx.stroke();
    ctx.fillStyle = '#3f8f4f';
    ctx.fillRect(x - 0.02, -0.07 - lift, 0.04, 0.04);
    ellipse(ctx, x + 0.01, -0.02 - lift, 0.042, 0.026);
    fillInk(ctx, '#7a4b2a', 0.022);
  }
  // pantaloncini e camicia
  rr(ctx, -0.1, -0.29, 0.2, 0.14, 0.04);
  fillInk(ctx, '#5f7a3a');
  rr(ctx, -0.11, -0.47, 0.22, 0.21, 0.07);
  fillInk(ctx, '#dcbc70');
  // fazzolettone
  ctx.beginPath();
  ctx.moveTo(-0.075, -0.465);
  ctx.lineTo(0.075, -0.465);
  ctx.lineTo(0, -0.37);
  ctx.closePath();
  fillInk(ctx, '#f28c28', 0.022);
  // braccio che tiene la nonna (a sinistra)
  limb(ctx, -0.09, -0.43, -0.18, -0.39, '#dcbc70', 0.055);
  // braccio libero
  const scared = mood === 'angry' || mood === 'slipper';
  if (mood === 'happy') {
    const wy = -0.66 + Math.sin(t * 16) * 0.03;
    limb(ctx, 0.09, -0.43, 0.16, wy, '#dcbc70', 0.055);
    hand(ctx, 0.165, wy - 0.01, 0.032);
  } else if (scared) {
    limb(ctx, 0.09, -0.43, 0.17, -0.58, '#dcbc70', 0.055);
    hand(ctx, 0.175, -0.59, 0.032);
  } else {
    limb(ctx, 0.09, -0.43, 0.13, -0.3, '#dcbc70', 0.055);
    hand(ctx, 0.135, -0.29, 0.032);
  }
  // testa
  const hy = -0.58;
  circle(ctx, 0, hy, 0.115);
  fillInk(ctx, SKIN);
  ctx.fillStyle = 'rgba(240,110,125,0.4)';
  circle(ctx, -0.07, hy + 0.04, 0.024);
  ctx.fill();
  circle(ctx, 0.07, hy + 0.04, 0.024);
  ctx.fill();
  ctx.fillStyle = INK;
  const er = scared ? 0.02 : 0.015;
  circle(ctx, -0.04, hy + 0.005, er);
  ctx.fill();
  circle(ctx, 0.04, hy + 0.005, er);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.018;
  if (scared) {
    ellipse(ctx, 0, hy + 0.06, 0.018, 0.022);
    ctx.fillStyle = '#8c3b4a';
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, hy + 0.035, 0.03, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  // cappellino
  ctx.beginPath();
  ctx.arc(0, hy - 0.03, 0.118, Math.PI, 0);
  ctx.closePath();
  fillInk(ctx, '#3f8f4f');
  rr(ctx, 0.02, hy - 0.05, 0.16, 0.04, 0.02);
  fillInk(ctx, '#2f6b3a', 0.022);
  circle(ctx, 0, hy - 0.15, 0.02);
  fillInk(ctx, '#f7c948', 0.018);
}

/** La coppia al completo, con l'ombra. Il chiamante ha già posizionato i piedi in (0, 0). */
export function drawPair(ctx: Ctx, look: Look, pose: PairPose, hopHeight = 0) {
  ctx.save();
  ctx.fillStyle = `rgba(30,25,50,${0.22 - hopHeight * 0.3})`;
  ellipse(ctx, 0, 0.02, 0.36 - hopHeight * 0.3, 0.09 - hopHeight * 0.1);
  ctx.fill();
  ctx.translate(0, -hopHeight);
  ctx.scale(pose.facing, 1);
  ctx.lineJoin = 'round';
  const happyJump = pose.mood === 'happy' ? Math.abs(Math.sin(pose.t * 8)) * 0.12 : 0;
  const scoutJump =
    pose.mood === 'happy' ? Math.abs(Math.cos(pose.t * 8)) * 0.14 : pose.mood === 'angry' ? Math.abs(Math.sin(pose.t * 12)) * 0.08 : 0;
  ctx.save();
  ctx.translate(0.2, -scoutJump);
  drawScout(ctx, pose.legs, pose.mood, pose.t);
  ctx.restore();
  ctx.save();
  ctx.translate(-0.17, -happyJump);
  drawNonna(ctx, look, pose.legs, pose.mood, pose.t);
  ctx.restore();
  ctx.restore();
}
