import { DOOR_COL, doorRow } from '../world';
import type { RowDef, Stop, World } from '../world';
import { INK, cellText, circle, ctx2d, ellipse, fillInk, makeCanvas, rr, shade } from './paint';
import type { Ctx } from './paint';

/**
 * Scenografia statica del livello (strade, marciapiedi, aiuole, palazzi) disegnata
 * una volta sola in "fette" orizzontali: a ogni frame basta copiarne due o tre.
 */

const CHUNK_ROWS = 6;
/** Altezza delle facciate dei palazzi nelle piazze, in righe. */
export const BUILDING_HEIGHT = 3.5;

function hash(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const STONE = '#e9dfcc';
const ASPHALT = '#5f6674';
const GRASS = '#8fcf6a';
const BIKE = '#c9624f';
const COBBLE = '#8a8274';

interface Span {
  x0: number;
  x1: number;
}

function sidewalkTiles(ctx: Ctx, sp: Span, row: number) {
  ctx.fillStyle = STONE;
  ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, 1);
  const x0 = Math.floor(sp.x0 * 2) / 2;
  for (let x = x0; x < sp.x1; x += 0.5) {
    for (let y = 0; y < 1; y += 0.5) {
      const v = hash(Math.round(x * 2), row * 2 + y * 2, 7);
      ctx.fillStyle = v < 0.33 ? '#e3d7c1' : v < 0.66 ? '#ede4d3' : '#e6dbc6';
      ctx.fillRect(x + 0.02, y + 0.02, 0.46, 0.46);
    }
  }
}

function curb(ctx: Ctx, sp: Span, y: number, facingUp: boolean) {
  // bordo del marciapiede: pietra chiara con uno spigolo scuro verso la strada
  ctx.fillStyle = '#d9cdb5';
  ctx.fillRect(sp.x0, facingUp ? y : y - 0.1, sp.x1 - sp.x0, 0.1);
  ctx.fillStyle = '#b3a589';
  ctx.fillRect(sp.x0, facingUp ? y : y - 0.025, sp.x1 - sp.x0, 0.025);
}

function asphalt(ctx: Ctx, sp: Span, row: number) {
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, 1);
  for (let x = Math.floor(sp.x0); x < sp.x1; x++) {
    for (let k = 0; k < 14; k++) {
      const px = x + hash(x, row, k);
      const py = hash(x, row, k + 50);
      ctx.fillStyle = hash(x, row, k + 99) < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(px, py, 0.05, 0.05);
    }
  }
}

function dashed(ctx: Ctx, sp: Span, y: number, color = '#f4f1ea', w = 0.06) {
  ctx.fillStyle = color;
  for (let x = Math.floor(sp.x0) - 0.25; x < sp.x1; x += 1) ctx.fillRect(x, y - w / 2, 0.5, w);
}

function solid(ctx: Ctx, sp: Span, y: number, color = '#f4f1ea', w = 0.05) {
  ctx.fillStyle = color;
  ctx.fillRect(sp.x0, y - w / 2, sp.x1 - sp.x0, w);
}

function arrow(ctx: Ctx, x: number, y: number, dir: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + 0.22 * dir, y);
  ctx.lineTo(x - 0.02 * dir, y - 0.13);
  ctx.lineTo(x - 0.02 * dir, y - 0.05);
  ctx.lineTo(x - 0.22 * dir, y - 0.05);
  ctx.lineTo(x - 0.22 * dir, y + 0.05);
  ctx.lineTo(x - 0.02 * dir, y + 0.05);
  ctx.lineTo(x - 0.02 * dir, y + 0.13);
  ctx.closePath();
  ctx.fill();
}

function bikeStencil(ctx: Ctx, x: number, y: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 0.035;
  circle(ctx, x - 0.17, y + 0.06, 0.1);
  ctx.stroke();
  circle(ctx, x + 0.17, y + 0.06, 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 0.17, y + 0.06);
  ctx.lineTo(x - 0.03, y - 0.08);
  ctx.lineTo(x + 0.1, y - 0.08);
  ctx.lineTo(x + 0.17, y + 0.06);
  ctx.moveTo(x - 0.03, y - 0.08);
  ctx.lineTo(x, y + 0.06);
  ctx.lineTo(x + 0.1, y - 0.08);
  ctx.stroke();
}

function puddle(ctx: Ctx, col: number) {
  const cx = col + 0.5;
  ctx.fillStyle = '#7fc4ea';
  ellipse(ctx, cx, 0.55, 0.36, 0.2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,90,140,0.35)';
  ctx.lineWidth = 0.03;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ellipse(ctx, cx - 0.12, 0.49, 0.1, 0.035, -0.2);
  ctx.fill();
  ellipse(ctx, cx + 0.14, 0.62, 0.05, 0.02, -0.2);
  ctx.fill();
}

/** Primo passaggio: il "pavimento" di ogni corsia. */
function paintRowBase(ctx: Ctx, def: RowDef, row: number, sp: Span) {
  switch (def.kind) {
    case 'sidewalk':
      sidewalkTiles(ctx, sp, row);
      break;
    case 'plaza': {
      // lastre di pietra grandi: si capisce subito che è una piazza
      ctx.fillStyle = '#cbc3b4';
      ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, 1);
      for (let y = 0; y < 1; y += 0.5) {
        const off = (Math.round(y * 2) + row) % 2 ? 0.375 : 0;
        for (let x = Math.floor(sp.x0) - off; x < sp.x1; x += 0.75) {
          const v = hash(Math.round(x * 4), row * 2 + y * 2, 5);
          ctx.fillStyle = v < 0.33 ? '#ddd6c8' : v < 0.66 ? '#e6e0d3' : '#d6cebf';
          ctx.fillRect(x + 0.02, y + 0.02, 0.71, 0.46);
        }
      }
      break;
    }
    case 'road':
      asphalt(ctx, sp, row);
      if (def.busLane) {
        ctx.fillStyle = 'rgba(247,201,72,0.12)';
        ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, 1);
      }
      break;
    case 'median': {
      ctx.fillStyle = GRASS;
      ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, 1);
      for (let x = Math.floor(sp.x0); x < sp.x1; x++) {
        for (let k = 0; k < 6; k++) {
          const px = x + hash(x, row, k);
          const py = 0.2 + hash(x, row, k + 20) * 0.6;
          ctx.fillStyle = '#7bbd57';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + 0.04, py - 0.1);
          ctx.lineTo(px + 0.08, py);
          ctx.fill();
        }
        if (hash(x, row, 3) < 0.4) {
          const px = x + 0.2 + hash(x, row, 4) * 0.6;
          const py = 0.3 + hash(x, row, 5) * 0.4;
          ctx.fillStyle = hash(x, row, 6) < 0.5 ? '#ffffff' : '#f7c948';
          circle(ctx, px, py, 0.035);
          ctx.fill();
        }
      }
      break;
    }
    case 'bike':
      asphalt(ctx, sp, row);
      ctx.fillStyle = BIKE;
      ctx.fillRect(sp.x0, 0.06, sp.x1 - sp.x0, 0.88);
      break;
    case 'rail': {
      // massicciata, traversine di legno e rotaie
      ctx.fillStyle = '#a39785';
      ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, 1);
      for (let x = Math.floor(sp.x0); x < sp.x1; x++) {
        for (let k = 0; k < 22; k++) {
          const v = hash(x, row, k + 300);
          ctx.fillStyle = v < 0.33 ? '#8d8272' : v < 0.66 ? '#b8ad9b' : '#978c7b';
          ctx.fillRect(x + hash(x, row, k + 400), 0.04 + hash(x, row, k + 500) * 0.92, 0.07, 0.05);
        }
      }
      for (let x = Math.floor(sp.x0 * 3) / 3; x < sp.x1; x += 1 / 3) {
        rr(ctx, x + 0.04, 0.14, 0.16, 0.72, 0.03);
        ctx.fillStyle = '#7a5a44';
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x + 0.04, 0.8, 0.16, 0.06);
      }
      for (const ry of [0.32, 0.68]) {
        ctx.fillStyle = '#4a463f';
        ctx.fillRect(sp.x0, ry - 0.05, sp.x1 - sp.x0, 0.1);
        ctx.fillStyle = '#c9ccd3';
        ctx.fillRect(sp.x0, ry - 0.035, sp.x1 - sp.x0, 0.035);
      }
      break;
    }
    case 'tram': {
      // sede tranviaria in sampietrini, con le rotaie incassate
      ctx.fillStyle = COBBLE;
      ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, 1);
      const q = 1 / 6;
      for (let j = 0; j < 6; j++) {
        const y = j * q;
        const off = (j % 2) * q * 0.5;
        for (let x = Math.floor(sp.x0) - off; x < sp.x1; x += q) {
          const v = hash(Math.round(x * 12), j + row * 7, 11);
          ctx.fillStyle = v < 0.3 ? '#b9b1a2' : v < 0.65 ? '#c4bcad' : '#aea697';
          rr(ctx, x + 0.012, y + 0.012, q - 0.024, q - 0.024, 0.035);
          ctx.fill();
        }
      }
      for (const ry of [0.32, 0.68]) {
        ctx.fillStyle = '#4a463f';
        ctx.fillRect(sp.x0, ry - 0.055, sp.x1 - sp.x0, 0.11);
        ctx.fillStyle = '#9c978d';
        ctx.fillRect(sp.x0, ry - 0.035, sp.x1 - sp.x0, 0.06);
        ctx.fillStyle = '#eceae4';
        ctx.fillRect(sp.x0, ry - 0.03, sp.x1 - sp.x0, 0.022);
      }
      break;
    }
  }
  for (const c of def.puddles) puddle(ctx, c);
}

const isRoadLike = (d?: RowDef) => !!d && (d.kind === 'road' || d.kind === 'bike');

/** Secondo passaggio: segnaletica e cordoli, disegnati sopra i bordi tra le corsie. */
function paintRowMarks(ctx: Ctx, rowAt: (i: number) => RowDef | undefined, row: number, sp: Span) {
  const def = rowAt(row)!;
  const above = rowAt(row + 1);
  const below = rowAt(row - 1);
  if (def.kind === 'road') {
    if (above?.kind === 'road') {
      if (above.dir === def.dir) dashed(ctx, sp, 0);
      else {
        solid(ctx, sp, -0.045);
        solid(ctx, sp, 0.045);
      }
    } else {
      solid(ctx, sp, 0.12);
    }
    if (below?.kind !== 'road') solid(ctx, sp, 0.88);
    if (def.busLane) {
      solid(ctx, sp, def.laneIndex === 0 ? 0.88 : 0.12, '#f7c948', 0.07);
      for (let x = Math.floor(sp.x0 / 6) * 6 + 2.5; x < sp.x1 + 2; x += 6) cellText(ctx, 'BUS', x, 0.52, 0.36, 600, 'rgba(247,201,72,0.9)');
    } else {
      for (let x = Math.floor(sp.x0 / 7) * 7 + 1.5 + (row % 3); x < sp.x1 + 2; x += 7) {
        arrow(ctx, x, 0.5, def.dir, 'rgba(244,241,234,0.55)');
      }
    }
  }
  if (def.kind === 'bike') {
    solid(ctx, sp, 0.06, '#f4f1ea', 0.04);
    solid(ctx, sp, 0.94, '#f4f1ea', 0.04);
    for (let x = Math.floor(sp.x0 / 5) * 5 + 1 + (row % 2) * 2.5; x < sp.x1 + 2; x += 5) {
      bikeStencil(ctx, x, 0.5);
      arrow(ctx, x + 0.8 * def.dir, 0.5, def.dir, 'rgba(255,255,255,0.7)');
    }
  }
  // cordoli tra zone pedonali/aiuole e carreggiata
  const walkable = def.kind === 'sidewalk' || def.kind === 'plaza' || def.kind === 'median';
  if (walkable) {
    const differs = (o: RowDef) => o.kind !== def.kind && !(o.kind === 'plaza' && def.kind === 'sidewalk') && !(o.kind === 'sidewalk' && def.kind === 'plaza');
    if (above && differs(above)) curb(ctx, sp, 0, true);
    if (below && differs(below)) curb(ctx, sp, 1, false);
  }
  if (def.kind === 'median') {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(sp.x0, 0.1, sp.x1 - sp.x0, 0.05);
  }
  if (def.kind === 'tram' && !isRoadLike(above) && above && above.kind !== 'median') curb(ctx, sp, 0, true);
}

// ------------------------------------------------------------------ palazzi

export type IconKind =
  | 'pharmacy'
  | 'bakery'
  | 'market'
  | 'post'
  | 'newsstand'
  | 'florist'
  | 'gelato'
  | 'home'
  | 'spool'
  | 'trattoria';

export function destIcon(ctx: Ctx, d: IconKind, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.lineWidth = 0.08;
  switch (d) {
    case 'pharmacy':
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.9);
      ctx.lineTo(0.3, -0.9);
      ctx.lineTo(0.3, -0.3);
      ctx.lineTo(0.9, -0.3);
      ctx.lineTo(0.9, 0.3);
      ctx.lineTo(0.3, 0.3);
      ctx.lineTo(0.3, 0.9);
      ctx.lineTo(-0.3, 0.9);
      ctx.lineTo(-0.3, 0.3);
      ctx.lineTo(-0.9, 0.3);
      ctx.lineTo(-0.9, -0.3);
      ctx.lineTo(-0.3, -0.3);
      ctx.closePath();
      fillInk(ctx, '#5fd37a', 0.1);
      break;
    case 'bakery':
      ellipse(ctx, 0, 0, 0.9, 0.5);
      fillInk(ctx, '#e0a15e', 0.1);
      ctx.strokeStyle = '#a86a32';
      ctx.beginPath();
      for (const dx of [-0.4, 0, 0.4]) {
        ctx.moveTo(dx - 0.12, -0.3);
        ctx.lineTo(dx + 0.12, 0.3);
      }
      ctx.stroke();
      break;
    case 'market':
      for (const [dx, c] of [
        [-0.45, '#e84a4a'],
        [0.45, '#f7c948'],
        [0, '#f58b3c'],
      ] as const) {
        circle(ctx, dx, dx === 0 ? -0.3 : 0.2, 0.45);
        fillInk(ctx, c, 0.1);
      }
      break;
    case 'post':
      rr(ctx, -0.9, -0.6, 1.8, 1.2, 0.15);
      fillInk(ctx, '#ffffff', 0.1);
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(-0.9, -0.55);
      ctx.lineTo(0, 0.1);
      ctx.lineTo(0.9, -0.55);
      ctx.stroke();
      break;
    case 'newsstand':
      rr(ctx, -0.8, -0.8, 1.4, 1.6, 0.1);
      fillInk(ctx, '#ffffff', 0.1);
      ctx.fillStyle = '#8b93a6';
      for (const dy of [-0.45, -0.15, 0.15, 0.45]) ctx.fillRect(-0.6, dy, 1.0, 0.12);
      break;
    case 'florist':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circle(ctx, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.35);
        fillInk(ctx, '#f28bb6', 0.08);
      }
      circle(ctx, 0, 0, 0.3);
      fillInk(ctx, '#f7c948', 0.08);
      break;
    case 'gelato':
      ctx.beginPath();
      ctx.moveTo(-0.45, -0.1);
      ctx.lineTo(0.45, -0.1);
      ctx.lineTo(0, 1);
      ctx.closePath();
      fillInk(ctx, '#e0a15e', 0.1);
      circle(ctx, 0, -0.45, 0.48);
      fillInk(ctx, '#f7b2c4', 0.1);
      break;
    case 'home':
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(0.95, -0.1);
      ctx.lineTo(0.7, -0.1);
      ctx.lineTo(0.7, 0.9);
      ctx.lineTo(-0.7, 0.9);
      ctx.lineTo(-0.7, -0.1);
      ctx.lineTo(-0.95, -0.1);
      ctx.closePath();
      fillInk(ctx, '#ffffff', 0.1);
      ctx.beginPath();
      ctx.moveTo(0, 0.05);
      ctx.bezierCurveTo(-0.35, -0.25, -0.35, 0.3, 0, 0.55);
      ctx.bezierCurveTo(0.35, 0.3, 0.35, -0.25, 0, 0.05);
      fillInk(ctx, '#e84a4a', 0.06);
      break;
    case 'spool':
      rr(ctx, -0.6, -0.9, 1.2, 0.25, 0.08);
      fillInk(ctx, '#c9975a', 0.1);
      rr(ctx, -0.6, 0.65, 1.2, 0.25, 0.08);
      fillInk(ctx, '#c9975a', 0.1);
      rr(ctx, -0.45, -0.65, 0.9, 1.3, 0.05);
      fillInk(ctx, '#e84a4a', 0.1);
      ctx.strokeStyle = '#b83535';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      for (let y = -0.5; y < 0.6; y += 0.2) {
        ctx.moveTo(-0.45, y);
        ctx.lineTo(0.45, y + 0.1);
      }
      ctx.stroke();
      break;
    case 'trattoria':
      circle(ctx, 0, 0.1, 0.8);
      fillInk(ctx, '#ffffff', 0.1);
      circle(ctx, 0, 0.1, 0.5);
      fillInk(ctx, '#f7c948', 0.06);
      ctx.strokeStyle = '#e84a4a';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.arc(0, 0.1, 0.28, 0, Math.PI * 1.6);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

export type Theme = 'home' | 'post' | 'haberdashery' | 'trattoria';

export interface BuildingStyle {
  theme: Theme;
  /** Scritta dell'insegna, già tradotta. */
  label: string;
  /** Scritta della lavagnetta o della targa accanto al portone. */
  note: string;
}

const THEMES: Record<Theme, { wall: string; sign: string; ink: string; awning: string[]; icon: IconKind; shutter: string }> = {
  home: { wall: '#f4b6a6', sign: '#8a5a3c', ink: '#fff4dc', awning: ['#f28bb6', '#ffffff'], icon: 'home', shutter: '#4f9a5a' },
  post: { wall: '#f5d76e', sign: '#2d3e8c', ink: '#f7c948', awning: ['#2d3e8c', '#ffffff'], icon: 'post', shutter: '#3d6fb8' },
  haberdashery: { wall: '#cbb8ea', sign: '#7b4fc4', ink: '#ffffff', awning: ['#9f86e0', '#ffffff'], icon: 'spool', shutter: '#5b3f8c' },
  trattoria: { wall: '#e8a07e', sign: '#2f7a45', ink: '#fff4dc', awning: ['#3fae5a', '#ffffff', '#e84a4a'], icon: 'trattoria', shutter: '#2f7a45' },
};

/** Finestra con persiane del colore del palazzo, tenda di pizzo e, a volte, gerani. */
function palWindow(ctx: Ctx, x: number, y: number, w: number, h: number, shutter: string, lace: boolean, flowers: boolean) {
  rr(ctx, x - 0.05, y - 0.05, w + 0.1, h + 0.1, 0.03);
  fillInk(ctx, '#f7efe2', 0.025);
  rr(ctx, x, y, w, h, 0.02);
  fillInk(ctx, '#9fc8e6', 0.02);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x + w * 0.15, y + h * 0.1, w * 0.1, h * 0.55);
  if (lace) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h * 0.28);
    for (let k = 4; k >= 0; k--) ctx.quadraticCurveTo(x + (w * (k + 0.5)) / 5, y + h * 0.4, x + (w * k) / 5, y + h * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  for (const sx of [x - w * 0.52, x + w + 0.02]) {
    rr(ctx, sx, y, w * 0.5, h, 0.02);
    fillInk(ctx, shutter, 0.02);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.014;
    ctx.beginPath();
    for (let ly = y + 0.07; ly < y + h - 0.02; ly += 0.07) {
      ctx.moveTo(sx + 0.025, ly);
      ctx.lineTo(sx + w * 0.5 - 0.025, ly);
    }
    ctx.stroke();
  }
  if (flowers) {
    rr(ctx, x - 0.06, y + h - 0.02, w + 0.12, 0.11, 0.03);
    fillInk(ctx, '#d9774a', 0.02);
    for (let i = 0; i < 4; i++) {
      const fx = x + (i * w) / 3;
      circle(ctx, fx, y + h - 0.05, 0.05);
      fillInk(ctx, i % 2 ? '#f28bb6' : '#e84a4a', 0.014);
    }
  }
}

function awning(ctx: Ctx, x0: number, x1: number, y: number, colors: string[]) {
  const n = Math.max(3, Math.round((x1 - x0) / 0.22));
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n;
    const b = x0 + ((x1 - x0) * (i + 1)) / n;
    ctx.beginPath();
    ctx.moveTo(a, y);
    ctx.lineTo(b, y);
    ctx.lineTo(b, y + 0.24);
    ctx.quadraticCurveTo((a + b) / 2, y + 0.34, a, y + 0.24);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.025;
  ctx.strokeRect(x0, y, x1 - x0, 0.24);
}

/** Vetrina a tema: quello che c'è dentro racconta il negozio. */
function vitrine(ctx: Ctx, x: number, y: number, w: number, h: number, theme: Theme, seed: number) {
  rr(ctx, x, y, w, h, 0.04);
  fillInk(ctx, '#bfe6ff');
  ctx.save();
  rr(ctx, x, y, w, h, 0.04);
  ctx.clip();
  if (theme === 'haberdashery') {
    // rocchetti di filo colorati e bottoni
    const cols = ['#e84a4a', '#f7c948', '#3d8bd9', '#3fae5a', '#f28bb6', '#9f86e0'];
    for (let i = 0; i < 6; i++) {
      const cx = x + 0.14 + (i % 3) * ((w - 0.28) / 2);
      const cy = y + h * 0.34 + Math.floor(i / 3) * h * 0.36;
      rr(ctx, cx - 0.07, cy - 0.1, 0.14, 0.2, 0.02);
      fillInk(ctx, '#c9975a', 0.015);
      rr(ctx, cx - 0.055, cy - 0.075, 0.11, 0.15, 0.02);
      fillInk(ctx, cols[(i + seed) % cols.length], 0.012);
    }
  } else if (theme === 'trattoria') {
    // bottiglie d'olio e forme di formaggio
    for (let i = 0; i < 3; i++) {
      const cx = x + 0.18 + i * ((w - 0.36) / 2);
      circle(ctx, cx, y + h * 0.72, 0.12);
      fillInk(ctx, '#f2c14e', 0.018);
      rr(ctx, cx - 0.035, y + h * 0.18, 0.07, h * 0.4, 0.02);
      fillInk(ctx, '#6f8f3a', 0.015);
    }
  } else if (theme === 'post') {
    // pacchi e lettere
    rr(ctx, x + 0.1, y + h * 0.45, w * 0.4, h * 0.45, 0.02);
    fillInk(ctx, '#c9975a', 0.018);
    rr(ctx, x + w * 0.55, y + h * 0.3, w * 0.3, h * 0.25, 0.02);
    fillInk(ctx, '#ffffff', 0.018);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.55, y + h * 0.3);
    ctx.lineTo(x + w * 0.7, y + h * 0.43);
    ctx.lineTo(x + w * 0.85, y + h * 0.3);
    ctx.stroke();
  } else {
    // casa: tendine e una pianta
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w * 0.28, h);
    ctx.fillRect(x + w * 0.72, y, w * 0.28, h);
    rr(ctx, x + w * 0.4, y + h * 0.62, w * 0.2, h * 0.3, 0.02);
    fillInk(ctx, '#d9774a', 0.015);
    circle(ctx, x + w * 0.5, y + h * 0.5, 0.13);
    fillInk(ctx, '#5fb06a', 0.015);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x + 0.08, y + 0.05, 0.06, h - 0.1);
  ctx.restore();
}

/**
 * Il palazzo della sosta, largo quanto la strada, con il portone al centro.
 * y cresce verso il basso: 0 è il cornicione, BUILDING_HEIGHT il filo della piazza.
 */
function paintPalazzo(ctx: Ctx, x0: number, x1: number, st: BuildingStyle, seed: number) {
  const H = BUILDING_HEIGHT;
  const th = THEMES[st.theme];
  const door = DOOR_COL + 0.5;
  // tetto di coppi, comignoli e antenna
  ctx.fillStyle = '#c8664a';
  ctx.fillRect(x0 - 0.1, -0.34, x1 - x0 + 0.2, 0.34);
  ctx.fillStyle = '#b55a40';
  for (let x = x0; x < x1; x += 0.2) ctx.fillRect(x, -0.34, 0.035, 0.34);
  for (const cx of [1.4, 7.6]) {
    rr(ctx, cx - 0.14, -0.62, 0.28, 0.34, 0.03);
    fillInk(ctx, '#b55a40');
    rr(ctx, cx - 0.18, -0.68, 0.36, 0.1, 0.03);
    fillInk(ctx, '#9e4d37');
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  ctx.moveTo(6.2, -0.34);
  ctx.lineTo(6.2, -0.8);
  ctx.moveTo(5.95, -0.72);
  ctx.lineTo(6.45, -0.72);
  ctx.moveTo(6.02, -0.62);
  ctx.lineTo(6.38, -0.62);
  ctx.stroke();

  // muri
  ctx.fillStyle = th.wall;
  ctx.fillRect(x0, 0, x1 - x0, H);
  // cornicione con i dentelli
  ctx.fillStyle = shade(th.wall, -0.16);
  ctx.fillRect(x0 - 0.1, 0, x1 - x0 + 0.2, 0.12);
  ctx.fillStyle = shade(th.wall, 0.25);
  for (let x = x0; x < x1; x += 0.16) ctx.fillRect(x, 0.12, 0.08, 0.06);
  // marcapiani
  ctx.fillStyle = shade(th.wall, 0.3);
  ctx.fillRect(x0, 0.98, x1 - x0, 0.07);
  ctx.fillRect(x0, 1.9, x1 - x0, 0.08);

  // finestre in asse col portone, una ogni campata e mezza
  const bays: number[] = [];
  for (let k = -6; k <= 6; k++) {
    const x = door + k * 1.5;
    if (x > x0 + 0.4 && x < x1 - 0.4) bays.push(x);
  }
  // secondo piano
  for (const x of bays) {
    const r = hash(seed, Math.round(x * 10), 1);
    palWindow(ctx, x - 0.22, 0.3, 0.44, 0.54, th.shutter, st.theme === 'home' || r < 0.3, r > 0.55);
  }
  // primo piano, con il balcone sopra il portone
  for (const x of bays) {
    if (Math.abs(x - door) < 0.6) continue;
    const r = hash(seed, Math.round(x * 10), 2);
    palWindow(ctx, x - 0.24, 1.18, 0.48, 0.58, th.shutter, st.theme === 'home' || r < 0.25, r > 0.35);
  }
  palWindow(ctx, door - 0.24, 1.14, 0.48, 0.62, th.shutter, st.theme === 'home', false);
  rr(ctx, door - 0.7, 1.74, 1.4, 0.09, 0.02);
  fillInk(ctx, '#e9e2d4', 0.022);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.02;
  ctx.strokeRect(door - 0.66, 1.52, 1.32, 0.22);
  ctx.beginPath();
  for (let x = door - 0.6; x < door + 0.62; x += 0.12) {
    ctx.moveTo(x, 1.52);
    ctx.lineTo(x, 1.74);
  }
  ctx.stroke();
  for (const fx of [door - 0.55, door + 0.55]) {
    rr(ctx, fx - 0.1, 1.42, 0.2, 0.12, 0.03);
    fillInk(ctx, '#d9774a', 0.018);
    circle(ctx, fx, 1.4, 0.09);
    fillInk(ctx, '#5fb06a', 0.018);
    circle(ctx, fx - 0.03, 1.36, 0.035);
    fillInk(ctx, '#e84a4a', 0.01);
  }
  if (st.theme === 'home') {
    // i panni stesi della nonna
    ctx.strokeStyle = '#6b6b7a';
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(1.3, 0.86);
    ctx.quadraticCurveTo(2.25, 1.0, 3.2, 0.86);
    ctx.stroke();
    ['#f28bb6', '#ffffff', '#5aa9f0', '#f7c948'].forEach((c, i) => {
      rr(ctx, 1.55 + i * 0.42, 0.9 + Math.sin(i) * 0.01, 0.26, 0.3, 0.03);
      fillInk(ctx, c, 0.016);
    });
  }

  // piano terra a bugnato
  const g0 = 1.98;
  ctx.fillStyle = shade(th.wall, -0.08);
  ctx.fillRect(x0, g0, x1 - x0, H - g0);
  ctx.strokeStyle = shade(th.wall, -0.22);
  ctx.lineWidth = 0.015;
  ctx.beginPath();
  for (let y = g0 + 0.2; y < H; y += 0.2) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    const off = Math.round((y - g0) / 0.2) % 2 ? 0.3 : 0;
    for (let x = x0 + off; x < x1; x += 0.6) {
      ctx.moveTo(x, y - 0.2);
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // insegna sopra il portone
  const sw = 3.6;
  rr(ctx, door - sw / 2, g0 + 0.06, sw, 0.42, 0.08);
  fillInk(ctx, th.sign);
  ctx.strokeStyle = shade(th.sign, 0.35);
  ctx.lineWidth = 0.02;
  rr(ctx, door - sw / 2 + 0.05, g0 + 0.11, sw - 0.1, 0.32, 0.06);
  ctx.stroke();
  cellText(ctx, st.label, door, g0 + 0.27, 0.25, 700, th.ink, sw - 0.9);
  destIcon(ctx, th.icon, door - sw / 2 + 0.26, g0 + 0.27, 0.12);
  destIcon(ctx, th.icon, door + sw / 2 - 0.26, g0 + 0.27, 0.12);

  // portone: stipiti di pietra, battenti aperti e luce calda dentro
  const dw = 1.2;
  const dt = H - 1.02;
  rr(ctx, door - dw / 2 - 0.12, dt - 0.1, dw + 0.24, H - dt + 0.1, 0.05);
  fillInk(ctx, '#e9e2d4');
  const glow = ctx.createLinearGradient(0, dt, 0, H);
  glow.addColorStop(0, '#6b4a2e');
  glow.addColorStop(1, '#f2c77a');
  ctx.fillStyle = glow;
  ctx.fillRect(door - dw / 2, dt, dw, H - dt);
  ctx.fillStyle = 'rgba(255,236,170,0.45)';
  ctx.beginPath();
  ctx.moveTo(door - 0.3, H);
  ctx.lineTo(door + 0.3, H);
  ctx.lineTo(door + 0.18, dt + 0.3);
  ctx.lineTo(door - 0.18, dt + 0.3);
  ctx.closePath();
  ctx.fill();
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(door + (sgn * dw) / 2, dt);
    ctx.lineTo(door + sgn * (dw / 2 - 0.2), dt + 0.08);
    ctx.lineTo(door + sgn * (dw / 2 - 0.2), H - 0.02);
    ctx.lineTo(door + (sgn * dw) / 2, H);
    ctx.closePath();
    fillInk(ctx, '#7a4b2a', 0.025);
    circle(ctx, door + sgn * (dw / 2 - 0.14), dt + 0.55, 0.025);
    fillInk(ctx, '#f7c948', 0.012);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.03;
  ctx.strokeRect(door - dw / 2, dt, dw, H - dt);
  // lanterne ai lati
  for (const sgn of [-1, 1]) {
    const lx = door + sgn * (dw / 2 + 0.34);
    ctx.fillStyle = INK;
    ctx.fillRect(lx - 0.012, dt - 0.02, 0.024, 0.12);
    rr(ctx, lx - 0.07, dt + 0.08, 0.14, 0.18, 0.03);
    fillInk(ctx, '#ffe89a', 0.018);
  }

  // vetrine laterali con le tende
  const vw = Math.min(1.5, door - dw / 2 - 0.8 - 0.4);
  for (const vx of [door - dw / 2 - 0.6 - vw, door + dw / 2 + 0.6]) {
    awning(ctx, vx - 0.08, vx + vw + 0.08, g0 + 0.58, th.awning);
    vitrine(ctx, vx, g0 + 0.9, vw, 0.56, st.theme, seed);
  }
  // un dettaglio per ogni palazzo
  if (st.theme === 'post') {
    // cassetta postale rossa
    const bx = door + dw / 2 + 0.3;
    rr(ctx, bx - 0.13, H - 0.52, 0.26, 0.36, 0.06);
    fillInk(ctx, '#e0443c');
    ctx.fillStyle = INK;
    ctx.fillRect(bx - 0.08, H - 0.44, 0.16, 0.025);
    ctx.fillStyle = '#4a3b3b';
    ctx.fillRect(bx - 0.02, H - 0.16, 0.04, 0.16);
  } else if (st.theme === 'trattoria' || st.theme === 'haberdashery') {
    // lavagnetta sul marciapiede
    const bx = door - dw / 2 - 0.34;
    ctx.strokeStyle = '#8a5a3c';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(bx - 0.14, H);
    ctx.lineTo(bx, H - 0.5);
    ctx.lineTo(bx + 0.14, H);
    ctx.stroke();
    rr(ctx, bx - 0.15, H - 0.5, 0.3, 0.34, 0.03);
    fillInk(ctx, '#2f3b36', 0.02);
    cellText(ctx, st.note, bx, H - 0.33, 0.07, 600, '#ffffff', 0.26);
  } else {
    // targa di ceramica col nome della nonna
    const bx = door + dw / 2 + 0.3;
    rr(ctx, bx - 0.16, dt + 0.34, 0.32, 0.2, 0.04);
    fillInk(ctx, '#fdfaf3', 0.02);
    ctx.strokeStyle = '#3d6fb8';
    ctx.lineWidth = 0.015;
    rr(ctx, bx - 0.13, dt + 0.37, 0.26, 0.14, 0.03);
    ctx.stroke();
    cellText(ctx, st.note, bx, dt + 0.44, 0.06, 600, '#3d6fb8', 0.22);
  }
  // zoccolo
  ctx.fillStyle = shade(th.wall, -0.28);
  ctx.fillRect(x0, H - 0.1, x1 - x0, 0.1);
}

/** Tetti di coppi sotto il marciapiede di partenza: il quartiere della nonna. y cresce verso il basso da 0. */
function paintRoofs(ctx: Ctx, sp: Span, rowsDown: number, seed: number) {
  ctx.fillStyle = '#e9dfcc';
  ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, 0.5);
  ctx.fillStyle = '#cbbfa6';
  ctx.fillRect(sp.x0, 0.42, sp.x1 - sp.x0, 0.08);
  ctx.fillStyle = shade('#c8664a', -0.25);
  ctx.fillRect(sp.x0, 0.5, sp.x1 - sp.x0, 0.14);
  for (let y = 0.64; y < rowsDown; y += 0.32) {
    const off = (Math.round(y / 0.32) % 2) * 0.16;
    ctx.fillStyle = '#c8664a';
    ctx.fillRect(sp.x0, y, sp.x1 - sp.x0, 0.32);
    for (let x = Math.floor(sp.x0) - off; x < sp.x1; x += 0.32) {
      rr(ctx, x + 0.02, y + 0.02, 0.28, 0.3, 0.12);
      ctx.fillStyle = hash(Math.round(x * 10), Math.round(y * 10), seed) < 0.5 ? '#d9774a' : '#cf6d44';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 0.08, y + 0.05, 0.05, 0.2);
    }
  }
  // comignoli e un gatto che dorme al sole
  for (let i = 0; i < 3; i++) {
    const cx = sp.x0 + 1 + hash(seed, i, 40) * (sp.x1 - sp.x0 - 2);
    const cy = 1.6 + i * 2.2 + hash(seed, i, 41);
    rr(ctx, cx - 0.2, cy - 0.5, 0.4, 0.6, 0.04);
    fillInk(ctx, '#b55a40');
    rr(ctx, cx - 0.26, cy - 0.58, 0.52, 0.14, 0.04);
    fillInk(ctx, '#9e4d37');
  }
  const catX = sp.x0 + 1.2 + hash(seed, 9, 9) * 2;
  const catY = 2.6;
  ellipse(ctx, catX, catY, 0.32, 0.18);
  fillInk(ctx, '#f2a65a');
  circle(ctx, catX + 0.3, catY - 0.08, 0.14);
  fillInk(ctx, '#f2a65a');
  ctx.fillStyle = '#f2a65a';
  ctx.beginPath();
  ctx.moveTo(catX + 0.2, catY - 0.18);
  ctx.lineTo(catX + 0.22, catY - 0.32);
  ctx.lineTo(catX + 0.3, catY - 0.2);
  ctx.moveTo(catX + 0.34, catY - 0.2);
  ctx.lineTo(catX + 0.42, catY - 0.32);
  ctx.lineTo(catX + 0.44, catY - 0.16);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(catX + 0.24, catY - 0.08);
  ctx.lineTo(catX + 0.29, catY - 0.07);
  ctx.moveTo(catX + 0.33, catY - 0.07);
  ctx.lineTo(catX + 0.38, catY - 0.08);
  ctx.stroke();
  ctx.strokeStyle = '#f2a65a';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(catX - 0.3, catY + 0.05);
  ctx.quadraticCurveTo(catX - 0.5, catY + 0.2, catX - 0.3, catY + 0.3);
  ctx.stroke();
}

/** Quante fette sono state disegnate e quanto tempo ci è voluto (per le misure di fluidità). */
export const bgStats = { chunks: 0, ms: 0 };

interface Chunk {
  y0: number;
  canvas: HTMLCanvasElement;
}

/**
 * Sfondo della strada infinita: le fette si disegnano quando stanno per entrare
 * in scena e si buttano quando sono rimaste indietro.
 */
export class Background {
  private chunks = new Map<number, Chunk>();

  constructor(
    private readonly world: World,
    /** pixel per cella (già moltiplicati per il devicePixelRatio) */
    private readonly s: number,
    private readonly xLeft: number,
    private readonly xRight: number,
    private readonly styleOf: (stop: Stop) => BuildingStyle,
  ) {}

  private rowAt = (i: number): RowDef | undefined => (i < 0 ? undefined : this.world.row(i));

  private paintChunk(y0: number): HTMLCanvasElement {
    const s = this.s;
    const canvas = makeCanvas((this.xRight - this.xLeft) * s, CHUNK_ROWS * s);
    const ctx = ctx2d(canvas);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const top = y0 + CHUNK_ROWS;
    const sp: Span = { x0: this.xLeft - 0.5, x1: this.xRight + 0.5 };
    const rowTransform = (r: number) => ctx.setTransform(s, 0, 0, s, -this.xLeft * s, (top - (r + 1)) * s);
    const r0 = Math.max(0, y0 - 1);
    const r1 = top + 1;
    if (r1 >= 0) {
      for (let r = r0; r <= r1; r++) {
        rowTransform(r);
        paintRowBase(ctx, this.rowAt(r)!, r, sp);
      }
      for (let r = r0; r <= r1; r++) {
        rowTransform(r);
        paintRowMarks(ctx, this.rowAt, r, sp);
      }
    }
    // palazzi delle soste (sporgono nelle fette vicine)
    for (const stop of this.world.stops) {
      const base = doorRow(stop);
      if (base > top + 0.5 || base + BUILDING_HEIGHT + 0.9 < y0) continue;
      ctx.setTransform(s, 0, 0, s, -this.xLeft * s, (top - (base + BUILDING_HEIGHT)) * s);
      paintPalazzo(ctx, this.xLeft - 0.5, this.xRight + 0.5, this.styleOf(stop), stop.entry * 13 + 5);
    }
    // tetti sotto la partenza
    if (y0 < 0) {
      ctx.setTransform(s, 0, 0, s, -this.xLeft * s, top * s);
      paintRoofs(ctx, sp, -y0 + 1, 7);
    }
    return canvas;
  }

  private ensureChunk(y0: number) {
    let ch = this.chunks.get(y0);
    if (!ch) {
      const t0 = performance.now();
      ch = { y0, canvas: this.paintChunk(y0) };
      bgStats.chunks++;
      bgStats.ms += performance.now() - t0;
      this.chunks.set(y0, ch);
    }
    return ch;
  }

  /** Disegna le fette visibili. `yBottom` è la y del mondo al bordo inferiore, `screenH` in pixel. */
  draw(ctx: Ctx, yBottom: number, screenH: number) {
    const s = this.s;
    const yTop = yBottom + screenH / s;
    const first = Math.floor(yBottom / CHUNK_ROWS) * CHUNK_ROWS;
    for (let y0 = first; y0 < yTop; y0 += CHUNK_ROWS) {
      const ch = this.ensureChunk(y0);
      const dy = Math.round(screenH - (y0 + CHUNK_ROWS - yBottom) * s);
      ctx.drawImage(ch.canvas, 0, dy);
    }
    // si prepara in anticipo la fetta successiva, e si libera la memoria di quelle passate
    const ahead = Math.floor(yTop / CHUNK_ROWS) * CHUNK_ROWS + CHUNK_ROWS;
    if (!this.chunks.has(ahead)) this.ensureChunk(ahead);
    for (const [y0, ch] of this.chunks) {
      if (y0 + CHUNK_ROWS < yBottom - CHUNK_ROWS * 2 || y0 > ahead + CHUNK_ROWS) {
        ch.canvas.width = 0;
        ch.canvas.height = 0;
        this.chunks.delete(y0);
      }
    }
  }

  dispose() {
    // Su iOS la memoria dei canvas si libera prima azzerandone le dimensioni.
    for (const ch of this.chunks.values()) {
      ch.canvas.width = 0;
      ch.canvas.height = 0;
    }
    this.chunks.clear();
  }
}
