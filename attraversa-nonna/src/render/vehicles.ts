import type { VehicleKind } from '../world';
import { VEHICLE_LENGTH } from '../world';
import { CAR_COLORS, INK, SCOOTER_COLORS, circle, ctx2d, ellipse, fillInk, makeCanvas, rr, shade } from './paint';
import type { Ctx } from './paint';

/**
 * Veicoli visti dall'alto "in obliquo": si vede il tetto e, sotto, la fiancata.
 * Ogni veicolo è disegnato una volta sola in uno sprite, poi solo copiato: è ciò
 * che tiene il gioco a 60/120 fps anche con decine di veicoli in scena.
 * Coordinate in celle, veicolo rivolto a destra, centro della corsia in (0, 0).
 */

const GLASS = '#bfe6ff';
const GLASS_DARK = '#8fc3e6';
const TIRE = '#34313f';

function shadow(ctx: Ctx, L: number, h = 0.3) {
  ctx.fillStyle = 'rgba(30,25,50,0.22)';
  rr(ctx, -L / 2 + 0.04, 0.12, L - 0.02, h, 0.14);
  ctx.fill();
}

function wheel(ctx: Ctx, x: number, y: number, rx = 0.13, ry = 0.09) {
  ellipse(ctx, x, y, rx, ry);
  fillInk(ctx, TIRE);
  ellipse(ctx, x, y - 0.01, rx * 0.45, ry * 0.45);
  ctx.fillStyle = '#8d8a99';
  ctx.fill();
}

function lights(ctx: Ctx, L: number, y: number) {
  const hl = L / 2;
  ellipse(ctx, hl - 0.05, y, 0.045, 0.06);
  fillInk(ctx, '#fff4b8', 0.02);
  ellipse(ctx, -hl + 0.05, y, 0.04, 0.055);
  fillInk(ctx, '#e0443c', 0.02);
}

function glassStreak(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.25, y + h * 0.1);
  ctx.lineTo(x + w * 0.45, y + h * 0.1);
  ctx.lineTo(x + w * 0.25, y + h * 0.9);
  ctx.lineTo(x + w * 0.1, y + h * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCar(ctx: Ctx, color: string) {
  const L = VEHICLE_LENGTH.car;
  const hl = L / 2;
  shadow(ctx, L);
  wheel(ctx, -hl * 0.55, 0.26);
  wheel(ctx, hl * 0.55, 0.26);
  // fiancata
  rr(ctx, -hl, -0.08, L, 0.36, 0.16);
  fillInk(ctx, shade(color, -0.22));
  // paraurti
  ctx.fillStyle = '#d9d6e3';
  rr(ctx, hl - 0.07, 0.02, 0.07, 0.2, 0.03);
  ctx.fill();
  rr(ctx, -hl, 0.02, 0.07, 0.2, 0.03);
  ctx.fill();
  lights(ctx, L, 0.07);
  // tetto/carrozzeria vista dall'alto
  rr(ctx, -hl, -0.42, L, 0.5, 0.22);
  fillInk(ctx, color);
  // abitacolo
  rr(ctx, -hl * 0.55, -0.37, hl * 1.15, 0.4, 0.14);
  fillInk(ctx, shade(color, 0.15), 0.025);
  // parabrezza e lunotto
  rr(ctx, hl * 0.28, -0.35, 0.2, 0.36, 0.08);
  fillInk(ctx, GLASS, 0.025);
  glassStreak(ctx, hl * 0.28, -0.35, 0.2, 0.36);
  rr(ctx, -hl * 0.52, -0.34, 0.14, 0.34, 0.06);
  fillInk(ctx, GLASS_DARK, 0.025);
  // riflesso sul cofano
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rr(ctx, hl * 0.62, -0.36, 0.12, 0.08, 0.04);
  ctx.fill();
}

function drawVan(ctx: Ctx, color: string, accent: string) {
  const L = VEHICLE_LENGTH.van;
  const hl = L / 2;
  shadow(ctx, L);
  wheel(ctx, -hl * 0.62, 0.27);
  wheel(ctx, hl * 0.6, 0.27);
  rr(ctx, -hl, -0.1, L, 0.38, 0.1);
  fillInk(ctx, shade(color, -0.2));
  ctx.fillStyle = accent;
  ctx.fillRect(-hl + 0.1, 0.02, L - 0.55, 0.08);
  lights(ctx, L, 0.08);
  // cassone
  rr(ctx, -hl, -0.44, L - 0.5, 0.54, 0.08);
  fillInk(ctx, color);
  ctx.strokeStyle = shade(color, -0.12);
  ctx.lineWidth = 0.025;
  for (let x = -hl + 0.25; x < hl - 0.6; x += 0.25) {
    ctx.beginPath();
    ctx.moveTo(x, -0.4);
    ctx.lineTo(x, 0.06);
    ctx.stroke();
  }
  // cabina
  rr(ctx, hl - 0.56, -0.4, 0.56, 0.48, 0.16);
  fillInk(ctx, shade(color, 0.06));
  rr(ctx, hl - 0.3, -0.36, 0.2, 0.4, 0.07);
  fillInk(ctx, GLASS, 0.025);
  glassStreak(ctx, hl - 0.3, -0.36, 0.2, 0.4);
}

function drawBus(ctx: Ctx, color: string) {
  const L = VEHICLE_LENGTH.bus;
  const hl = L / 2;
  shadow(ctx, L, 0.32);
  wheel(ctx, -hl + 0.55, 0.28, 0.15, 0.1);
  wheel(ctx, hl - 0.6, 0.28, 0.15, 0.1);
  // fiancata alta con i finestrini
  rr(ctx, -hl, -0.16, L, 0.46, 0.12);
  fillInk(ctx, shade(color, -0.18));
  for (let x = -hl + 0.2; x < hl - 0.5; x += 0.42) {
    rr(ctx, x, -0.1, 0.34, 0.2, 0.05);
    fillInk(ctx, GLASS_DARK, 0.022);
  }
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(-hl + 0.08, 0.16, L - 0.16, 0.05);
  lights(ctx, L, 0.18);
  // tetto
  rr(ctx, -hl, -0.46, L, 0.36, 0.14);
  fillInk(ctx, shade(color, 0.12));
  rr(ctx, -hl * 0.55, -0.41, 0.7, 0.24, 0.06);
  fillInk(ctx, '#d6d9e3', 0.022);
  rr(ctx, hl * 0.05, -0.39, 0.34, 0.2, 0.06);
  fillInk(ctx, '#d6d9e3', 0.022);
  // parabrezza
  rr(ctx, hl - 0.2, -0.44, 0.18, 0.5, 0.07);
  fillInk(ctx, GLASS, 0.025);
  // numero di linea
  ctx.fillStyle = '#ffd84a';
  rr(ctx, hl - 0.2, -0.12, 0.16, 0.1, 0.02);
  ctx.fill();
}

function rider(ctx: Ctx, x: number, jacket: string, helmet: string, lean = 0) {
  // busto
  ellipse(ctx, x, -0.14, 0.14, 0.15);
  fillInk(ctx, jacket);
  // braccio verso il manubrio
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 0.05, -0.16);
  ctx.lineTo(x + 0.26, -0.08);
  ctx.stroke();
  ctx.strokeStyle = jacket;
  ctx.lineWidth = 0.06;
  ctx.stroke();
  // casco
  circle(ctx, x + 0.05 + lean, -0.33, 0.14);
  fillInk(ctx, helmet);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ellipse(ctx, x + lean, -0.39, 0.05, 0.03, -0.4);
  ctx.fill();
  rr(ctx, x + 0.1 + lean, -0.36, 0.1, 0.1, 0.04);
  fillInk(ctx, '#3a3950', 0.02);
}

function drawScooter(ctx: Ctx, color: string, jacket: string) {
  shadow(ctx, 0.9, 0.24);
  wheel(ctx, -0.3, 0.24, 0.1, 0.07);
  wheel(ctx, 0.3, 0.24, 0.1, 0.07);
  // scocca: pancia tondeggiante dietro, scudo davanti
  ctx.beginPath();
  ctx.moveTo(-0.44, -0.02);
  ctx.quadraticCurveTo(-0.46, 0.24, -0.18, 0.24);
  ctx.lineTo(0.2, 0.22);
  ctx.quadraticCurveTo(0.4, 0.2, 0.42, -0.1);
  ctx.lineTo(0.34, -0.12);
  ctx.quadraticCurveTo(0.22, 0.05, 0.02, 0.06);
  ctx.quadraticCurveTo(-0.2, -0.16, -0.44, -0.02);
  ctx.closePath();
  fillInk(ctx, color);
  // sella
  rr(ctx, -0.36, -0.08, 0.3, 0.09, 0.045);
  fillInk(ctx, '#5a4a4a', 0.022);
  // faro
  circle(ctx, 0.4, -0.13, 0.05);
  fillInk(ctx, '#fff4b8', 0.02);
  rider(ctx, -0.12, jacket, shade(color, -0.1));
}

function drawTrike(ctx: Ctx, color: string, fruit: string) {
  const L = VEHICLE_LENGTH.trike;
  const hl = L / 2;
  shadow(ctx, L, 0.26);
  wheel(ctx, -hl * 0.6, 0.25, 0.1, 0.075);
  wheel(ctx, hl * 0.62, 0.25, 0.1, 0.075);
  // cassone con le cassette di frutta
  rr(ctx, -hl, -0.2, L * 0.55, 0.42, 0.05);
  fillInk(ctx, shade(color, -0.2));
  rr(ctx, -hl + 0.03, -0.3, L * 0.55 - 0.06, 0.32, 0.04);
  fillInk(ctx, '#c9975a', 0.025);
  for (let i = 0; i < 5; i++) {
    const fx = -hl + 0.12 + (i % 3) * 0.14;
    const fy = -0.22 + Math.floor(i / 3) * 0.12;
    circle(ctx, fx, fy, 0.055);
    fillInk(ctx, fruit, 0.02);
  }
  // cabina tondeggiante
  rr(ctx, -hl + L * 0.5, -0.36, L * 0.5, 0.62, 0.2);
  fillInk(ctx, color);
  rr(ctx, hl - 0.2, -0.3, 0.14, 0.34, 0.06);
  fillInk(ctx, GLASS, 0.022);
  circle(ctx, hl - 0.04, 0.12, 0.045);
  fillInk(ctx, '#fff4b8', 0.02);
}

function drawBike(ctx: Ctx, jersey: string) {
  shadow(ctx, 0.8, 0.2);
  ctx.lineWidth = 0.045;
  ctx.strokeStyle = INK;
  ellipse(ctx, -0.26, 0.2, 0.15, 0.08);
  ctx.stroke();
  ellipse(ctx, 0.26, 0.2, 0.15, 0.08);
  ctx.stroke();
  ctx.strokeStyle = jersey;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.26, 0.2);
  ctx.lineTo(-0.02, 0.08);
  ctx.lineTo(0.2, 0.08);
  ctx.lineTo(0.26, 0.2);
  ctx.moveTo(-0.02, 0.08);
  ctx.lineTo(0.06, -0.04);
  ctx.stroke();
  rider(ctx, -0.08, jersey, '#ffffff', 0.04);
}

function drawTram(ctx: Ctx) {
  const L = VEHICLE_LENGTH.tram;
  const hl = L / 2;
  const body = '#f28c28';
  shadow(ctx, L, 0.34);
  // fiancata con finestrini e fascia crema
  rr(ctx, -hl, -0.2, L, 0.52, 0.2);
  fillInk(ctx, shade(body, -0.12));
  ctx.fillStyle = '#f5e6c8';
  ctx.fillRect(-hl + 0.1, 0.14, L - 0.2, 0.08);
  for (let x = -hl + 0.3; x < hl - 0.4; x += 0.5) {
    rr(ctx, x, -0.14, 0.38, 0.22, 0.05);
    fillInk(ctx, GLASS_DARK, 0.022);
  }
  // porte
  for (const dx of [-hl * 0.5, 0.05, hl * 0.55]) {
    rr(ctx, dx - 0.18, -0.16, 0.36, 0.44, 0.04);
    fillInk(ctx, shade(body, -0.3), 0.022);
  }
  lights(ctx, L, 0.2);
  // tetto e pantografo
  rr(ctx, -hl, -0.5, L, 0.34, 0.16);
  fillInk(ctx, '#e3ddd2');
  rr(ctx, -0.45, -0.47, 0.9, 0.26, 0.06);
  fillInk(ctx, '#bfb8ab', 0.022);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.36);
  ctx.lineTo(0, -0.62);
  ctx.lineTo(0.3, -0.36);
  ctx.moveTo(-0.2, -0.62);
  ctx.lineTo(0.2, -0.62);
  ctx.stroke();
  // testate
  rr(ctx, hl - 0.28, -0.46, 0.22, 0.6, 0.1);
  fillInk(ctx, GLASS, 0.025);
  rr(ctx, -hl + 0.06, -0.46, 0.22, 0.6, 0.1);
  fillInk(ctx, GLASS, 0.025);
  ctx.fillStyle = '#2d2a3e';
  rr(ctx, hl - 0.26, -0.42, 0.18, 0.12, 0.02);
  ctx.fill();
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Pixel dello sprite che corrisponde al centro del veicolo. */
  ox: number;
  oy: number;
}

const BUS_COLORS = ['#f2994a', '#3fb27f', '#3d8bd9'];
const VAN_COLORS = ['#f4f4f0', '#f3e6c4', '#dfe8f0'];
const TRIKE_COLORS = ['#5aa9f0', '#5fd3b0', '#e84a4a'];

export function paintVehicle(ctx: Ctx, kind: VehicleKind, color: number) {
  switch (kind) {
    case 'car':
      return drawCar(ctx, CAR_COLORS[color % CAR_COLORS.length]);
    case 'van':
      return drawVan(ctx, VAN_COLORS[color % 3], CAR_COLORS[color % CAR_COLORS.length]);
    case 'bus':
      return drawBus(ctx, BUS_COLORS[color % 3]);
    case 'scooter':
      return drawScooter(ctx, SCOOTER_COLORS[color % SCOOTER_COLORS.length], CAR_COLORS[(color + 3) % CAR_COLORS.length]);
    case 'trike':
      return drawTrike(ctx, TRIKE_COLORS[color % 3], color % 2 ? '#f7c948' : '#f58b3c');
    case 'bike':
      return drawBike(ctx, CAR_COLORS[color % CAR_COLORS.length]);
    case 'tram':
      return drawTram(ctx);
  }
}

export class VehicleSprites {
  private cache = new Map<string, Sprite>();

  constructor(private readonly scale: number) {}

  get(kind: VehicleKind, color: number, dir: 1 | -1): Sprite {
    const c = kind === 'tram' ? 0 : color;
    const key = `${kind}:${c}:${dir}`;
    let sp = this.cache.get(key);
    if (!sp) {
      sp = this.build(kind, c, dir);
      this.cache.set(key, sp);
    }
    return sp;
  }

  private build(kind: VehicleKind, color: number, dir: 1 | -1): Sprite {
    const s = this.scale;
    const L = VEHICLE_LENGTH[kind];
    const w = (L + 0.5) * s;
    const h = 1.35 * s;
    const canvas = makeCanvas(w, h);
    const ctx = ctx2d(canvas);
    const ox = canvas.width / 2;
    const oy = 0.75 * s;
    ctx.translate(ox, oy);
    ctx.scale(s * dir, s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    paintVehicle(ctx, kind, color);
    return { canvas, ox, oy };
  }
}
