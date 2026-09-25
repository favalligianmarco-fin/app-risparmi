import { COLS } from '../levels';
import type { Destination, LevelDef, RowDef } from '../levels';
import { INK, cellText, circle, ctx2d, ellipse, fillInk, makeCanvas, rr, shade } from './paint';
import type { Ctx } from './paint';

/**
 * Scenografia statica del livello (strade, marciapiedi, aiuole, palazzi) disegnata
 * una volta sola in "fette" orizzontali: a ogni frame basta copiarne due o tre.
 */

const CHUNK_ROWS = 6;
export const FACADE_ROWS = 8;

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
    case 'goal':
      sidewalkTiles(ctx, sp, row);
      break;
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
function paintRowMarks(ctx: Ctx, rows: RowDef[], row: number, sp: Span) {
  const def = rows[row];
  const above = rows[row + 1];
  const below = rows[row - 1];
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
  const walkable = def.kind === 'sidewalk' || def.kind === 'goal' || def.kind === 'median';
  if (walkable) {
    if (above && above.kind !== def.kind) curb(ctx, sp, 0, true);
    if (below && below.kind !== def.kind) curb(ctx, sp, 1, false);
  }
  if (def.kind === 'median') {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(sp.x0, 0.1, sp.x1 - sp.x0, 0.05);
  }
  if (def.kind === 'tram' && !isRoadLike(above) && above && above.kind !== 'median') curb(ctx, sp, 0, true);
}

// ------------------------------------------------------------------ palazzi

const WALLS = ['#f2c48d', '#e8a488', '#f5dd9d', '#efb3a5', '#e7c9a0', '#f0d0b0'];
const SHUTTER = '#4f9a5a';

export interface DestinationStyle {
  sign: string;
  color: string;
  label: string;
}

export const DEST_STYLE: Record<Destination, { sign: string; color: string }> = {
  pharmacy: { sign: '#3fae5a', color: '#ffffff' },
  bakery: { sign: '#c98a4b', color: '#fff4dc' },
  market: { sign: '#e8763f', color: '#ffffff' },
  church: { sign: '#b9a17f', color: '#fff8e8' },
  post: { sign: '#f7c948', color: '#2d3e8c' },
  hairdresser: { sign: '#f28bb6', color: '#ffffff' },
  newsstand: { sign: '#3d8bd9', color: '#ffffff' },
  florist: { sign: '#9f86e0', color: '#ffffff' },
  gelato: { sign: '#5fd3b0', color: '#ffffff' },
  cafe: { sign: '#6b3f25', color: '#ffe9c9' },
  library: { sign: '#8e3b46', color: '#fff4dc' },
  bocce: { sign: '#3f8f4f', color: '#ffffff' },
};

function window2(ctx: Ctx, x: number, y: number, w: number, h: number, open: boolean, flower: boolean) {
  rr(ctx, x - 0.04, y - 0.04, w + 0.08, h + 0.08, 0.03);
  fillInk(ctx, '#f7efe2', 0.025);
  rr(ctx, x, y, w, h, 0.02);
  fillInk(ctx, open ? '#3a3950' : '#bfe6ff', 0.02);
  if (!open) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x + w * 0.15, y + h * 0.1, w * 0.12, h * 0.6);
  }
  // persiane verdi
  for (const sx of open ? [x - w * 0.5 - 0.02, x + w + 0.02] : [x, x + w / 2]) {
    rr(ctx, sx, y, w / 2, h, 0.02);
    fillInk(ctx, SHUTTER, 0.02);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.015;
    for (let ly = y + 0.08; ly < y + h - 0.02; ly += 0.08) {
      ctx.beginPath();
      ctx.moveTo(sx + 0.03, ly);
      ctx.lineTo(sx + w / 2 - 0.03, ly);
      ctx.stroke();
    }
  }
  if (flower) {
    rr(ctx, x - 0.06, y + h - 0.04, w + 0.12, 0.12, 0.03);
    fillInk(ctx, '#d9774a', 0.02);
    for (let fx = x; fx <= x + w; fx += w / 3) {
      circle(ctx, fx, y + h - 0.07, 0.05);
      fillInk(ctx, hash(Math.round(fx * 10), Math.round(y * 10)) < 0.5 ? '#e84a4a' : '#f28bb6', 0.015);
    }
  }
}

function destIcon(ctx: Ctx, d: Destination, x: number, y: number, r: number) {
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
    case 'church':
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(0.7, -0.3);
      ctx.lineTo(0.7, 0.9);
      ctx.lineTo(-0.7, 0.9);
      ctx.lineTo(-0.7, -0.3);
      ctx.closePath();
      fillInk(ctx, '#fff8e8', 0.1);
      circle(ctx, 0, 0.05, 0.25);
      fillInk(ctx, '#f7c948', 0.08);
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
    case 'hairdresser':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.18;
      circle(ctx, -0.45, 0.55, 0.3);
      ctx.stroke();
      circle(ctx, 0.45, 0.55, 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.3, 0.3);
      ctx.lineTo(0.5, -0.9);
      ctx.moveTo(0.3, 0.3);
      ctx.lineTo(-0.5, -0.9);
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
    case 'cafe':
      rr(ctx, -0.7, -0.5, 1.1, 1.0, 0.3);
      fillInk(ctx, '#ffffff', 0.1);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.18;
      ctx.beginPath();
      ctx.arc(0.5, 0, 0.3, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      break;
    case 'library':
      for (const [dx, c] of [
        [-0.55, '#e84a4a'],
        [0, '#5aa9f0'],
        [0.55, '#f7c948'],
      ] as const) {
        rr(ctx, dx - 0.22, -0.9, 0.44, 1.8, 0.08);
        fillInk(ctx, c, 0.1);
      }
      break;
    case 'bocce':
      for (const [dx, c] of [
        [-0.5, '#e84a4a'],
        [0.5, '#5aa9f0'],
      ] as const) {
        circle(ctx, dx, 0.2, 0.5);
        fillInk(ctx, c, 0.1);
      }
      circle(ctx, 0, -0.55, 0.22);
      fillInk(ctx, '#ffffff', 0.08);
      break;
  }
  ctx.restore();
}

/**
 * Facciate dei palazzi sopra il marciapiede d'arrivo. y cresce verso il basso,
 * y = FACADE_ROWS è il filo del marciapiede.
 */
function paintFacade(ctx: Ctx, sp: Span, dest: Destination, label: string, seed: number) {
  const base = FACADE_ROWS;
  // cielo
  const g = ctx.createLinearGradient(0, 0, 0, base);
  g.addColorStop(0, '#6ec3f0');
  g.addColorStop(1, '#bfe8fb');
  ctx.fillStyle = g;
  ctx.fillRect(sp.x0, 0, sp.x1 - sp.x0, base);
  // nuvolette
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) {
    const cx = sp.x0 + hash(seed, i, 1) * (sp.x1 - sp.x0);
    const cy = 0.4 + hash(seed, i, 2) * 1.2;
    circle(ctx, cx, cy, 0.3);
    ctx.fill();
    circle(ctx, cx + 0.3, cy + 0.05, 0.22);
    ctx.fill();
    circle(ctx, cx - 0.3, cy + 0.08, 0.2);
    ctx.fill();
  }

  const shopL = COLS / 2 - 2;
  const shopR = COLS / 2 + 2;
  // palazzi a sinistra e a destra (anche oltre i bordi, per gli schermi larghi)
  const blocks: { x0: number; x1: number; h: number; wall: string }[] = [];
  let k = 0;
  for (let x = shopL; x > sp.x0 - 4; k++) {
    const w = 2.5 + hash(seed, k, 9) * 1.2;
    blocks.push({ x0: x - w, x1: x, h: 5 + hash(seed, k, 3) * 1.6, wall: WALLS[(seed + k) % WALLS.length] });
    x -= w;
  }
  for (let x = shopR; x < sp.x1 + 4; k++) {
    const w = 2.5 + hash(seed, k, 9) * 1.2;
    blocks.push({ x0: x, x1: x + w, h: 4.8 + hash(seed, k, 3) * 1.6, wall: WALLS[(seed + k) % WALLS.length] });
    x += w;
  }
  for (const b of blocks) {
    const top = base - b.h;
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x0, top, b.x1 - b.x0, b.h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.03;
    ctx.strokeRect(b.x0, top, b.x1 - b.x0, b.h);
    // cornicione
    ctx.fillStyle = shade(b.wall, -0.15);
    ctx.fillRect(b.x0 - 0.05, top, b.x1 - b.x0 + 0.1, 0.18);
    // tegole
    ctx.fillStyle = '#c8664a';
    ctx.fillRect(b.x0 - 0.05, top - 0.22, b.x1 - b.x0 + 0.1, 0.22);
    ctx.fillStyle = '#b55a40';
    for (let x = b.x0; x < b.x1; x += 0.22) ctx.fillRect(x, top - 0.22, 0.04, 0.22);
    // piani con finestre
    const cols = Math.max(1, Math.floor((b.x1 - b.x0) / 1.2));
    const pitch = (b.x1 - b.x0) / cols;
    for (let fy = top + 0.55; fy < base - 2.4; fy += 1.45) {
      for (let c = 0; c < cols; c++) {
        const wx = b.x0 + pitch * c + pitch / 2 - 0.22;
        const hv = hash(Math.round(wx * 10), Math.round(fy * 10), seed);
        window2(ctx, wx, fy, 0.44, 0.7, hv < 0.3, hv > 0.55);
      }
    }
    // piano terra: portone
    const dx = (b.x0 + b.x1) / 2;
    rr(ctx, dx - 0.35, base - 1.35, 0.7, 1.35, 0.3);
    fillInk(ctx, '#7a4b2a');
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(dx, base - 1.2);
    ctx.lineTo(dx, base);
    ctx.stroke();
    // zoccolo
    ctx.fillStyle = shade(b.wall, -0.2);
    ctx.fillRect(b.x0, base - 0.25, b.x1 - b.x0, 0.25);
  }
  // panni stesi tra due finestre: un tocco di quartiere
  const lineY = base - 3.4;
  ctx.strokeStyle = '#6b6b7a';
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(shopL - 2.2, lineY);
  ctx.quadraticCurveTo(shopL - 1.1, lineY + 0.2, shopL - 0.1, lineY);
  ctx.stroke();
  for (const [i, c] of (['#f28bb6', '#ffffff', '#5aa9f0', '#f7c948'] as const).entries()) {
    const cx = shopL - 1.9 + i * 0.45;
    rr(ctx, cx, lineY + 0.05, 0.3, 0.38, 0.04);
    fillInk(ctx, c, 0.02);
  }

  // il negozio di destinazione
  const style = DEST_STYLE[dest];
  const top = base - 6.2;
  ctx.fillStyle = '#f7ead6';
  ctx.fillRect(shopL, top, shopR - shopL, 6.2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.03;
  ctx.strokeRect(shopL, top, shopR - shopL, 6.2);
  ctx.fillStyle = '#e3d3b8';
  ctx.fillRect(shopL - 0.05, top, shopR - shopL + 0.1, 0.18);
  ctx.fillStyle = '#c8664a';
  ctx.fillRect(shopL - 0.05, top - 0.22, shopR - shopL + 0.1, 0.22);
  for (let fy = top + 0.6; fy < base - 2.6; fy += 1.45) {
    for (let c = 0; c < 3; c++) window2(ctx, shopL + 0.45 + c * 1.2, fy, 0.44, 0.7, false, c === 1);
  }
  // insegna
  rr(ctx, shopL + 0.15, base - 2.55, shopR - shopL - 0.3, 0.62, 0.1);
  fillInk(ctx, style.sign);
  cellText(ctx, label, COLS / 2, base - 2.22, 0.36, 700, style.color, shopR - shopL - 1.5);
  destIcon(ctx, dest, shopL + 0.55, base - 2.24, 0.2);
  destIcon(ctx, dest, shopR - 0.55, base - 2.24, 0.2);
  // tenda a strisce
  const awTop = base - 1.85;
  for (let i = 0; i < 8; i++) {
    const x0 = shopL + 0.1 + (i * (shopR - shopL - 0.2)) / 8;
    const x1 = shopL + 0.1 + ((i + 1) * (shopR - shopL - 0.2)) / 8;
    ctx.beginPath();
    ctx.moveTo(x0, awTop);
    ctx.lineTo(x1, awTop);
    ctx.lineTo(x1, awTop + 0.35);
    ctx.quadraticCurveTo((x0 + x1) / 2, awTop + 0.5, x0, awTop + 0.35);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#ffffff' : style.sign;
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.03;
  ctx.strokeRect(shopL + 0.1, awTop, shopR - shopL - 0.2, 0.35);
  // vetrine e porta
  for (const vx of [shopL + 0.3, shopR - 1.55]) {
    rr(ctx, vx, base - 1.35, 1.25, 1.1, 0.06);
    fillInk(ctx, '#bfe6ff');
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(vx + 0.15, base - 1.25, 0.12, 0.8);
    destIcon(ctx, dest, vx + 0.75, base - 0.75, 0.22);
  }
  rr(ctx, COLS / 2 - 0.4, base - 1.45, 0.8, 1.45, 0.08);
  fillInk(ctx, '#7a4b2a');
  rr(ctx, COLS / 2 - 0.3, base - 1.35, 0.6, 0.8, 0.05);
  fillInk(ctx, '#bfe6ff', 0.025);
  circle(ctx, COLS / 2 + 0.22, base - 0.6, 0.04);
  fillInk(ctx, '#f7c948', 0.02);
  ctx.fillStyle = shade('#f7ead6', -0.2);
  ctx.fillRect(shopL, base - 0.2, shopR - shopL, 0.2);
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

interface Chunk {
  y0: number;
  canvas: HTMLCanvasElement;
}

export class Background {
  private chunks: Chunk[] = [];

  constructor(
    private readonly level: LevelDef,
    /** pixel per cella (già moltiplicati per il devicePixelRatio) */
    private readonly s: number,
    private readonly xLeft: number,
    private readonly xRight: number,
    yMin: number,
    yMax: number,
    private readonly label: string,
  ) {
    const start = Math.floor(yMin / CHUNK_ROWS) * CHUNK_ROWS;
    for (let y0 = start; y0 < yMax; y0 += CHUNK_ROWS) this.chunks.push({ y0, canvas: this.paintChunk(y0) });
  }

  private paintChunk(y0: number): HTMLCanvasElement {
    const s = this.s;
    const rows = this.level.rows;
    const canvas = makeCanvas((this.xRight - this.xLeft) * s, CHUNK_ROWS * s);
    const ctx = ctx2d(canvas);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const top = y0 + CHUNK_ROWS;
    const sp: Span = { x0: this.xLeft - 0.5, x1: this.xRight + 0.5 };
    const rowTransform = (r: number) => ctx.setTransform(s, 0, 0, s, -this.xLeft * s, (top - (r + 1)) * s);
    const r0 = Math.max(0, Math.floor(y0) - 1);
    const r1 = Math.min(rows.length - 1, Math.ceil(top) + 1);
    for (let r = r0; r <= r1; r++) {
      rowTransform(r);
      paintRowBase(ctx, rows[r], r, sp);
    }
    for (let r = r0; r <= r1; r++) {
      rowTransform(r);
      paintRowMarks(ctx, rows, r, sp);
    }
    const seed = this.level.n * 31 + 7;
    // facciate sopra l'arrivo
    const facadeTop = rows.length + FACADE_ROWS;
    if (top > rows.length) {
      ctx.setTransform(s, 0, 0, s, -this.xLeft * s, (top - facadeTop) * s);
      paintFacade(ctx, sp, this.level.destination, this.label, seed);
      if (top > facadeTop) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#6ec3f0';
        ctx.fillRect(0, 0, canvas.width, (top - facadeTop) * s + 1);
      }
    }
    // tetti sotto la partenza
    if (y0 < 0) {
      ctx.setTransform(s, 0, 0, s, -this.xLeft * s, top * s);
      paintRoofs(ctx, sp, -y0 + 1, seed);
    }
    return canvas;
  }

  /** Disegna le fette visibili. `yBottom` è la y del mondo al bordo inferiore, `screenH` in pixel. */
  draw(ctx: Ctx, yBottom: number, screenH: number) {
    const s = this.s;
    const yTop = yBottom + screenH / s;
    for (const ch of this.chunks) {
      if (ch.y0 + CHUNK_ROWS < yBottom || ch.y0 > yTop) continue;
      const dy = Math.round(screenH - (ch.y0 + CHUNK_ROWS - yBottom) * s);
      ctx.drawImage(ch.canvas, 0, dy);
    }
  }

  dispose() {
    // Su iOS la memoria dei canvas si libera prima azzerandone le dimensioni.
    for (const ch of this.chunks) {
      ch.canvas.width = 0;
      ch.canvas.height = 0;
    }
    this.chunks = [];
  }
}
