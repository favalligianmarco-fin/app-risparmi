/** Colori e piccoli attrezzi di disegno condivisi da tutto il renderer. */

export const INK = '#2d2a3e';
export const LINE = 0.034;

export const CAR_COLORS = ['#e84a4a', '#f7c948', '#5fd3b0', '#5aa9f0', '#f3e6c4', '#f58b3c', '#f28bb6', '#9f86e0'];
export const SCOOTER_COLORS = ['#9fe0d0', '#f7b2c4', '#fbe38e', '#a7c7f7', '#f3e6c4', '#c9b3f0', '#f79a6c', '#b8e27c'];

export type Ctx = CanvasRenderingContext2D;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mescola un colore verso il nero (amt < 0) o verso il bianco (amt > 0). */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const mix = (c: number) => Math.round(c + (t - c) * k);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** roundRect compatibile anche con Safari 15 (niente ctx.roundRect nativo). */
export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.0001, rx), Math.max(0.0001, ry), rot, 0, Math.PI * 2);
}

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.0001, r), 0, Math.PI * 2);
}

/** Riempie e contorna il percorso corrente con il tratto "cartoon". */
export function fillInk(ctx: Ctx, fill: string, line = LINE) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): Ctx {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D non disponibile');
  return ctx;
}

export const FONT = "'Fredoka', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";

/**
 * Testo in coordinate "cella": il font viene impostato in pixel reali, perché i
 * browser disegnano male i caratteri minuscoli ingranditi da una trasformazione.
 */
export function cellText(ctx: Ctx, text: string, x: number, y: number, size: number, weight: number, color: string, maxWidth?: number) {
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b);
  const px = m.a * x + m.c * y + m.e;
  const py = m.b * x + m.d * y + m.f;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let fontPx = size * scale;
  ctx.font = `${weight} ${fontPx}px ${FONT}`;
  if (maxWidth) {
    const w = ctx.measureText(text).width;
    const max = maxWidth * scale;
    if (w > max) {
      fontPx *= max / w;
      ctx.font = `${weight} ${fontPx}px ${FONT}`;
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, px, py);
  ctx.restore();
}
