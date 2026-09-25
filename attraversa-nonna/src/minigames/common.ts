import type { Look } from '../nonne';
import { drawNonna } from '../render/characters';
import type { Mood } from '../render/characters';
import { FONT, INK, rr } from '../render/paint';

export type Ctx = CanvasRenderingContext2D;
export type MgSfx = 'good' | 'bad' | 'chomp' | 'tick' | 'cash' | 'thread' | 'caught';

/** Quello che un minigioco può usare del resto del gioco. */
export interface MiniEnv {
  look: Look;
  sfx(name: MgSfx): void;
  haptic(kind: 'light' | 'medium' | 'heavy'): void;
}

export interface MiniGame {
  /** Tempo massimo, in secondi. */
  readonly limit: number;
  result: 'running' | 'win' | 'fail';
  update(dt: number): void;
  /** Disegna in punti CSS: `w`×`h` è lo spazio del gioco. */
  draw(ctx: Ctx, w: number, h: number): void;
  down(x: number, y: number): void;
  up(): void;
}

/** Un fumetto con la coda verso il basso. */
export function bubble(ctx: Ctx, text: string, x: number, y: number, maxW: number, color = INK, size = 17) {
  ctx.font = `700 ${size}px ${FONT}`;
  const w = Math.min(maxW, ctx.measureText(text).width + 24);
  const h = size + 16;
  const bx = Math.max(6, Math.min(x - w / 2, x + maxW / 2 - w));
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  rr(ctx, bx, y - h, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 1);
  ctx.lineTo(x, y + 10);
  ctx.lineTo(x + 7, y - 1);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x, y + 10);
  ctx.lineTo(x + 7, y);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, y - h / 2 + 1, w - 12);
}

/** La nonna disegnata in grande: `size` è la sua altezza in punti. */
export function nonnaAt(ctx: Ctx, look: Look, x: number, y: number, size: number, mood: Mood, t: number, legs = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(30,25,50,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.24, 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  drawNonna(ctx, look, legs, mood, t, false);
  ctx.restore();
}

/** Bottone disegnato nel canvas, con l'ombra "a gradino" dell'interfaccia. */
export function button(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, pressed = false) {
  const dy = pressed ? 3 : 0;
  ctx.fillStyle = INK;
  rr(ctx, x, y + 5, w, h, 16);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  rr(ctx, x, y + dy, w, h, 16);
  ctx.fill();
  ctx.stroke();
}

export function label(ctx: Ctx, text: string, x: number, y: number, size: number, color = INK, weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
