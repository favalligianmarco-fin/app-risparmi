import { Rng } from './rng';

/**
 * La strada infinita. Ogni riga è un metro: la distanza percorsa dalla nonna è
 * semplicemente l'indice della riga più lontana raggiunta. Il mondo si genera a
 * pezzi man mano che si avanza, sempre uguale a parità di seme.
 */

/** Larghezza giocabile, in celle. */
export const COLS = 9;

export type RowKind = 'sidewalk' | 'road' | 'median' | 'bike' | 'tram' | 'plaza';
export type VehicleKind = 'car' | 'van' | 'bus' | 'scooter' | 'trike' | 'bike' | 'tram';
export type PropKind = 'bench' | 'pot' | 'bollard' | 'bin' | 'tree' | 'hydrant' | 'fountain';
export type PickupKind = 'candy' | 'coffee' | 'slipper' | 'heart';
export type StopKind = 'tiramisu' | 'poste' | 'ago' | 'pranzo';

export const STOP_KINDS: StopKind[] = ['tiramisu', 'poste', 'ago', 'pranzo'];
/** Negozi decorativi sul lato destro delle piazze. */
export const SHOPS = ['bakery', 'grocer', 'newsstand', 'florist', 'gelato', 'pharmacy'] as const;
export type Shop = (typeof SHOPS)[number];

export const VEHICLE_LENGTH: Record<VehicleKind, number> = {
  car: 1.5,
  van: 2.05,
  bus: 3.3,
  scooter: 0.95,
  trike: 1.15,
  bike: 0.85,
  tram: 7.2,
};

/** Righe di una sosta: ingresso, tre file con i palazzi ai lati, uscita in cima. */
export const STOP_ROWS = 4;
/** Colonne occupate dai due palazzi della piazza. */
export const STOP_LEFT = [0, 1, 2];
export const STOP_RIGHT = [6, 7, 8];

export interface Stop {
  kind: StopKind;
  shop: Shop;
  /** Riga d'ingresso: arrivarci fa partire il minigioco. */
  entry: number;
}

export interface RowDef {
  kind: RowKind;
  /** +1: il traffico va verso destra, -1: verso sinistra. */
  dir: 1 | -1;
  /** Velocità di crociera della corsia, in celle al secondo. */
  speed: number;
  mix: VehicleKind[];
  /** Spazio libero tra due veicoli consecutivi, in celle. */
  gapMin: number;
  gapMax: number;
  tramEvery: [number, number];
  laneIndex: number;
  laneCount: number;
  busLane: boolean;
  blockers: { col: number; kind: PropKind }[];
  puddles: number[];
  pigeons: number[];
  pickups: { col: number; kind: PickupKind }[];
  stop: Stop | null;
}

export const isHazard = (k: RowKind) => k === 'road' || k === 'bike' || k === 'tram';
export const isSafe = (k: RowKind) => !isHazard(k);

function baseRow(kind: RowKind): RowDef {
  return {
    kind,
    dir: 1,
    speed: 0,
    mix: [],
    gapMin: 0,
    gapMax: 0,
    tramEvery: [0, 0],
    laneIndex: 0,
    laneCount: 1,
    busLane: false,
    blockers: [],
    puddles: [],
    pigeons: [],
    pickups: [],
    stop: null,
  };
}

/**
 * Difficoltà in funzione dei metri: sale in fretta all'inizio e poi più piano.
 * 1 alla partenza, ~12 a 250 m, ~23 a 500 m, 45 (il massimo) verso i 950 m.
 */
export function difficultyAt(meters: number): number {
  return Math.min(45, 1 + meters / 21.5);
}

type Group = 'road' | 'bike' | 'tram';

export class World {
  readonly rows: RowDef[] = [];
  readonly stops: Stop[] = [];
  readonly seed: number;
  private rng: Rng;
  private nextStopAt: number;
  private stopQueue: StopKind[] = [];
  private lastGroup: Group | null = null;
  private lastSafe = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed ^ 0x5eed1234);
    this.nextStopAt = this.rng.int(70, 95);
    const home = baseRow('sidewalk');
    home.blockers.push({ col: 0, kind: 'hydrant' }, { col: COLS - 1, kind: 'bin' });
    if (this.rng.chance(0.7)) home.pigeons.push(this.rng.pick([2, 6]));
    this.rows.push(home);
  }

  /** Genera la strada almeno fino alla riga `row`. */
  ensure(row: number) {
    while (this.rows.length <= row) this.appendSection();
  }

  row(i: number): RowDef {
    this.ensure(i);
    return this.rows[i];
  }

  private appendSection() {
    if (this.rows.length >= this.nextStopAt) {
      this.appendStop();
      this.nextStopAt = this.rows.length + this.rng.int(120, 180);
      return;
    }
    const d = difficultyAt(this.rows.length);
    this.appendGroup(d);
    // da ~250 m in poi le carreggiate cominciano a incastrarsi senza spartitraffico in mezzo
    const tangle = d < 12 ? 0 : Math.min(0.55, 0.15 + (d - 12) * 0.012);
    if (this.rng.chance(tangle) && this.rows.length + 3 < this.nextStopAt) {
      this.appendGroup(d, true);
    }
    this.appendMedian(d);
  }

  private pickGroup(d: number, joined: boolean): Group {
    const options: Group[] = ['road', 'road', 'road'];
    if (d >= 4) options.push('bike');
    if (d >= 6 && this.lastGroup !== 'tram') options.push('tram', 'tram');
    // una corsia "attaccata" alla precedente è quasi sempre una pista ciclabile o un binario
    if (joined && d >= 6) options.push('bike', 'tram');
    let g = this.rng.pick(options);
    if (joined && g === this.lastGroup && g !== 'road') g = 'road';
    return g;
  }

  private appendGroup(d: number, joined = false) {
    const rng = this.rng;
    const kind = this.pickGroup(d, joined);
    this.lastGroup = kind;
    // la prima strada, davanti a casa, è una via tranquilla
    const quiet = this.rows.length < 4;
    const carBase = quiet ? 1.05 : 1.3 + d * 0.055;
    const gapMin = quiet ? 4.2 : Math.max(1.75, 3.4 - d * 0.04);
    const gapSpread = Math.max(1.6, 4.2 - d * 0.05);

    if (kind === 'road') {
      let lanes: number;
      if (d < 3) lanes = 2;
      else {
        const base = 2 + Math.floor((d - 1) / 8);
        lanes = Math.max(joined ? 1 : 2, Math.min(4, base + rng.int(-1, 1)));
        if (d >= 30 && rng.chance(0.2)) lanes = 5;
        if (joined) lanes = Math.min(lanes, 2);
      }
      const rightward = lanes === 1 ? (rng.chance(0.5) ? 1 : 0) : Math.ceil(lanes / 2);
      for (let i = 0; i < lanes; i++) {
        const r = baseRow('road');
        r.dir = i < rightward ? 1 : -1;
        r.laneIndex = i;
        r.laneCount = lanes;
        r.gapMin = gapMin + rng.range(0, 0.6);
        r.gapMax = r.gapMin + gapSpread + rng.range(0, 1.2);
        const roll = rng.next();
        if (d >= 3 && roll < 0.22) {
          r.mix = ['scooter', 'scooter', 'scooter', 'car'];
          r.speed = carBase * rng.range(1.25, 1.45);
        } else if (d >= 5 && roll < 0.36 && (i === 0 || i === lanes - 1)) {
          r.mix = ['bus', 'bus', 'van'];
          r.speed = carBase * rng.range(0.7, 0.85);
          r.busLane = true;
          r.gapMin += 0.6;
        } else if (roll < 0.5) {
          r.mix = ['car', 'car', 'car', 'van', 'trike'];
          r.speed = carBase * rng.range(0.75, 0.95);
        } else {
          r.mix = ['car', 'car', 'car', 'car', 'van'];
          r.speed = carBase * rng.range(0.9, 1.15);
        }
        this.pushHazard(r, d);
      }
    } else if (kind === 'bike') {
      const lanes = d >= 12 && rng.chance(0.5) ? 2 : 1;
      const firstDir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
      for (let i = 0; i < lanes; i++) {
        const r = baseRow('bike');
        r.dir = i === 0 ? firstDir : (-firstDir as 1 | -1);
        r.laneIndex = i;
        r.laneCount = lanes;
        r.mix = ['bike'];
        r.speed = (carBase + 0.3) * rng.range(1.0, 1.2);
        r.gapMin = gapMin * 0.9 + rng.range(0, 0.5);
        r.gapMax = r.gapMin + gapSpread + rng.range(0.5, 1.5);
        this.pushHazard(r, d);
      }
    } else {
      const lanes = d >= 16 && rng.chance(0.4) ? 2 : 1;
      const firstDir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
      for (let i = 0; i < lanes; i++) {
        const r = baseRow('tram');
        r.dir = i === 0 ? firstDir : (-firstDir as 1 | -1);
        r.laneIndex = i;
        r.laneCount = lanes;
        r.mix = ['tram'];
        r.speed = 7 + Math.min(d, 30) * 0.05;
        const lo = Math.max(3.2, 6 - d * 0.08);
        r.tramEvery = [lo, lo + 3.5];
        this.pushHazard(r, d);
      }
    }
  }

  private pushHazard(r: RowDef, d: number) {
    // caramelle sulle corsie: rischio e ricompensa
    if (this.rng.chance(0.3)) r.pickups.push({ col: this.rng.int(0, COLS - 1), kind: 'candy' });
    else if (d >= 3 && this.rng.chance(0.035)) r.pickups.push({ col: this.rng.int(0, COLS - 1), kind: 'slipper' });
    this.rows.push(r);
  }

  private appendMedian(d: number) {
    const rng = this.rng;
    const r = baseRow('median');
    const cols = rng.shuffle([...Array(COLS).keys()]);
    const count = rng.int(0, Math.min(3, 1 + Math.floor(d / 6)));
    const props: PropKind[] = ['bench', 'pot', 'bollard', 'bin', 'tree', 'fountain'];
    for (let k = 0; k < count; k++) r.blockers.push({ col: cols[k], kind: rng.pick(props) });
    const free = cols.slice(count);
    if (rng.chance(0.4)) r.puddles.push(free.pop()!);
    const pigeonCount = rng.int(0, 2);
    for (let k = 0; k < pigeonCount && free.length > 2; k++) r.pigeons.push(free.pop()!);
    // potenziamenti sugli spartitraffico
    const roll = rng.next();
    if (roll < 0.14) r.pickups.push({ col: free.pop()!, kind: 'coffee' });
    else if (roll < 0.26) r.pickups.push({ col: free.pop()!, kind: 'slipper' });
    else if (roll < 0.31) r.pickups.push({ col: free.pop()!, kind: 'heart' });
    else if (roll < 0.6) r.pickups.push({ col: free.pop()!, kind: 'candy' });
    this.pushSafe(r);
  }

  private appendStop() {
    if (this.stopQueue.length === 0) this.stopQueue = this.rng.shuffle([...STOP_KINDS]);
    const stop: Stop = { kind: this.stopQueue.pop()!, shop: this.rng.pick(SHOPS), entry: this.rows.length };
    this.stops.push(stop);
    for (let i = 0; i < STOP_ROWS; i++) {
      const r = baseRow('plaza');
      r.stop = stop;
      if (i > 0) {
        for (const c of [...STOP_LEFT, ...STOP_RIGHT]) r.blockers.push({ col: c, kind: 'bollard' });
      }
      if (i === 0 && this.rng.chance(0.8)) r.pigeons.push(this.rng.pick([3, 5]));
      this.pushSafe(r);
    }
    this.lastGroup = null;
  }

  /** Aggiunge un posto sicuro e controlla che dal precedente si possa sempre arrivare qui. */
  private pushSafe(r: RowDef) {
    const lower = this.rows[this.lastSafe];
    this.rows.push(r);
    this.fixTrap(lower, r);
    this.lastSafe = this.rows.length - 1;
  }

  /**
   * Nessuna "trappola": da ogni tratto libero del posto sicuro di sotto dev'esserci
   * almeno una colonna libera nel posto sicuro di sopra.
   */
  private fixTrap(lower: RowDef, upper: RowDef) {
    const blockedAt = (r: RowDef, c: number) => r.blockers.some((b) => b.col === c);
    for (let guard = 0; guard < COLS; guard++) {
      let trapped = -1;
      let c = 0;
      while (c < COLS) {
        if (blockedAt(lower, c)) {
          c++;
          continue;
        }
        let ok = false;
        const start = c;
        while (c < COLS && !blockedAt(lower, c)) {
          if (!blockedAt(upper, c)) ok = true;
          c++;
        }
        if (!ok) trapped = start;
      }
      if (trapped < 0) return;
      if (upper.stop) return; // la piazza ha sempre il passaggio centrale libero
      upper.blockers = upper.blockers.filter((b) => b.col !== trapped);
    }
  }
}
