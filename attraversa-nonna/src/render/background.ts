import type { RowDef, Stop, World } from '../world';
import { INK, cellText, circle, ctx2d, ellipse, fillInk, makeCanvas, rr, shade } from './paint';
import type { Ctx } from './paint';

/**
 * Scenografia statica del livello (strade, marciapiedi, aiuole, palazzi) disegnata
 * una volta sola in "fette" orizzontali: a ogni frame basta copiarne due o tre.
 */

const CHUNK_ROWS = 6;
/** Altezza delle facciate dei palazzi nelle piazze, in righe. */
export const BUILDING_HEIGHT = 2.55;

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

const WALLS = ['#f2c48d', '#e8a488', '#f5dd9d', '#efb3a5', '#e7c9a0', '#f0d0b0'];
const SHUTTER = '#4f9a5a';

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

export interface BuildingStyle {
  label: string;
  icon: IconKind;
  sign: string;
  ink: string;
}

/**
 * Un palazzo della piazza, visto di fronte. y cresce verso il basso, y = BUILDING_HEIGHT
 * è il filo della piazza. `door` è la x della porta.
 */
function paintBuilding(ctx: Ctx, x0: number, x1: number, door: number, st: BuildingStyle, wall: string, seed: number) {
  const H = BUILDING_HEIGHT;
  // tetto e cornicione
  ctx.fillStyle = '#c8664a';
  ctx.fillRect(x0 - 0.05, -0.26, x1 - x0 + 0.1, 0.26);
  ctx.fillStyle = '#b55a40';
  for (let x = x0; x < x1; x += 0.22) ctx.fillRect(x, -0.26, 0.04, 0.26);
  ctx.fillStyle = wall;
  ctx.fillRect(x0, 0, x1 - x0, H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.03;
  ctx.strokeRect(x0, 0, x1 - x0, H);
  ctx.fillStyle = shade(wall, -0.15);
  ctx.fillRect(x0 - 0.05, 0, x1 - x0 + 0.1, 0.14);
  // finestre del primo piano
  const n = Math.max(1, Math.floor((x1 - x0) / 1.1));
  const pitch = (x1 - x0) / n;
  for (let c = 0; c < n; c++) {
    const wx = x0 + pitch * c + pitch / 2 - 0.2;
    window2(ctx, wx, 0.28, 0.4, 0.58, hash(seed, c, 3) < 0.3, hash(seed, c, 4) > 0.5);
  }
  // insegna
  rr(ctx, x0 + 0.12, 1.02, x1 - x0 - 0.24, 0.44, 0.08);
  fillInk(ctx, st.sign);
  cellText(ctx, st.label, (x0 + x1) / 2, 1.245, 0.26, 700, st.ink, x1 - x0 - 0.8);
  destIcon(ctx, st.icon, x0 + 0.34, 1.24, 0.13);
  destIcon(ctx, st.icon, x1 - 0.34, 1.24, 0.13);
  // tenda a strisce
  const aw = 1.52;
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const a = x0 + 0.08 + (i * (x1 - x0 - 0.16)) / stripes;
    const b = x0 + 0.08 + ((i + 1) * (x1 - x0 - 0.16)) / stripes;
    ctx.beginPath();
    ctx.moveTo(a, aw);
    ctx.lineTo(b, aw);
    ctx.lineTo(b, aw + 0.26);
    ctx.quadraticCurveTo((a + b) / 2, aw + 0.38, a, aw + 0.26);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#ffffff' : st.sign;
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.025;
  ctx.strokeRect(x0 + 0.08, aw, x1 - x0 - 0.16, 0.26);
  // vetrina e porta
  const vx = door < (x0 + x1) / 2 ? door + 0.45 : x0 + 0.2;
  const vw = Math.min(1.1, x1 - x0 - 1.2);
  rr(ctx, vx, H - 0.72, vw, 0.56, 0.05);
  fillInk(ctx, '#bfe6ff');
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(vx + 0.1, H - 0.66, 0.08, 0.42);
  destIcon(ctx, st.icon, vx + vw / 2, H - 0.44, 0.16);
  rr(ctx, door - 0.3, H - 0.95, 0.6, 0.95, 0.06);
  fillInk(ctx, '#7a4b2a');
  rr(ctx, door - 0.22, H - 0.87, 0.44, 0.45, 0.04);
  fillInk(ctx, '#bfe6ff', 0.02);
  circle(ctx, door + 0.17, H - 0.35, 0.03);
  fillInk(ctx, '#f7c948', 0.015);
  ctx.fillStyle = shade(wall, -0.2);
  ctx.fillRect(x0, H - 0.14, x1 - x0, 0.14);
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

export interface StopStyle {
  left: BuildingStyle;
  right: BuildingStyle;
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
    private readonly styleOf: (stop: Stop) => StopStyle,
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
    // palazzi delle piazze (possono sporgere nelle fette vicine)
    for (const stop of this.world.stops) {
      const base = stop.entry + 1;
      if (base > top + 0.5 || base + BUILDING_HEIGHT + 0.3 < y0) continue;
      const st = this.styleOf(stop);
      ctx.setTransform(s, 0, 0, s, -this.xLeft * s, (top - (base + BUILDING_HEIGHT)) * s);
      const seed = stop.entry * 13 + 5;
      paintBuilding(ctx, Math.min(-0.2, this.xLeft - 0.5), 3, 2.35, st.left, WALLS[stop.entry % WALLS.length], seed);
      paintBuilding(ctx, 6, Math.max(9.2, this.xRight + 0.5), 6.65, st.right, WALLS[(stop.entry + 3) % WALLS.length], seed + 1);
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
