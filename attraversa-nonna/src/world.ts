import { Rng } from './rng';

/**
 * La strada infinita. Ogni riga è un metro: la distanza percorsa dalla nonna è
 * semplicemente l'indice della riga più lontana raggiunta. Il mondo si genera a
 * pezzi man mano che si avanza, sempre uguale a parità di seme.
 */

/** Larghezza giocabile, in celle. */
export const COLS = 9;

export type RowKind = 'sidewalk' | 'road' | 'median' | 'bike' | 'tram' | 'rail' | 'plaza';
/**
 * I mezzi, in versione "all'italiana" ma senza marchi: l'utilitaria squadrata, la
 * piccola tondeggiante col tettuccio di tela, il furgoncino col cassone alto, il
 * pullman, lo scooter, il motocarro, la bici, il tram e i treni (regionale e alta velocità).
 */
export type VehicleKind =
  | 'boxy'
  | 'bubble'
  | 'fiorino'
  | 'bus'
  | 'scooter'
  | 'trike'
  | 'bike'
  | 'tram'
  | 'regional'
  | 'fast';
export type PropKind = 'bench' | 'pot' | 'bollard' | 'bin' | 'tree' | 'hydrant' | 'fountain' | 'lamp';
export type PickupKind = 'candy' | 'coffee' | 'slipper' | 'heart';
export type StopKind = 'tiramisu' | 'poste' | 'ago' | 'pranzo';

export const STOP_KINDS: StopKind[] = ['tiramisu', 'poste', 'ago', 'pranzo'];
export const VEHICLE_LENGTH: Record<VehicleKind, number> = {
  boxy: 1.45,
  bubble: 1.2,
  fiorino: 1.75,
  bus: 3.3,
  scooter: 0.95,
  trike: 1.15,
  bike: 0.85,
  tram: 7.2,
  regional: 9.6,
  fast: 12.6,
};

/** Tram e treni non frenano per nessuno (e nemmeno per la ciabatta). */
export const isTrain = (k: VehicleKind) => k === 'tram' || k === 'regional' || k === 'fast';

/**
 * Una sosta: la piazza davanti, un palazzo largo quanto la strada con il portone
 * al centro, e l'uscita dietro. Entrare dal portone avvia il minigioco.
 * Righe: 0 piazza, 1 facciata col portone, 2-4 dentro il palazzo, 5 uscita.
 */
export const STOP_ROWS = 6;
export const DOOR_COL = 4;

export interface Stop {
  kind: StopKind;
  /** Prima riga della piazza. */
  entry: number;
}

/** Riga della facciata: la cella del portone è l'unica libera. */
export const doorRow = (s: Stop) => s.entry + 1;
export const exitRow = (s: Stop) => s.entry + STOP_ROWS - 1;

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
  /** Tram e treni: secondi tra un passaggio e il successivo. */
  trainEvery: [number, number];
  laneIndex: number;
  laneCount: number;
  busLane: boolean;
  blockers: { col: number; kind: PropKind }[];
  puddles: number[];
  pigeons: number[];
  pickups: { col: number; kind: PickupKind }[];
  stop: Stop | null;
  /** Quota di automobilisti di fretta: vanno più forte, raggiungono chi sta davanti e suonano. */
  hurry: number;
}

export const isHazard = (k: RowKind) => k === 'road' || k === 'bike' || k === 'tram' || k === 'rail';
export const isSafe = (k: RowKind) => !isHazard(k);

function baseRow(kind: RowKind): RowDef {
  return {
    kind,
    dir: 1,
    speed: 0,
    mix: [],
    gapMin: 0,
    gapMax: 0,
    trainEvery: [0, 0],
    laneIndex: 0,
    laneCount: 1,
    busLane: false,
    blockers: [],
    puddles: [],
    pigeons: [],
    pickups: [],
    stop: null,
    hurry: 0,
  };
}

/**
 * Difficoltà in funzione dei metri: governa quante corsie, quanto fitto il traffico
 * e quali novità compaiono. 1 alla partenza, ~15 a 250 m, 45 (il massimo) verso i 790 m.
 */
export function difficultyAt(meters: number): number {
  return Math.min(45, 1 + meters / 18);
}

/**
 * Quanto vanno veloci i mezzi rispetto alla partenza: cresce sempre coi metri,
 * ×1.9 a 250 m, ×2.8 a 500 m, ×4.6 a 1000 m, fino a ×5 verso i 1120 m.
 */
export function speedFactor(meters: number): number {
  return Math.min(5, 1 + meters / 280);
}

type Group = 'road' | 'bike' | 'tram' | 'rail';
/** Corsie pericolose di fila al massimo, anche quando le carreggiate si incastrano. */
const MAX_RUN = 5;

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
    const lanes = this.appendGroup(d);
    // da ~200 m in poi le carreggiate cominciano a incastrarsi senza spartitraffico in
    // mezzo, ma mai più di MAX_RUN corsie di fila
    const tangle = d < 12 ? 0 : Math.min(0.65, 0.15 + (d - 12) * 0.013);
    if (this.rng.chance(tangle) && this.rows.length + 3 < this.nextStopAt && lanes < MAX_RUN) {
      this.appendGroup(d, lanes);
    }
    this.appendMedian(d);
  }

  private pickGroup(d: number, joined: boolean): Group {
    const options: Group[] = ['road', 'road', 'road'];
    if (d >= 4.5) options.push('bike');
    if (d >= 6 && this.lastGroup !== 'tram') options.push('tram', 'tram');
    if (d >= 9 && this.lastGroup !== 'rail') options.push('rail', 'rail');
    // una corsia "attaccata" alla precedente è quasi sempre una pista ciclabile o un binario
    if (joined && d >= 6) options.push('bike', 'tram');
    let g = this.rng.pick(options);
    if (joined && g === this.lastGroup && g !== 'road') g = 'road';
    return g;
  }

  /**
   * Aggiunge una carreggiata (strada, pista ciclabile, tram o ferrovia) e dice quante
   * corsie ha. `runBefore` sono le corsie pericolose subito sotto, se si incastra.
   */
  private appendGroup(d: number, runBefore = 0): number {
    const rng = this.rng;
    const before = this.rows.length;
    const joined = runBefore > 0;
    const maxLanes = MAX_RUN - runBefore;
    const kind = this.pickGroup(d, joined);
    this.lastGroup = kind;
    // la prima strada, davanti a casa, è una via tranquilla
    const meters = this.rows.length;
    const quiet = meters < 4;
    const carBase = quiet ? 1.05 : 1.25 * speedFactor(meters);
    const gapMin = quiet ? 4.2 : Math.max(1.75, 3.4 - d * 0.04);
    const gapSpread = Math.max(1.6, 4.2 - d * 0.05);
    // più il mezzo è veloce, più spazio serve per passargli davanti: si tiene un
    // minimo di "tempo libero" tra un veicolo e l'altro, più largo quando le corsie di
    // fila sono tante (come nei viali veri, dove ogni corsia è meno fitta)
    const timeGap = (r: RowDef, lanes: number) => {
      const run = runBefore + lanes;
      r.gapMin = Math.max(r.gapMin, r.speed * (0.5 + 0.07 * Math.max(0, run - 2)) + 0.7);
      r.gapMax = Math.max(r.gapMax, r.gapMin + 1.6);
    };

    if (kind === 'road') {
      let lanes: number;
      if (d < 3) lanes = 2;
      else {
        const base = 2 + Math.floor((d - 1) / 8);
        lanes = Math.max(joined ? 1 : 2, Math.min(4, base + rng.int(-1, 1)));
        if (d >= 28 && rng.chance(Math.min(0.35, 0.15 + (d - 28) * 0.01))) lanes = 5;
        if (joined) lanes = Math.min(lanes, 2, maxLanes);
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
          r.mix = ['scooter', 'scooter', 'scooter', 'bubble'];
          r.speed = carBase * rng.range(1.25, 1.45);
        } else if (d >= 5 && roll < 0.36 && (i === 0 || i === lanes - 1)) {
          r.mix = ['bus', 'bus', 'fiorino'];
          r.speed = carBase * rng.range(0.7, 0.85);
          r.busLane = true;
          r.gapMin += 0.6;
        } else if (roll < 0.5) {
          r.mix = ['bubble', 'boxy', 'bubble', 'fiorino', 'trike'];
          r.speed = carBase * rng.range(0.75, 0.95);
        } else {
          r.mix = ['boxy', 'boxy', 'bubble', 'fiorino', 'boxy'];
          r.speed = carBase * rng.range(0.9, 1.15);
        }
        // gli scooter corrono già: la fretta ce l'hanno le auto e i furgoni
        if (!r.mix.includes('scooter')) r.hurry = d < 5 ? 0 : Math.min(0.2, 0.05 + (d - 5) * 0.004);
        timeGap(r, lanes);
        this.pushHazard(r, d);
      }
    } else if (kind === 'bike') {
      const lanes = Math.min(maxLanes, d >= 12 && rng.chance(0.5) ? 2 : 1);
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
        timeGap(r, lanes);
        this.pushHazard(r, d);
      }
    } else if (kind === 'rail') {
      // ferrovia: regionali lenti e treni ad alta velocità, con passaggio a livello
      const tracks = Math.min(maxLanes, d >= 18 && rng.chance(0.45) ? 2 : 1);
      const firstDir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
      const fastShare = Math.min(0.6, 0.25 + (d - 9) * 0.01);
      for (let i = 0; i < tracks; i++) {
        const r = baseRow('rail');
        r.dir = i === 0 ? firstDir : (-firstDir as 1 | -1);
        r.laneIndex = i;
        r.laneCount = tracks;
        r.mix = rng.chance(fastShare) ? ['fast', 'fast', 'regional'] : ['regional', 'regional', 'fast'];
        r.speed = Math.min(12, 8 + meters / 250);
        const lo = Math.max(3.6, 7.5 - d * 0.07);
        r.trainEvery = [lo, lo + 4];
        this.pushHazard(r, d);
      }
    } else {
      const lanes = Math.min(maxLanes, d >= 16 && rng.chance(0.4) ? 2 : 1);
      const firstDir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
      for (let i = 0; i < lanes; i++) {
        const r = baseRow('tram');
        r.dir = i === 0 ? firstDir : (-firstDir as 1 | -1);
        r.laneIndex = i;
        r.laneCount = lanes;
        r.mix = ['tram'];
        r.speed = Math.min(11, 6.5 + meters / 300);
        const lo = Math.max(3.2, 6 - d * 0.08);
        r.trainEvery = [lo, lo + 3.5];
        this.pushHazard(r, d);
      }
    }
    return this.rows.length - before;
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
    const stop: Stop = { kind: this.stopQueue.pop()!, entry: this.rows.length };
    this.stops.push(stop);
    for (let i = 0; i < STOP_ROWS; i++) {
      const r = baseRow('plaza');
      r.stop = stop;
      if (i === 0) {
        // la piazza davanti al palazzo: due lampioni ai lati e qualche piccione
        r.blockers.push({ col: 0, kind: 'lamp' }, { col: COLS - 1, kind: 'lamp' });
        if (this.rng.chance(0.8)) r.pigeons.push(this.rng.pick([2, 6]));
      } else if (i < STOP_ROWS - 1) {
        // il palazzo: si entra solo dal portone
        for (let c = 0; c < COLS; c++) if (i > 1 || c !== DOOR_COL) r.blockers.push({ col: c, kind: 'bollard' });
      } else if (this.rng.chance(0.6)) r.pigeons.push(this.rng.pick([1, 7]));
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
      // dentro il palazzo si passa solo dal portone; i lampioni della piazza invece si tolgono
      if (upper.stop && upper.blockers.some((b) => b.kind !== 'lamp')) return;
      upper.blockers = upper.blockers.filter((b) => b.col !== trapped);
    }
  }
}
