import type { Outfit } from '../outfits';
import { INK, circle, ellipse, fillInk, rr } from './paint';
import type { Ctx } from './paint';

/**
 * La nonna e il piccolo scout che la accompagna per mano.
 * Coordinate in celle, piedi in (0, 0), l'alto è verso y negativi.
 */

const SKIN = '#f6d2b8';
const SKIN_DARK = '#e7b594';
const STOCKING = '#ead0b4';

export type Mood = 'idle' | 'walk' | 'angry' | 'umbrella' | 'happy';

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

function umbrellaOpen(ctx: Ctx, hx: number, hy: number, t: number) {
  const cx = hx + 0.02;
  const cy = hy - 0.2;
  const R = 0.32;
  const wob = Math.sin(t * 22) * 0.04;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wob);
  // asta
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.95);
  ctx.lineTo(-0.02, 0.2);
  ctx.stroke();
  // cupola a spicchi
  ctx.beginPath();
  ctx.moveTo(-R, 0);
  ctx.arc(0, 0, R, Math.PI, 0);
  const n = 4;
  for (let i = n; i > 0; i--) {
    const x1 = -R + (2 * R * i) / n;
    const x0 = -R + (2 * R * (i - 1)) / n;
    ctx.quadraticCurveTo((x0 + x1) / 2, -0.07, x0, 0);
  }
  ctx.closePath();
  fillInk(ctx, '#e84a4a');
  ctx.fillStyle = '#ffffff';
  for (const [dx, dy] of [
    [-0.16, -0.12],
    [0.02, -0.22],
    [0.18, -0.1],
  ]) {
    circle(ctx, dx, dy, 0.035);
    ctx.fill();
  }
  circle(ctx, 0, -R - 0.02, 0.025);
  fillInk(ctx, '#f7c948', 0.02);
  ctx.restore();
}

function umbrellaClosed(ctx: Ctx, hx: number, hy: number, angle: number) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-0.04, -0.06);
  ctx.lineTo(0.04, -0.06);
  ctx.lineTo(0.012, -0.42);
  ctx.lineTo(-0.012, -0.42);
  ctx.closePath();
  fillInk(ctx, '#e84a4a', 0.025);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.028;
  ctx.beginPath();
  ctx.moveTo(0, -0.06);
  ctx.lineTo(0, 0.06);
  ctx.arc(0.035, 0.06, 0.035, Math.PI, 0, true);
  ctx.stroke();
  ctx.restore();
}

export function drawNonna(ctx: Ctx, o: Outfit, legs: number, mood: Mood, t: number, holding = true) {
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

  // braccio verso lo scout (a destra)
  if (holding) {
    limb(ctx, 0.12, -0.6, 0.22, -0.4, o.cardigan);
    hand(ctx, 0.23, -0.39);
  } else {
    limb(ctx, 0.12, -0.6, 0.16, -0.42, o.cardigan);
    hand(ctx, 0.165, -0.41);
  }

  // braccio libero (a sinistra): borsetta, ombrello o saluto
  if (mood === 'umbrella') {
    limb(ctx, -0.12, -0.6, -0.1, -0.86, o.cardigan);
    umbrellaOpen(ctx, -0.1, -0.88, t);
    hand(ctx, -0.1, -0.88);
  } else if (mood === 'angry') {
    const sw = Math.sin(t * 28) * 0.35;
    limb(ctx, -0.12, -0.6, -0.2, -0.84, o.cardigan);
    umbrellaClosed(ctx, -0.2, -0.86, -0.3 + sw);
    hand(ctx, -0.2, -0.86);
  } else if (mood === 'happy') {
    const wx = -0.24 + Math.sin(t * 14) * 0.05;
    limb(ctx, -0.12, -0.6, wx, -0.86, o.cardigan);
    hand(ctx, wx, -0.87);
  } else {
    limb(ctx, -0.12, -0.6, -0.18, -0.42, o.cardigan);
    // borsetta
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.arc(-0.2, -0.4, 0.045, Math.PI, 0);
    ctx.stroke();
    rr(ctx, -0.27, -0.4, 0.14, 0.12, 0.035);
    fillInk(ctx, o.bag, 0.025);
    hand(ctx, -0.18, -0.42);
  }

  if (o.accessory === 'diva') {
    ctx.fillStyle = '#ffffff';
    for (let i = -3; i <= 3; i++) {
      circle(ctx, i * 0.025, -0.645 + Math.abs(i) * -0.006 + i * i * 0.002, 0.014);
      ctx.fill();
    }
  }

  // testa
  const hy = -0.78;
  circle(ctx, 0, hy, 0.14);
  fillInk(ctx, SKIN);
  // capelli: nuvola sopra la fronte e crocchia
  ctx.fillStyle = o.hair;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.028;
  if (o.accessory !== 'straw-hat' && o.accessory !== 'alpine') {
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
  if (o.accessory === 'diva') {
    ctx.fillStyle = '#1f1d2b';
    rr(ctx, -0.1, ey - 0.03, 0.085, 0.055, 0.025);
    ctx.fill();
    rr(ctx, 0.015, ey - 0.03, 0.085, 0.055, 0.025);
    ctx.fill();
    ctx.fillRect(-0.02, ey - 0.02, 0.04, 0.012);
  } else {
    ctx.fillStyle = INK;
    if (mood === 'happy') {
      ctx.lineWidth = 0.018;
      ctx.beginPath();
      ctx.arc(-0.052, ey + 0.008, 0.016, Math.PI, 0);
      ctx.moveTo(0.068, ey + 0.008);
      ctx.arc(0.052, ey + 0.008, 0.016, Math.PI, 0);
      ctx.stroke();
    } else {
      const r = mood === 'umbrella' || mood === 'angry' ? 0.016 : 0.013;
      circle(ctx, -0.05, ey, r);
      ctx.fill();
      circle(ctx, 0.05, ey, r);
      ctx.fill();
    }
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
  if (mood === 'angry' || mood === 'umbrella') {
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
  if (mood === 'angry' || mood === 'umbrella') {
    ellipse(ctx, 0, hy + 0.075, 0.025, 0.02);
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

  // accessori sulla testa
  switch (o.accessory) {
    case 'straw-hat': {
      ellipse(ctx, 0, hy - 0.12, 0.23, 0.065);
      fillInk(ctx, '#ecc97c');
      rr(ctx, -0.11, hy - 0.25, 0.22, 0.14, 0.06);
      fillInk(ctx, '#ecc97c');
      ctx.fillStyle = '#d94f5c';
      ctx.fillRect(-0.11, hy - 0.16, 0.22, 0.035);
      circle(ctx, 0.1, hy - 0.16, 0.035);
      fillInk(ctx, '#ffffff', 0.02);
      circle(ctx, 0.1, hy - 0.16, 0.014);
      ctx.fillStyle = '#f7c948';
      ctx.fill();
      break;
    }
    case 'headband': {
      rr(ctx, -0.14, hy - 0.12, 0.28, 0.045, 0.02);
      fillInk(ctx, '#f28bb6', 0.022);
      break;
    }
    case 'rock': {
      ctx.fillStyle = '#f7c948';
      circle(ctx, -0.14, hy + 0.05, 0.018);
      ctx.fill();
      circle(ctx, 0.14, hy + 0.05, 0.018);
      ctx.fill();
      break;
    }
    case 'alpine': {
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
      break;
    }
    case 'tiara': {
      ctx.beginPath();
      ctx.moveTo(-0.1, hy - 0.14);
      ctx.lineTo(-0.08, hy - 0.24);
      ctx.lineTo(-0.035, hy - 0.17);
      ctx.lineTo(0, hy - 0.27);
      ctx.lineTo(0.035, hy - 0.17);
      ctx.lineTo(0.08, hy - 0.24);
      ctx.lineTo(0.1, hy - 0.14);
      ctx.closePath();
      fillInk(ctx, '#f7c948', 0.022);
      circle(ctx, 0, hy - 0.19, 0.018);
      ctx.fillStyle = '#e84a4a';
      ctx.fill();
      break;
    }
    default:
      break;
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
  if (mood === 'happy') {
    const wy = -0.66 + Math.sin(t * 16) * 0.03;
    limb(ctx, 0.09, -0.43, 0.16, wy, '#dcbc70', 0.055);
    hand(ctx, 0.165, wy - 0.01, 0.032);
  } else if (mood === 'angry') {
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
  const er = mood === 'angry' ? 0.02 : 0.015;
  circle(ctx, -0.04, hy + 0.005, er);
  ctx.fill();
  circle(ctx, 0.04, hy + 0.005, er);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.018;
  if (mood === 'angry') {
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
export function drawPair(ctx: Ctx, outfit: Outfit, pose: PairPose, hopHeight = 0) {
  ctx.save();
  ctx.fillStyle = `rgba(30,25,50,${0.22 - hopHeight * 0.3})`;
  ellipse(ctx, 0, 0.02, 0.36 - hopHeight * 0.3, 0.09 - hopHeight * 0.1);
  ctx.fill();
  ctx.translate(0, -hopHeight);
  ctx.scale(pose.facing, 1);
  ctx.lineJoin = 'round';
  const happyJump = pose.mood === 'happy' ? Math.abs(Math.sin(pose.t * 8)) * 0.12 : 0;
  const scoutJump = pose.mood === 'happy' ? Math.abs(Math.cos(pose.t * 8)) * 0.14 : pose.mood === 'angry' ? Math.abs(Math.sin(pose.t * 12)) * 0.08 : 0;
  ctx.save();
  ctx.translate(0.2, -scoutJump);
  drawScout(ctx, pose.legs, pose.mood, pose.t);
  ctx.restore();
  ctx.save();
  ctx.translate(-0.17, -happyJump);
  drawNonna(ctx, outfit, pose.legs, pose.mood, pose.t);
  ctx.restore();
  ctx.restore();
}
