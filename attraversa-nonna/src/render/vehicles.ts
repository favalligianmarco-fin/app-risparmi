import type { VehicleKind } from '../world';
import { VEHICLE_LENGTH } from '../world';
import { CAR_COLORS, INK, LINE, SCOOTER_COLORS, circle, ctx2d, ellipse, fillInk, makeCanvas, rr, shade } from './paint';
import type { Ctx } from './paint';

/**
 * Veicoli visti di tre quarti: la fiancata rivolta verso di noi e, sopra, tetto e cofano.
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

// ------------------------------------------------------------ vista di tre quarti
// Come le nonne e i palazzi, i mezzi sono visti da sud e appena dall'alto: la fiancata
// rivolta verso di noi si vede intera, mentre cofano, tetto e cassone sono strisce
// schiacciate sopra di lei. Così il profilo dice subito dov'è il muso, che il cofano
// è basso e che il tetto sta più in alto.

/** Dove la fiancata tocca terra (in y), sotto il centro della corsia. */
const G = 0.36;
/** Quanto si schiaccia sullo schermo la larghezza del mezzo vista dall'alto. */
const D = 0.4;
/** Altezza (in y sullo schermo) dei fanalini posteriori, per il renderer. */
export const BRAKE_Y = G - 0.24;

/** y del bordo rivolto verso di noi alla quota z, rientrato di `inset`. */
const yS = (z: number, inset = 0) => G - z - inset * D;
/** y del bordo lontano alla quota z. */
const yN = (w: number, z: number, inset = 0) => G - z - (w - inset) * D;

function groundShadow(ctx: Ctx, L: number, w: number) {
  ctx.fillStyle = 'rgba(30,25,50,0.22)';
  rr(ctx, -L / 2 + 0.02, yN(w, 0) + 0.02, L + 0.06, w * D + 0.08, 0.14);
  ctx.fill();
}

/** Fiancata tra le quote z0 e z1. */
function side(ctx: Ctx, x0: number, x1: number, z0: number, z1: number, color: string, r = 0.05, inset = 0, line = LINE) {
  rr(ctx, x0, yS(z1, inset), x1 - x0, z1 - z0, r);
  fillInk(ctx, color, line);
}

/** Faccia orizzontale alla quota z: cofano, tetto, cassone. */
function top(ctx: Ctx, x0: number, x1: number, w: number, z: number, color: string, r = 0.05, inset = 0, line = LINE) {
  rr(ctx, x0, yN(w, z, inset), x1 - x0, (w - 2 * inset) * D, r);
  fillInk(ctx, color, line);
}

/** Faccia inclinata tra (xa, za) e (xb, zb), vista dall'alto: parabrezza, lunotto. */
function slant(ctx: Ctx, xa: number, za: number, xb: number, zb: number, w: number, inset: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(xa, yS(za, inset));
  ctx.lineTo(xa, yN(w, za, inset));
  ctx.lineTo(xb, yN(w, zb, inset));
  ctx.lineTo(xb, yS(zb, inset));
  ctx.closePath();
  fillInk(ctx, color, 0.026);
  // riflesso
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  const m = (a: number, b: number, k: number) => a + (b - a) * k;
  ctx.moveTo(m(xa, xb, 0.25), m(yS(za, inset), yS(zb, inset), 0.25) - w * D * 0.3);
  ctx.lineTo(m(xa, xb, 0.7), m(yS(za, inset), yS(zb, inset), 0.7) - w * D * 0.55);
  ctx.stroke();
}

/** Trapezio sulla fiancata (abitacolo, finestrini) con gli angoli in alto arrotondati. */
function trapezoid(ctx: Ctx, xr: number, xf: number, xrt: number, xft: number, z0: number, z1: number, inset: number, rad = 0) {
  const yb = yS(z0, inset);
  const yt = yS(z1, inset);
  ctx.beginPath();
  ctx.moveTo(xr, yb);
  ctx.lineTo(xf, yb);
  ctx.arcTo(xft, yt, xrt, yt, rad);
  ctx.arcTo(xrt, yt, xr, yb, rad);
  ctx.closePath();
}

/** Un vetro sulla fiancata, col riflesso e, se c'è, la testa di chi guida. */
function pane(ctx: Ctx, path: () => void, color: string, x0: number, x1: number, z0: number, z1: number, inset: number, head = false) {
  const yb = yS(z0, inset);
  const yt = yS(z1, inset);
  path();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x0 - 0.1, yt - 0.1, x1 - x0 + 0.2, yb - yt + 0.2);
  if (head) {
    const hx = x0 + (x1 - x0) * 0.42;
    ctx.fillStyle = 'rgba(45,42,62,0.42)';
    circle(ctx, hx, yt + 0.09, 0.075);
    ctx.fill();
    rr(ctx, hx - 0.1, yt + 0.14, 0.2, 0.2, 0.08);
    ctx.fill();
  }
  const c = x0 + (x1 - x0) * 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(c - 0.07, yb);
  ctx.lineTo(c - 0.02, yb);
  ctx.lineTo(c + 0.1, yt);
  ctx.lineTo(c + 0.05, yt);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  path();
  ctx.lineWidth = 0.022;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function wheelAt(ctx: Ctx, x: number, r = 0.12) {
  const y = G - r + 0.02;
  circle(ctx, x, y, r);
  fillInk(ctx, TIRE);
  circle(ctx, x, y, r * 0.52);
  fillInk(ctx, '#c9c7d2', 0.016);
  circle(ctx, x, y, r * 0.18);
  ctx.fillStyle = '#8d8a99';
  ctx.fill();
}

/**
 * Fiancata con i passaruota e le ruote. `deco` disegna fasce e maniglie sulla
 * lamiera prima delle ruote.
 */
function body(ctx: Ctx, x0: number, x1: number, z0: number, z1: number, color: string, r: number, wheels: number[], wr: number, deco?: () => void) {
  side(ctx, x0, x1, z0, z1, color, r);
  rr(ctx, x0, yS(z1), x1 - x0, z1 - z0, r);
  ctx.save();
  ctx.clip();
  // spalla illuminata e parte bassa in ombra
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x0, yS(z1), x1 - x0, 0.035);
  ctx.fillStyle = 'rgba(30,25,50,0.12)';
  ctx.fillRect(x0, yS(z0 + 0.05), x1 - x0, 0.06);
  ctx.fillStyle = 'rgba(45,42,62,0.8)';
  for (const x of wheels) {
    circle(ctx, x, G - wr + 0.02, wr + 0.035);
    ctx.fill();
  }
  ctx.restore();
  rr(ctx, x0, yS(z1), x1 - x0, z1 - z0, r);
  ctx.lineWidth = LINE;
  ctx.strokeStyle = INK;
  ctx.stroke();
  deco?.();
  for (const x of wheels) wheelAt(ctx, x, wr);
}

/**
 * Un'auto con cofano, abitacolo e baule. `hb` è la quota della cintura (cofano e
 * baule), `hr` quella del tetto; `xr`/`xf` sono dove l'abitacolo poggia sulla
 * carrozzeria, `sr`/`sf` quanto rientrano salendo lunotto e parabrezza, `xb` il
 * montante centrale.
 */
interface CarShape {
  L: number;
  w: number;
  hb: number;
  hr: number;
  xr: number;
  xf: number;
  sr: number;
  sf: number;
  xb: number;
  rb: number;
  rr: number;
  wheel: number;
}

const CABIN_IN = 0.05;

function car(ctx: Ctx, sh: CarShape, color: string, deco?: () => void) {
  const hl = sh.L / 2;
  const { w, hb, hr, xr, xf, sr, sf, xb } = sh;
  const i = CABIN_IN;
  groundShadow(ctx, sh.L, w);
  // cofano e baule, poi la fiancata
  top(ctx, -hl, hl, w, hb, shade(color, 0.12), sh.rb);
  body(ctx, -hl, hl, 0.08, hb, color, sh.rb, [-hl + sh.L * 0.2, hl - sh.L * 0.21], sh.wheel, deco);
  // abitacolo: lunotto e parabrezza inclinati, fiancata coi finestrini, tetto
  slant(ctx, xr, hb, xr + sr, hr, w, i, GLASS_DARK);
  slant(ctx, xf, hb, xf - sf, hr, w, i, GLASS);
  trapezoid(ctx, xr, xf, xr + sr, xf - sf, hb, hr, i, sh.rr);
  fillInk(ctx, color);
  const z0 = hb + 0.035;
  const z1 = hr - 0.04;
  const k = (z: number) => (z - hb) / (hr - hb);
  const xa = (z: number) => xf - sf * k(z) - 0.045;
  const xc = (z: number) => xr + sr * k(z) + 0.045;
  pane(ctx, () => trapezoid(ctx, xc(z0), xb - 0.022, xc(z1), xb - 0.022, z0, z1, i, 0.03), GLASS_DARK, xc(z0), xb, z0, z1, i);
  pane(ctx, () => trapezoid(ctx, xb + 0.022, xa(z0), xb + 0.022, xa(z1), z0, z1, i, 0.03), GLASS, xb, xa(z0), z0, z1, i, true);
  top(ctx, xr + sr, xf - sf, w, hr, shade(color, 0.18), Math.min(sh.rr, 0.035), i, 0.03);
}

/** Portiera: il taglio nella lamiera e la maniglia. */
function door(ctx: Ctx, x0: number, x1: number, hb: number, color: string) {
  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = 0.016;
  ctx.beginPath();
  ctx.moveTo(x0, yS(hb) + 0.02);
  ctx.lineTo(x0, yS(0.1));
  ctx.moveTo(x1, yS(hb) + 0.02);
  ctx.lineTo(x1, yS(0.1));
  ctx.stroke();
  rr(ctx, x0 + 0.04, yS(hb - 0.05), 0.07, 0.022, 0.011);
  ctx.fillStyle = shade(color, -0.4);
  ctx.fill();
}

/** Utilitaria squadrata anni '80: spigoli vivi, fascia di plastica grigia, vetri dritti. */
function drawBoxy(ctx: Ctx, color: string) {
  const L = VEHICLE_LENGTH.boxy;
  const hl = L / 2;
  const sh: CarShape = { L, w: 0.62, hb: 0.32, hr: 0.6, xr: -hl + 0.08, xf: hl - 0.44, sr: 0.04, sf: 0.15, xb: -0.13, rb: 0.045, rr: 0.03, wheel: 0.12 };
  car(ctx, sh, color, () => {
    door(ctx, -0.13, sh.xf + 0.02, sh.hb, color);
    // fascia di plastica lungo tutta la fiancata, fari squadrati
    rr(ctx, -hl + 0.01, yS(0.17), L - 0.02, 0.07, 0.02);
    fillInk(ctx, '#6b6b78', 0.018);
    rr(ctx, hl - 0.09, yS(0.29), 0.08, 0.07, 0.012);
    fillInk(ctx, '#fff4b8', 0.018);
    rr(ctx, -hl + 0.01, yS(0.29), 0.06, 0.09, 0.012);
    fillInk(ctx, '#e0443c', 0.018);
  });
  // gocciolatoio sul tetto piatto
  ctx.strokeStyle = shade(color, -0.12);
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.moveTo(sh.xr + sh.sr + 0.06, yS(sh.hr, CABIN_IN) - 0.04);
  ctx.lineTo(sh.xf - sh.sf - 0.06, yS(sh.hr, CABIN_IN) - 0.04);
  ctx.stroke();
}

/** Piccola e tondeggiante, col tettuccio di tela arrotolabile e i fari tondi. */
function drawBubble(ctx: Ctx, color: string) {
  const L = VEHICLE_LENGTH.bubble;
  const hl = L / 2;
  const sh: CarShape = { L, w: 0.56, hb: 0.27, hr: 0.55, xr: -hl + 0.19, xf: hl - 0.3, sr: 0.09, sf: 0.1, xb: -0.03, rb: 0.13, rr: 0.07, wheel: 0.105 };
  car(ctx, sh, color, () => {
    door(ctx, -0.03, sh.xf + 0.01, sh.hb, color);
    // paraurti cromati, baffi sul muso, fanalino
    ctx.fillStyle = '#e6e6ee';
    rr(ctx, hl - 0.16, yS(0.15), 0.18, 0.035, 0.015);
    fillInk(ctx, '#e6e6ee', 0.014);
    rr(ctx, -hl - 0.02, yS(0.15), 0.18, 0.035, 0.015);
    fillInk(ctx, '#e6e6ee', 0.014);
    ctx.strokeStyle = '#e6e6ee';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(hl - 0.2, yS(0.2));
    ctx.quadraticCurveTo(hl - 0.08, yS(0.23), hl - 0.02, yS(0.2));
    ctx.stroke();
    rr(ctx, -hl + 0.02, yS(0.28), 0.05, 0.07, 0.02);
    fillInk(ctx, '#e0443c', 0.015);
  });
  // faro tondo sul parafango e griglia del motore sul cofano posteriore
  circle(ctx, hl - 0.1, yS(sh.hb) - 0.01, 0.045);
  fillInk(ctx, '#fff4b8', 0.018);
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  for (let n = 0; n < 4; n++) {
    const x = -hl + 0.06 + n * 0.028;
    ctx.moveTo(x, yN(sh.w, sh.hb, 0.12));
    ctx.lineTo(x, yS(sh.hb, 0.12));
  }
  ctx.stroke();
  // tettuccio di tela con le pieghe
  const t0 = sh.xr + sh.sr + 0.05;
  const t1 = sh.xf - sh.sf - 0.05;
  rr(ctx, t0, yN(sh.w, sh.hr, 0.1), t1 - t0, (sh.w - 0.2) * D, 0.03);
  fillInk(ctx, '#e8dcc0', 0.016);
  ctx.strokeStyle = 'rgba(120,100,70,0.5)';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let n = 1; n < 4; n++) {
    const x = t0 + ((t1 - t0) * n) / 4;
    ctx.moveTo(x, yN(sh.w, sh.hr, 0.1));
    ctx.lineTo(x, yS(sh.hr, 0.1));
  }
  ctx.stroke();
}

/** Furgoncino da consegne: muso corto, cabina e cassone alto squadrato. */
function drawFiorino(ctx: Ctx, color: string, accent: string) {
  const L = VEHICLE_LENGTH.fiorino;
  const hl = L / 2;
  const w = 0.6;
  const hb = 0.3;
  const hr = 0.6;
  const box = 0.76;
  const cabR = hl - 0.7;
  const cabF = hl - 0.3;
  const sf = 0.14;
  const i = CABIN_IN;
  groundShadow(ctx, L, w);
  // muso e cabina
  top(ctx, cabR, hl, w, hb, shade(color, 0.12), 0.05);
  body(ctx, cabR - 0.04, hl, 0.08, hb, color, 0.05, [hl - 0.3], 0.12, () => {
    rr(ctx, hl - 0.09, yS(0.27), 0.08, 0.06, 0.012);
    fillInk(ctx, '#fff4b8', 0.018);
  });
  slant(ctx, cabF, hb, cabF - sf, hr, w, i, GLASS);
  trapezoid(ctx, cabR, cabF, cabR, cabF - sf, hb, hr, i, 0.03);
  fillInk(ctx, color);
  const k = (z: number) => (z - hb) / (hr - hb);
  const xa = (z: number) => cabF - sf * k(z) - 0.045;
  const z0 = hb + 0.035;
  const z1 = hr - 0.04;
  pane(ctx, () => trapezoid(ctx, cabR + 0.04, xa(z0), cabR + 0.04, xa(z1), z0, z1, i, 0.03), GLASS, cabR + 0.04, xa(z0), z0, z1, i, true);
  top(ctx, cabR, cabF - sf, w, hr, shade(color, 0.16), 0.03, i, 0.03);
  // cassone alto: il punto più alto del furgoncino
  top(ctx, -hl, cabR + 0.02, w, box, shade(color, 0.1), 0.04);
  body(ctx, -hl, cabR + 0.02, 0.08, box, shade(color, -0.04), 0.05, [-hl + 0.34], 0.12, () => {
    ctx.fillStyle = accent;
    ctx.fillRect(-hl + 0.05, yS(0.5), cabR + hl - 0.08, 0.07);
    ctx.strokeStyle = shade(color, -0.25);
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    ctx.moveTo(-hl + 0.62, yS(box) + 0.04);
    ctx.lineTo(-hl + 0.62, yS(0.12));
    ctx.stroke();
    rr(ctx, -hl + 0.66, yS(0.4), 0.02, 0.07, 0.01);
    ctx.fillStyle = shade(color, -0.4);
    ctx.fill();
    rr(ctx, -hl + 0.01, yS(0.3), 0.05, 0.1, 0.012);
    fillInk(ctx, '#e0443c', 0.018);
  });
  ctx.strokeStyle = shade(color, -0.12);
  ctx.lineWidth = 0.016;
  ctx.beginPath();
  for (let x = -hl + 0.2; x < cabR - 0.05; x += 0.2) {
    ctx.moveTo(x, yN(w, box, 0.03));
    ctx.lineTo(x, yS(box, 0.03));
  }
  ctx.stroke();
}

/** Pullman: una scatola alta con la fascia dei finestrini e il parabrezza grande davanti. */
function drawBus(ctx: Ctx, color: string) {
  const L = VEHICLE_LENGTH.bus;
  const hl = L / 2;
  const w = 0.68;
  const H = 0.78;
  groundShadow(ctx, L, w);
  top(ctx, -hl, hl, w, H, shade(color, 0.16), 0.08);
  body(ctx, -hl, hl, 0.08, H, color, 0.09, [-hl + 0.6, hl - 0.72], 0.13, () => {
    // fascia chiara, finestrini, porta e parabrezza avvolgente
    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(-hl + 0.02, yS(0.36), L - 0.04, 0.05);
    for (let x = -hl + 0.14; x < hl - 0.78; x += 0.38) {
      pane(ctx, () => rr(ctx, x, yS(0.7), 0.32, 0.26, 0.03), GLASS_DARK, x, x + 0.32, 0.44, 0.7, 0);
    }
    rr(ctx, hl - 0.68, yS(0.7), 0.3, 0.58, 0.03);
    fillInk(ctx, shade(color, -0.3), 0.02);
    for (const dx of [0.03, 0.155]) {
      rr(ctx, hl - 0.68 + dx, yS(0.66), 0.115, 0.26, 0.02);
      fillInk(ctx, GLASS_DARK, 0.014);
    }
    pane(ctx, () => rr(ctx, hl - 0.33, yS(0.74), 0.3, 0.4, 0.05), GLASS, hl - 0.33, hl - 0.03, 0.34, 0.74, 0, true);
    rr(ctx, hl - 0.3, yS(0.74) + 0.02, 0.22, 0.05, 0.01);
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    rr(ctx, hl - 0.1, yS(0.24), 0.08, 0.06, 0.012);
    fillInk(ctx, '#fff4b8', 0.018);
    rr(ctx, -hl + 0.01, yS(0.3), 0.06, 0.1, 0.012);
    fillInk(ctx, '#e0443c', 0.018);
  });
  // condizionatori sul tetto
  for (const [x0, len] of [
    [-hl * 0.62, 0.7],
    [hl * 0.02, 0.44],
  ]) {
    side(ctx, x0, x0 + len, H, H + 0.06, '#c3c7d2', 0.02, 0.14, 0.022);
    top(ctx, x0, x0 + len, w, H + 0.06, '#e2e5ec', 0.03, 0.14, 0.022);
  }
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

/** Motocarro: cabina tonda davanti, cassone basso con le cassette di frutta. */
function drawTrike(ctx: Ctx, color: string, fruit: string) {
  const L = VEHICLE_LENGTH.trike;
  const hl = L / 2;
  const w = 0.5;
  const cab = hl - 0.44;
  const bed = 0.3;
  const roof = 0.6;
  groundShadow(ctx, L, w);
  // cassone di legno con due cassette di frutta
  top(ctx, -hl, cab + 0.02, w, bed, '#c9975a', 0.03);
  body(ctx, -hl, cab + 0.02, 0.12, bed, shade(color, -0.15), 0.03, [-hl + 0.24], 0.09, () => {
    rr(ctx, -hl + 0.01, yS(0.27), 0.05, 0.07, 0.012);
    fillInk(ctx, '#e0443c', 0.016);
  });
  for (const x0 of [-hl + 0.05, -hl + 0.33]) {
    const x1 = x0 + 0.26;
    top(ctx, x0, x1, w, bed + 0.09, '#8a5a2e', 0.02, 0.06, 0.02);
    side(ctx, x0, x1, bed, bed + 0.09, '#d9a86a', 0.02, 0.06, 0.02);
    for (let n = 0; n < 6; n++) {
      const fx = x0 + 0.05 + (n % 3) * 0.08;
      const fy = yS(bed + 0.09, 0.06) - 0.045 - Math.floor(n / 3) * 0.07;
      circle(ctx, fx, fy, 0.042);
      fillInk(ctx, fruit, 0.014);
    }
  }
  // cabina: fiancata tonda davanti, finestrino, parabrezza e tetto
  ctx.beginPath();
  ctx.moveTo(cab, yS(0.1));
  ctx.lineTo(hl - 0.02, yS(0.1));
  ctx.quadraticCurveTo(hl + 0.02, yS(0.3), hl - 0.02, yS(0.36));
  ctx.lineTo(hl - 0.1, yS(roof));
  ctx.lineTo(cab, yS(roof));
  ctx.closePath();
  fillInk(ctx, color);
  pane(ctx, () => rr(ctx, cab + 0.06, yS(roof - 0.05), 0.2, 0.2, 0.03), GLASS, cab + 0.06, cab + 0.26, roof - 0.25, roof - 0.05, 0, true);
  slant(ctx, hl - 0.02, 0.36, hl - 0.1, roof, w, 0.04, GLASS);
  top(ctx, cab, hl - 0.1, w, roof, shade(color, 0.16), 0.08, 0.02);
  wheelAt(ctx, hl - 0.16, 0.09);
  circle(ctx, hl - 0.03, yS(0.22), 0.035);
  fillInk(ctx, '#fff4b8', 0.015);
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

/** Carrozze di un treno visto dall'alto: tetto, finestrini sulla fiancata, pantografo. */
function trainBody(ctx: Ctx, L: number, body: string, stripe: string, stripe2: string, cars: number) {
  const hl = L / 2;
  shadow(ctx, L, 0.34);
  rr(ctx, -hl, -0.2, L, 0.52, 0.18);
  fillInk(ctx, shade(body, -0.1));
  ctx.fillStyle = stripe;
  ctx.fillRect(-hl + 0.12, 0.13, L - 0.24, 0.07);
  ctx.fillStyle = stripe2;
  ctx.fillRect(-hl + 0.12, 0.2, L - 0.24, 0.04);
  const carL = L / cars;
  for (let c = 0; c < cars; c++) {
    const x0 = -hl + c * carL;
    for (let x = x0 + 0.35; x < x0 + carL - 0.4; x += 0.46) {
      rr(ctx, x, -0.13, 0.34, 0.2, 0.05);
      fillInk(ctx, '#3a4a66', 0.018);
    }
    if (c > 0) {
      ctx.fillStyle = INK;
      ctx.fillRect(x0 - 0.02, -0.2, 0.04, 0.5);
    }
    // porte con il bordo giallo
    rr(ctx, x0 + carL * 0.5 - 0.14, -0.16, 0.28, 0.44, 0.03);
    fillInk(ctx, shade(body, -0.25), 0.02);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(x0 + carL * 0.5 - 0.14, 0.24, 0.28, 0.03);
  }
  // tetto
  rr(ctx, -hl, -0.5, L, 0.34, 0.14);
  fillInk(ctx, '#d9dce4');
  for (let c = 0; c < cars; c++) {
    const cx = -hl + c * carL + carL / 2;
    rr(ctx, cx - 0.4, -0.46, 0.8, 0.24, 0.05);
    fillInk(ctx, '#b7bbc6', 0.02);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.36);
  ctx.lineTo(0, -0.6);
  ctx.lineTo(0.3, -0.36);
  ctx.moveTo(-0.18, -0.6);
  ctx.lineTo(0.18, -0.6);
  ctx.stroke();
}

/** Treno regionale: bianco, fasce verde e blu, musi tondi. */
function drawRegional(ctx: Ctx) {
  const L = VEHICLE_LENGTH.regional;
  const hl = L / 2;
  trainBody(ctx, L, '#f4f5f7', '#3fae5a', '#3d6fb8', 3);
  for (const sgn of [1, -1]) {
    rr(ctx, sgn > 0 ? hl - 0.34 : -hl + 0.06, -0.47, 0.28, 0.62, 0.12);
    fillInk(ctx, '#2d3440', 0.025);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(sgn > 0 ? hl - 0.28 : -hl + 0.12, -0.42, 0.05, 0.5);
  }
  ctx.fillStyle = '#fff4b8';
  circle(ctx, hl - 0.05, 0.2, 0.045);
  ctx.fill();
}

/** Treno ad alta velocità: argento, muso lungo e affusolato, fascia rossa. */
function drawFast(ctx: Ctx) {
  const L = VEHICLE_LENGTH.fast;
  const hl = L / 2;
  trainBody(ctx, L - 2.4, '#eef0f3', '#d6283a', '#8d93a0', 4);
  // due musi a punta (il treno è reversibile)
  for (const sgn of [1, -1]) {
    const base = sgn * (hl - 1.2);
    const tip = sgn * hl;
    ctx.fillStyle = 'rgba(30,25,50,0.22)';
    ctx.beginPath();
    ctx.moveTo(base, 0.12);
    ctx.quadraticCurveTo(tip, 0.18, tip, 0.34);
    ctx.lineTo(base, 0.44);
    ctx.fill();
    // fiancata del muso
    ctx.beginPath();
    ctx.moveTo(base, -0.2);
    ctx.quadraticCurveTo(tip - sgn * 0.2, -0.05, tip, 0.2);
    ctx.lineTo(base, 0.32);
    ctx.closePath();
    fillInk(ctx, '#d6283a');
    // muso visto dall'alto
    ctx.beginPath();
    ctx.moveTo(base, -0.5);
    ctx.bezierCurveTo(base + sgn * 0.7, -0.5, tip - sgn * 0.1, -0.15, tip, 0.12);
    ctx.bezierCurveTo(tip - sgn * 0.2, 0.1, base + sgn * 0.6, -0.12, base, -0.16);
    ctx.closePath();
    fillInk(ctx, '#eef0f3');
    ctx.beginPath();
    ctx.moveTo(base + sgn * 0.15, -0.44);
    ctx.bezierCurveTo(base + sgn * 0.55, -0.44, base + sgn * 0.8, -0.3, base + sgn * 0.85, -0.22);
    ctx.lineTo(base + sgn * 0.15, -0.22);
    ctx.closePath();
    fillInk(ctx, '#2d3440', 0.022);
    ctx.fillStyle = '#fff4b8';
    circle(ctx, tip - sgn * 0.12, 0.18, 0.04);
    ctx.fill();
  }
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Pixel dello sprite che corrisponde al centro del veicolo. */
  ox: number;
  oy: number;
}

const BUS_COLORS = ['#f2994a', '#3fb27f', '#3d8bd9'];
/** Colori da utilitaria d'epoca e da "cinquino". */
const BOXY_COLORS = ['#f4f1ea', '#d9443c', '#8fc3e6', '#e6d3a3', '#3f7a52', '#f2c14e', '#b9bcc6', '#e8763f'];
const BUBBLE_COLORS = ['#f3e6c4', '#9fcbe8', '#e0443c', '#9fe0c8', '#f7d46a', '#f28b7a', '#f7f5ee', '#b8a7e0'];
const FIORINO_COLORS = ['#f4f4f0', '#f4f4f0', '#dfe8f0', '#f3e6c4'];
const TRIKE_COLORS = ['#5aa9f0', '#5fd3b0', '#e84a4a'];

export function paintVehicle(ctx: Ctx, kind: VehicleKind, color: number) {
  switch (kind) {
    case 'boxy':
      return drawBoxy(ctx, BOXY_COLORS[color % BOXY_COLORS.length]);
    case 'bubble':
      return drawBubble(ctx, BUBBLE_COLORS[color % BUBBLE_COLORS.length]);
    case 'fiorino':
      return drawFiorino(ctx, FIORINO_COLORS[color % FIORINO_COLORS.length], CAR_COLORS[color % CAR_COLORS.length]);
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
    case 'regional':
      return drawRegional(ctx);
    case 'fast':
      return drawFast(ctx);
  }
}

/** Tutti gli sprite che la strada può chiedere, da preparare prima che servano. */
function allSprites(): [VehicleKind, number, 1 | -1][] {
  const out: [VehicleKind, number, 1 | -1][] = [];
  const kinds: VehicleKind[] = ['boxy', 'bubble', 'fiorino', 'scooter', 'trike', 'bike', 'bus', 'tram', 'regional', 'fast'];
  for (const kind of kinds) {
    const colors = kind === 'tram' || kind === 'regional' || kind === 'fast' ? 1 : 8;
    for (let c = 0; c < colors; c++) out.push([kind, c, 1], [kind, c, -1]);
  }
  return out;
}

export class VehicleSprites {
  private cache = new Map<string, Sprite>();
  private pending = allSprites();

  constructor(private readonly scale: number) {}

  /**
   * Prepara qualche sprite (~0,3 ms l'uno) finché dura il budget, così in corsa un
   * mezzo nuovo non costa niente quando entra in scena.
   */
  warm(budgetMs: number) {
    const t0 = performance.now();
    while (this.pending.length && performance.now() - t0 < budgetMs) {
      const [kind, color, dir] = this.pending.pop()!;
      this.get(kind, color, dir);
    }
  }

  get(kind: VehicleKind, color: number, dir: 1 | -1): Sprite {
    const c = kind === 'tram' || kind === 'regional' || kind === 'fast' ? 0 : color;
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
