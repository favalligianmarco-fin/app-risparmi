// Disegna icona e splash con lo stesso codice del gioco. Usato da make-assets.mjs.
import '@fontsource/fredoka/latin-700.css';
import { nonnaById } from '../src/nonne';
import { drawNonna, drawScout } from '../src/render/characters';
import { INK, ellipse, rr } from '../src/render/paint';
import { paintVehicle } from '../src/render/vehicles';

type Ctx = CanvasRenderingContext2D;

function pair(ctx: Ctx, x: number, y: number, s: number, mood: 'slipper' | 'happy' | 'idle') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(30,25,50,0.25)';
  ellipse(ctx, 0.02, 0.02, 0.4, 0.09);
  ctx.fill();
  ctx.save();
  ctx.translate(0.2, 0);
  drawScout(ctx, 0, mood === 'slipper' ? 'idle' : mood, 0.3);
  ctx.restore();
  ctx.save();
  ctx.translate(-0.17, 0);
  drawNonna(ctx, nonnaById('veneto').look, 0, mood, 0.02);
  ctx.restore();
  ctx.restore();
}

function icon(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const k = size / 1024;
  const sky = ctx.createLinearGradient(0, 0, 0, size);
  sky.addColorStop(0, '#9ee0ff');
  sky.addColorStop(0.62, '#5fb8ec');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);
  // sole
  ctx.fillStyle = '#ffe58a';
  ctx.beginPath();
  ctx.arc(820 * k, 190 * k, 120 * k, 0, Math.PI * 2);
  ctx.fill();
  // marciapiede e strada
  const roadTop = 700 * k;
  ctx.fillStyle = '#d9cdb5';
  ctx.fillRect(0, roadTop - 40 * k, size, 40 * k);
  ctx.fillStyle = '#b3a589';
  ctx.fillRect(0, roadTop - 8 * k, size, 8 * k);
  ctx.fillStyle = '#5f6674';
  ctx.fillRect(0, roadTop, size, size - roadTop);
  ctx.fillStyle = '#f4f1ea';
  for (let x = -40; x < 1024; x += 170) ctx.fillRect(x * k, 880 * k, 95 * k, 18 * k);
  // l'auto che inchioda davanti alla nonna
  ctx.save();
  ctx.translate(900 * k, 800 * k);
  ctx.scale(-300 * k, 300 * k);
  ctx.lineJoin = 'round';
  paintVehicle(ctx, 'car', 0);
  ctx.restore();
  // la coppia, con la ciabatta alzata
  pair(ctx, 500 * k, 965 * k, 610 * k, 'slipper');
  return c;
}

function splash(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6ec3f0';
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(cx, size * 0.5, size * 0.13, 0, Math.PI * 2);
  ctx.fill();
  pair(ctx, cx, size * 0.585, size * 0.2, 'happy');
  return c;
}

function rgb(c: HTMLCanvasElement) {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const out = new Uint8Array(c.width * c.height * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    out[j] = d[i];
    out[j + 1] = d[i + 1];
    out[j + 2] = d[i + 2];
  }
  let bin = '';
  for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return { width: c.width, height: c.height, rgb: btoa(bin) };
}

declare global {
  interface Window {
    makeAssets: () => Promise<Record<string, { width: number; height: number; rgb: string }>>;
  }
}

window.makeAssets = async () => {
  await document.fonts.ready;
  const ic = icon(1024);
  const out = {
    icon: rgb(ic),
    touchIcon: rgb(icon(180)),
    splash: rgb(splash(2732)),
  };
  ic.style.width = '512px';
  document.body.appendChild(ic);
  return out;
};
void INK;
void rr;
