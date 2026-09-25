import { Rng } from './rng';

/** Larghezza giocabile, in celle. Tutta la logica ragiona in celle, non in pixel. */
export const COLS = 9;

export type RowKind = 'sidewalk' | 'road' | 'median' | 'bike' | 'tram' | 'goal';
export type VehicleKind = 'car' | 'van' | 'bus' | 'scooter' | 'trike' | 'bike' | 'tram';
export type PropKind = 'bench' | 'pot' | 'bollard' | 'bin' | 'tree' | 'hydrant' | 'fountain';
export type PickupKind = 'candy' | 'coffee' | 'umbrella';

export const DESTINATIONS = [
  'pharmacy',
  'bakery',
  'market',
  'church',
  'post',
  'hairdresser',
  'newsstand',
  'florist',
  'gelato',
  'cafe',
  'library',
  'bocce',
] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const VEHICLE_LENGTH: Record<VehicleKind, number> = {
  car: 1.5,
  van: 2.05,
  bus: 3.3,
  scooter: 0.95,
  trike: 1.15,
  bike: 0.85,
  tram: 7.2,
};

export interface RowDef {
  kind: RowKind;
  /** +1: il traffico va verso destra, -1: verso sinistra. */
  dir: 1 | -1;
  /** Velocità di crociera della corsia, in celle al secondo. */
  speed: number;
  /** Tipi di veicolo della corsia (le ripetizioni fanno da peso). */
  mix: VehicleKind[];
  /** Spazio libero tra due veicoli consecutivi, in celle. */
  gapMin: number;
  gapMax: number;
  /** Solo per i tram: secondi tra un passaggio e il successivo. */
  tramEvery: [number, number];
  /** Posizione della corsia nella sua carreggiata, per disegnare la segnaletica. */
  laneIndex: number;
  laneCount: number;
  busLane: boolean;
  blockers: { col: number; kind: PropKind }[];
  puddles: number[];
  pigeons: number[];
}

export interface PickupDef {
  row: number;
  col: number;
  kind: PickupKind;
}

export interface LevelDef {
  n: number;
  seed: number;
  rows: RowDef[];
  pickups: PickupDef[];
  startCol: number;
  destination: Destination;
  /** Tempo entro cui si guadagna la terza stella. */
  parTime: number;
  umbrellas: number;
  /** Suggerimento mostrato a inizio livello quando entra in gioco una novità. */
  intro: 'tap' | 'umbrella' | 'swipe' | 'bike' | 'tram' | 'bus' | null;
}

const isHazard = (k: RowKind) => k === 'road' || k === 'bike' || k === 'tram';

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
  };
}

type Group = 'road' | 'bike' | 'tram';

export function generateLevel(n: number): LevelDef {
  const seed = (n * 2654435761) ^ 0x5eed;
  const rng = new Rng(seed);
  const d = Math.min(n, 40);

  // Velocità e densità crescono dolcemente col livello.
  const carBase = 1.3 + d * 0.055;
  const gapMin = Math.max(1.9, 3.4 - d * 0.045);
  const gapSpread = Math.max(1.8, 4.2 - d * 0.05);

  const groupCount = n <= 3 ? 1 : n <= 7 ? 2 : n <= 14 ? 3 : 4;
  const groups: Group[] = [];
  for (let g = 0; g < groupCount; g++) {
    if (g === 0) {
      groups.push('road');
      continue;
    }
    const options: Group[] = ['road', 'road'];
    if (n >= 4) options.push('bike');
    if (n >= 6 && groups[g - 1] !== 'tram') options.push('tram', 'tram');
    groups.push(rng.pick(options));
  }
  // Il livello in cui compare una novità la mostra di sicuro.
  if (n === 4 && !groups.includes('bike')) groups[1] = 'bike';
  if (n === 6 && !groups.includes('tram')) groups[1] = 'tram';

  const rows: RowDef[] = [];
  rows.push(baseRow('sidewalk'));

  const roadLanes = () => {
    if (n <= 2) return 2;
    const base = 2 + Math.floor((d - 1) / 7);
    return Math.max(2, Math.min(4, base + rng.int(-1, 1)));
  };

  let usedBus = false;
  for (let g = 0; g < groups.length; g++) {
    const kind = groups[g];
    if (g > 0) {
      const median = baseRow('median');
      rows.push(median);
    }
    if (kind === 'road') {
      const lanes = roadLanes();
      // Traffico a destra: le corsie in basso vanno a destra, quelle in alto a sinistra.
      const rightward = lanes === 1 ? 1 : Math.ceil(lanes / 2);
      for (let i = 0; i < lanes; i++) {
        const r = baseRow('road');
        r.dir = i < rightward ? 1 : -1;
        r.laneIndex = i;
        r.laneCount = lanes;
        r.gapMin = gapMin + rng.range(0, 0.6);
        r.gapMax = r.gapMin + gapSpread + rng.range(0, 1.2);
        const roll = rng.next();
        if (n >= 3 && roll < 0.22) {
          // corsia degli scooter: veloci e piccoli
          r.mix = ['scooter', 'scooter', 'scooter', 'car'];
          r.speed = carBase * rng.range(1.25, 1.45);
        } else if (n >= 5 && roll < 0.36 && (i === 0 || i === lanes - 1)) {
          // corsia preferenziale: autobus lenti e lunghi
          r.mix = ['bus', 'bus', 'van'];
          r.speed = carBase * rng.range(0.7, 0.85);
          r.busLane = true;
          r.gapMin += 0.6;
          usedBus = true;
        } else if (roll < 0.5) {
          r.mix = ['car', 'car', 'car', 'van', 'trike'];
          r.speed = carBase * rng.range(0.75, 0.95);
        } else {
          r.mix = ['car', 'car', 'car', 'car', 'van'];
          r.speed = carBase * rng.range(0.9, 1.15);
        }
        rows.push(r);
      }
    } else if (kind === 'bike') {
      const lanes = n >= 12 && rng.chance(0.5) ? 2 : 1;
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
        rows.push(r);
      }
    } else {
      const lanes = n >= 16 && rng.chance(0.4) ? 2 : 1;
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
        rows.push(r);
      }
    }
  }
  rows.push(baseRow('goal'));

  // Arredo urbano sugli spartitraffico: panchine, vasi, alberi... ma sempre un passaggio libero.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.kind === 'median') {
      const cols = rng.shuffle([...Array(COLS).keys()]);
      const count = rng.int(0, Math.min(3, 1 + Math.floor(d / 6)));
      const props: PropKind[] = ['bench', 'pot', 'bollard', 'bin', 'tree', 'fountain'];
      for (let k = 0; k < count; k++) r.blockers.push({ col: cols[k], kind: rng.pick(props) });
      const free = cols.slice(count);
      if (rng.chance(0.45)) r.puddles.push(free.pop()!);
      const pigeonCount = rng.int(0, 2);
      for (let k = 0; k < pigeonCount && free.length; k++) r.pigeons.push(free.pop()!);
    } else if (r.kind === 'sidewalk') {
      r.blockers.push({ col: 0, kind: 'hydrant' });
      r.blockers.push({ col: COLS - 1, kind: 'bin' });
      if (rng.chance(0.6)) r.pigeons.push(rng.pick([2, 6]));
    }
  }

  // Nessuna "trappola": da ogni tratto libero di uno spartitraffico dev'essere possibile
  // attraversare fino a una cella libera del posto sicuro successivo.
  for (let i = 0; i < rows.length - 1; i++) {
    if (isHazard(rows[i].kind)) continue;
    let j = i + 1;
    while (j < rows.length && isHazard(rows[j].kind)) j++;
    if (j >= rows.length) break;
    const blockedAt = (r: RowDef, c: number) => r.blockers.some((b) => b.col === c);
    for (let guard = 0; guard < COLS; guard++) {
      let trapped = -1;
      let c = 0;
      while (c < COLS) {
        if (blockedAt(rows[i], c)) {
          c++;
          continue;
        }
        let ok = false;
        const start = c;
        while (c < COLS && !blockedAt(rows[i], c)) {
          if (!blockedAt(rows[j], c)) ok = true;
          c++;
        }
        if (!ok) trapped = start;
      }
      if (trapped < 0) break;
      // libera la cella sopra il tratto intrappolato
      rows[j].blockers = rows[j].blockers.filter((b) => b.col !== trapped);
    }
  }

  // Oggetti da raccogliere: caramelle sulle corsie (rischio/ricompensa) e qualche potenziamento.
  const pickups: PickupDef[] = [];
  const taken = new Set<string>();
  const freeCell = (rowFilter: (r: RowDef) => boolean): { row: number; col: number } | null => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = rng.int(1, rows.length - 2);
      const r = rows[row];
      if (!rowFilter(r)) continue;
      const col = rng.int(0, COLS - 1);
      const key = `${row}:${col}`;
      if (taken.has(key)) continue;
      if (r.blockers.some((b) => b.col === col) || r.puddles.includes(col) || r.pigeons.includes(col)) continue;
      taken.add(key);
      return { row, col };
    }
    return null;
  };
  const candies = Math.min(7, 3 + Math.floor(n / 5));
  for (let i = 0; i < candies; i++) {
    const c = freeCell((r) => isHazard(r.kind) || r.kind === 'median');
    if (c) pickups.push({ ...c, kind: 'candy' });
  }
  if (n >= 3 && rng.chance(0.55)) {
    const c = freeCell((r) => r.kind === 'median' || r.kind === 'road');
    if (c) pickups.push({ ...c, kind: 'coffee' });
  }
  if (n >= 5 && rng.chance(0.4)) {
    const c = freeCell((r) => isHazard(r.kind));
    if (c) pickups.push({ ...c, kind: 'umbrella' });
  }

  const hazardRows = rows.filter((r) => isHazard(r.kind)).length;
  const parTime = Math.round(3 + rows.length * 0.55 + hazardRows * 0.95 + groups.filter((g) => g === 'tram').length * 2.5);

  let intro: LevelDef['intro'] = null;
  if (n === 1) intro = 'tap';
  else if (n === 2) intro = 'umbrella';
  else if (n === 3) intro = 'swipe';
  else if (n === 4) intro = 'bike';
  else if (n === 6) intro = 'tram';
  else if (usedBus && n <= 7) intro = 'bus';

  return {
    n,
    seed,
    rows,
    pickups,
    startCol: Math.floor(COLS / 2),
    destination: DESTINATIONS[(n - 1) % DESTINATIONS.length],
    parTime,
    umbrellas: n === 1 ? 0 : n >= 15 ? 2 : 1,
    intro,
  };
}

export { isHazard };
