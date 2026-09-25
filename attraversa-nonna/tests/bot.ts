import { COLS, isHazard } from '../src/world';
import { HIT_HALF_WIDTH, STEP_TIME, STEP_TIME_COFFEE, Sim } from '../src/sim';
import type { Dir } from '../src/sim';

/**
 * Un giocatore automatico "prudente": prevede dove saranno i veicoli e attraversa
 * un'intera carreggiata solo se la vede libera. Serve a dimostrare che la strada
 * infinita è sempre superabile, e a tarare difficoltà e velocità del temporale.
 */
export interface BotResult {
  meters: number;
  time: number;
  hits: number;
  slippersUsed: number;
  stops: number;
  cause: string | null;
}

const SAFETY = 0.22;

function rowSafe(sim: Sim, row: number, col: number, t0: number, t1: number): boolean {
  const rs = sim.rowState(row);
  if (!isHazard(rs.def.kind)) return true;
  if ((rs.def.kind === 'tram' || rs.def.kind === 'rail') && (rs.warn || rs.vehicles.length)) return false;
  const cx = col + 0.5;
  for (const v of rs.vehicles) {
    const reach = v.len / 2 + HIT_HALF_WIDTH + SAFETY;
    // posizione prevista: si considera sia la velocità attuale sia quella di crociera
    const stoppedFor = Math.max(v.stopT, v.hitStopT);
    const xAt = (t: number, speed: number) => {
      if (stoppedFor <= 0) return v.x + v.dir * speed * t;
      const brake = v.speed * 0.08;
      if (t <= stoppedFor) return v.x + v.dir * brake;
      return v.x + v.dir * (brake + rs.def.speed * (t - stoppedFor));
    };
    const xs = [xAt(t0, v.speed), xAt(t1, v.speed), xAt(t0, rs.def.speed), xAt(t1, rs.def.speed)];
    const lo = Math.min(...xs) - reach;
    const hi = Math.max(...xs) + reach;
    if (cx > lo && cx < hi) return false;
  }
  // un veicolo che potrebbe entrare dal bordo durante l'attraversamento
  if (rs.def.kind !== 'tram' && rs.def.kind !== 'rail' && rs.vehicles.length) {
    const last = rs.vehicles[rs.vehicles.length - 1];
    const entry = rs.def.dir > 0 ? -5 : COLS + 5;
    const dist = Math.abs(cx - entry);
    if (dist < rs.def.speed * t1 + 1.5 && Math.abs(last.x - entry) > rs.nextGap) return false;
  }
  return true;
}

/** Quante corsie pericolose consecutive ci sono sopra `row`, fino al primo posto sicuro. */
function runLength(sim: Sim, row: number): number {
  let k = 0;
  while (isHazard(sim.rowState(row + k + 1).def.kind)) k++;
  return k;
}

function crossingSafe(sim: Sim, row: number, col: number, delay: number): boolean {
  const step = sim.player.coffeeT > delay + 1 ? STEP_TIME_COFFEE : STEP_TIME;
  const m = runLength(sim, row);
  const target = row + m + 1;
  if (sim.rowState(target).blocked[col]) return false;
  for (let k = 1; k <= m; k++) {
    const tIn = delay + (k - 1) * step + step * 0.5;
    const tOut = delay + k * step + step * 0.5;
    if (!rowSafe(sim, row + k, col, tIn - 0.05, tOut + 0.08)) return false;
  }
  return true;
}

function decide(sim: Sim, waited: number): Dir | 'slipper' | null {
  const p = sim.player;
  const row = p.row;
  const here = sim.rowState(row);
  const step = p.coffeeT > 0 ? STEP_TIME_COFFEE : STEP_TIME;

  if (isHazard(here.def.kind)) {
    // già in mezzo alla strada (previsione sbagliata): avanti se si può, altrimenti fermi o indietro
    if (rowSafe(sim, row + 1, p.col, step * 0.5, step * 1.6) && !sim.rowState(row + 1).blocked[p.col]) return 'up';
    if (rowSafe(sim, row, p.col, 0, step)) return null;
    if (row > 0 && rowSafe(sim, row - 1, p.col, step * 0.5, step * 1.6)) return 'down';
    return 'up';
  }

  const next = sim.rowState(row + 1);
  if (!isHazard(next.def.kind)) {
    if (!next.blocked[p.col]) return 'up';
    // cerca la colonna libera più vicina
    for (let d = 1; d < COLS; d++) {
      for (const c of [p.col - d, p.col + d]) {
        if (c >= 0 && c < COLS && !next.blocked[c] && !here.blocked[c]) {
          return c < p.col ? 'left' : 'right';
        }
      }
    }
  }

  if (crossingSafe(sim, row, p.col, 0)) return 'up';
  // il temporale si avvicina (o si aspetta da troppo): fuori la ciabatta
  const storm = sim.playerPos().y - sim.stormY;
  if ((waited > 3.5 || storm < 4) && p.slippers > 0 && runLength(sim, row) > 0) {
    if (next.def.kind !== 'tram' && next.def.kind !== 'rail') return 'slipper';
  }
  // spostarsi di lato se da un'altra parte si passa prima
  for (let d = 1; d <= 3; d++) {
    for (const c of [p.col - d, p.col + d]) {
      if (c < 0 || c >= COLS) continue;
      let clear = true;
      const s = Math.sign(c - p.col);
      for (let x = p.col + s; x !== c + s; x += s) if (here.blocked[x]) clear = false;
      if (clear && crossingSafe(sim, row, c, d * step)) return c < p.col ? 'left' : 'right';
    }
  }
  return null;
}

export function runBot(sim: Sim, targetMeters = 300, maxTime = 600): BotResult {
  const dt = 1 / 60;
  let waited = 0;
  let slippersUsed = 0;
  while (sim.status !== 'over' && sim.meters < targetMeters && sim.time < maxTime) {
    if (sim.status === 'stop') {
      sim.finishStop(true, 10);
      continue;
    }
    const p = sim.player;
    if (!p.moving && p.stunned <= 0 && p.slip <= 0) {
      const action = decide(sim, waited);
      if (action === 'slipper') {
        if (sim.useSlipper()) slippersUsed++;
        waited = 0;
      } else if (action) {
        sim.input(action);
        if (action === 'up') waited = 0;
      }
    }
    sim.update(dt);
    if (!p.moving) waited += dt;
    sim.events.length = 0;
  }
  return { meters: sim.meters, time: sim.elapsed, hits: sim.player.hits, slippersUsed, stops: sim.stopsDone, cause: sim.overCause };
}
