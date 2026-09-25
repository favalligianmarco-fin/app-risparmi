import { Rng } from './rng';
import { COLS, VEHICLE_LENGTH, World, doorRow, exitRow, isHazard, isTrain } from './world';
import type { PickupKind, RowDef, Stop, VehicleKind } from './world';

/**
 * Simulazione pura della corsa infinita: niente DOM, niente canvas. Il renderer
 * la legge, l'input la comanda, i test la fanno girare da sola (anche con un bot).
 */

/** Spazio fuori dallo schermo in cui i veicoli nascono e spariscono, in celle. */
export const MARGIN = 5;
export const STEP_TIME = 0.2;
export const STEP_TIME_COFFEE = 0.12;
export const COFFEE_TIME = 7;
export const SLIPPER_STOP = 2.6;
export const MAX_HEARTS = 3;
export const MAX_SLIPPERS = 3;
/** Metà larghezza della "scatola" di collisione della coppia nonna+scout. */
export const HIT_HALF_WIDTH = 0.26;
/**
 * Il temporale non resta mai più di così indietro rispetto al punto più lontano
 * raggiunto: fermi, lo si ha addosso in meno di 20 secondi all'inizio e in meno di
 * 8 più avanti.
 */
export const STORM_LAG = 8;
const STUN_TIME = 1.05;
const INVULN_TIME = 1.4;
const SLIP_TIME = 0.35;
const ACCEL = 5;
const DECEL = 16;
const TRAM_WARN = 1.8;
/** Quanto più forte va un automobilista di fretta. */
export const HURRY = 1.25;
/** Righe simulate sotto e sopra la coppia: il resto del mondo è fermo. */
const LIVE_BELOW = 12;
const LIVE_ABOVE = 26;

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Status = 'playing' | 'stop' | 'over';
export type OverCause = 'hits' | 'storm' | 'stop';

/** Velocità del temporale (righe al secondo) in funzione dei metri già fatti. */
export function stormSpeed(meters: number) {
  return Math.min(1.05, 0.42 + meters / 1300);
}

export interface Vehicle {
  id: number;
  row: number;
  kind: VehicleKind;
  /** Centro del veicolo, in celle. */
  x: number;
  len: number;
  dir: 1 | -1;
  speed: number;
  /** Velocità di crociera di questo mezzo. */
  cruise: number;
  /** Fermo per la ciabatta della nonna. */
  stopT: number;
  /** Fermo dopo una frenata d'emergenza. */
  hitStopT: number;
  color: number;
  honkT: number;
  /** Automobilista di fretta che non ha ancora suonato a chi gli sta davanti. */
  hurry: boolean;
  braking: boolean;
}

export interface RowState {
  def: RowDef;
  /** Veicoli della corsia, dal primo (il più avanti) all'ultimo. */
  vehicles: Vehicle[];
  live: boolean;
  nextGap: number;
  /** Tram e treni: secondi al prossimo passaggio, e se ne sta passando uno. */
  trainT: number;
  trainOn: boolean;
  nextTrain: VehicleKind;
  warn: boolean;
  blocked: boolean[];
  puddle: boolean[];
  /** Per ogni oggetto di def.pickups: da quanto è stato raccolto (-1 = ancora lì). */
  takenT: number[];
}

export interface Pigeon {
  x: number;
  y: number;
  flying: boolean;
  vx: number;
  vy: number;
  t: number;
  flip: boolean;
  gone: boolean;
}

export interface Player {
  col: number;
  row: number;
  fromCol: number;
  fromRow: number;
  /** Avanzamento del passo corrente: 0 → 1. */
  t: number;
  moving: boolean;
  stepDur: number;
  queued: Dir | null;
  facing: 1 | -1;
  hearts: number;
  hits: number;
  invuln: number;
  stunned: number;
  slip: number;
  safeCol: number;
  safeRow: number;
  slippers: number;
  slipperT: number;
  coffeeT: number;
  bumpT: number;
  bumpDx: number;
  bumpDy: number;
  steps: number;
}

export type SimEvent =
  | { type: 'step' }
  | { type: 'bump' }
  | { type: 'hit'; x: number; y: number }
  | { type: 'pickup'; kind: PickupKind; x: number; y: number }
  | { type: 'slipper'; x: number; y: number }
  | { type: 'noSlipper' }
  | { type: 'honk'; x: number; y: number }
  | { type: 'screech'; x: number; y: number }
  | { type: 'tramWarn'; row: number; train: VehicleKind }
  | { type: 'tramPass'; row: number; train: VehicleKind }
  | { type: 'splash'; x: number; y: number }
  | { type: 'pigeons'; x: number; y: number }
  | { type: 'respawn' }
  | { type: 'meter'; meters: number }
  | { type: 'stop'; stop: Stop }
  | { type: 'stormNear' }
  | { type: 'thunder' }
  | { type: 'over'; cause: OverCause };

const easeStep = (t: number) => t * t * (3 - 2 * t);

export class Sim {
  readonly world: World;
  readonly rows: RowState[] = [];
  readonly player: Player;
  readonly pigeons: Pigeon[] = [];
  events: SimEvent[] = [];
  status: Status = 'playing';
  overCause: OverCause | null = null;
  started = false;
  elapsed = 0;
  time = 0;
  candies = 0;
  /** Riga più lontana raggiunta: sono i metri percorsi. */
  maxRow = 0;
  stopsDone = 0;
  /** Il fronte del temporale, in righe. */
  stormY = -9;
  currentStop: Stop | null = null;
  /** Nella prima partita gli spaventi prima di questa riga non tolgono cuori. */
  graceRows = 0;
  private doneStops = new Set<number>();
  private rng: Rng;
  private nextId = 1;
  private pendingOver: OverCause | null = null;
  private liveLo = 0;
  private liveHi = -1;
  private stormWarned = false;
  private thunderT = 6;

  constructor(seed: number) {
    this.world = new World(seed);
    this.rng = new Rng(seed ^ 0x9e3779b9);
    const startCol = Math.floor(COLS / 2);
    this.player = {
      col: startCol,
      row: 0,
      fromCol: startCol,
      fromRow: 0,
      t: 1,
      moving: false,
      stepDur: STEP_TIME,
      queued: null,
      facing: 1,
      hearts: MAX_HEARTS,
      hits: 0,
      invuln: 0,
      stunned: 0,
      slip: 0,
      safeCol: startCol,
      safeRow: 0,
      slippers: 1,
      slipperT: 0,
      coffeeT: 0,
      bumpT: 0,
      bumpDx: 0,
      bumpDy: 0,
      steps: 0,
    };
    this.refreshLive();
  }

  /** Quanto è vicino il temporale: 0 = lontano quanto può, 1 = addosso alla nonna. */
  stormCloseness() {
    const gap = this.playerPos().y - this.stormY;
    return Math.max(0, Math.min(1, 1 - (gap - 0.5) / (STORM_LAG - 1)));
  }

  get meters() {
    return this.maxRow;
  }

  /** Mette la coppia ferma in una cella (per i test e per preparare gli screenshot). */
  placePlayer(row: number, col: number) {
    const p = this.player;
    p.row = p.fromRow = p.safeRow = row;
    p.col = p.fromCol = p.safeCol = col;
    p.t = 1;
    p.moving = false;
    this.maxRow = Math.max(this.maxRow, row);
    this.stormY = Math.min(this.stormY, row - STORM_LAG);
    this.refreshLive();
  }

  // ---------------------------------------------------------------- righe

  /** Stato della riga `i` (la genera se serve). */
  rowState(i: number): RowState {
    while (this.rows.length <= i) {
      const idx = this.rows.length;
      const def = this.world.row(idx);
      const blocked = Array<boolean>(COLS).fill(false);
      const puddle = Array<boolean>(COLS).fill(false);
      for (const b of def.blockers) blocked[b.col] = true;
      for (const c of def.puddles) puddle[c] = true;
      this.rows.push({
        def,
        vehicles: [],
        live: false,
        nextGap: 0,
        trainT: 0,
        trainOn: false,
        nextTrain: 'tram',
        warn: false,
        blocked,
        puddle,
        takenT: def.pickups.map(() => -1),
      });
      for (const col of def.pigeons) {
        this.pigeons.push({
          x: col + 0.5 + this.rng.range(-0.2, 0.2),
          y: idx + 0.5 + this.rng.range(-0.15, 0.15),
          flying: false,
          vx: 0,
          vy: 0,
          t: this.rng.range(0, 10),
          flip: this.rng.chance(0.5),
          gone: false,
        });
      }
    }
    return this.rows[i];
  }

  /** Attiva le righe vicine alla coppia e spegne quelle rimaste indietro. */
  private refreshLive() {
    const p = this.player;
    const lo = Math.max(0, Math.min(p.row, p.fromRow) - LIVE_BELOW);
    const hi = Math.max(p.row, p.fromRow) + LIVE_ABOVE;
    for (let i = this.liveLo; i < lo && i <= this.liveHi; i++) {
      const rs = this.rows[i];
      rs.live = false;
      rs.vehicles.length = 0;
      rs.warn = false;
      rs.trainOn = false;
    }
    for (let i = lo; i <= hi; i++) {
      const rs = this.rowState(i);
      if (!rs.live) {
        rs.live = true;
        this.fillRow(rs, i);
      }
    }
    this.liveLo = lo;
    this.liveHi = hi;
    // i piccioni rimasti molto indietro non servono più
    if (this.pigeons.length > 80) {
      const keep = this.pigeons.filter((g) => !g.gone && g.y > lo - 2);
      this.pigeons.length = 0;
      this.pigeons.push(...keep);
    }
  }

  // ---------------------------------------------------------------- traffico

  private entryPos(dir: 1 | -1) {
    // Posizione d'ingresso nello "spazio di marcia" (x * dir): cresce nel verso del traffico.
    return dir > 0 ? -MARGIN : -(COLS + MARGIN);
  }

  private exitPos(dir: 1 | -1) {
    return dir > 0 ? COLS + MARGIN : MARGIN;
  }

  private makeVehicle(row: number, def: RowDef, kind: VehicleKind, center: number): Vehicle {
    // l'alta velocità va quasi il doppio del regionale
    let cruise = kind === 'fast' ? def.speed * 1.75 : def.speed;
    // qualcuno va di fretta: raggiunge chi gli sta davanti, frena all'ultimo e suona
    const hurry = def.hurry > 0 && this.rng.chance(def.hurry);
    if (hurry) cruise *= HURRY;
    return {
      id: this.nextId++,
      row,
      kind,
      x: center * def.dir,
      len: VEHICLE_LENGTH[kind],
      dir: def.dir,
      speed: cruise,
      cruise,
      stopT: 0,
      hitStopT: 0,
      color: this.rng.int(0, 7),
      honkT: 0,
      braking: false,
      hurry,
    };
  }

  private sampleGap(def: RowDef) {
    return this.rng.range(def.gapMin, def.gapMax);
  }

  /** Riempie la corsia quando entra in gioco, così il traffico è già in movimento. */
  private fillRow(rs: RowState, row: number) {
    const def = rs.def;
    rs.vehicles.length = 0;
    if (def.kind === 'tram' || def.kind === 'rail') {
      rs.trainT = this.rng.range(2.8, def.trainEvery[1]);
      rs.trainOn = false;
      rs.nextTrain = this.rng.pick(def.mix);
      rs.warn = false;
      return;
    }
    if (def.kind !== 'road' && def.kind !== 'bike') return;
    const entry = this.entryPos(def.dir);
    let cursor = this.exitPos(def.dir) - this.rng.range(0, def.gapMax);
    for (;;) {
      const kind = this.rng.pick(def.mix);
      const len = VEHICLE_LENGTH[kind];
      const center = cursor - len / 2;
      if (center - len / 2 < entry) break;
      rs.vehicles.push(this.makeVehicle(row, def, kind, center));
      cursor = center - len / 2 - this.sampleGap(def);
    }
    rs.nextGap = this.sampleGap(def);
  }

  private updateRow(rs: RowState, row: number, h: number) {
    const def = rs.def;
    const dir = def.dir;
    const list = rs.vehicles;

    const trainRow = def.kind === 'tram' || def.kind === 'rail';
    if (trainRow && !rs.trainOn) {
      rs.trainT -= h;
      // il treno veloce si annuncia con più anticipo
      const warnAt = rs.nextTrain === 'fast' ? TRAM_WARN + 0.5 : rs.nextTrain === 'regional' ? TRAM_WARN + 0.2 : TRAM_WARN;
      if (!rs.warn && rs.trainT <= warnAt) {
        rs.warn = true;
        this.events.push({ type: 'tramWarn', row, train: rs.nextTrain });
      }
      if (rs.trainT <= 0) {
        const kind = rs.nextTrain;
        const center = this.entryPos(dir) - VEHICLE_LENGTH[kind] / 2;
        list.push(this.makeVehicle(row, def, kind, center));
        rs.trainOn = true;
        this.events.push({ type: 'tramPass', row, train: kind });
      }
    }

    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.stopT > 0) v.stopT -= h;
      if (v.hitStopT > 0) v.hitStopT -= h;
      let desired = v.stopT > 0 || v.hitStopT > 0 ? 0 : v.cruise;
      if (i > 0) {
        const leader = list[i - 1];
        const gap = leader.x * dir - leader.len / 2 - (v.x * dir + v.len / 2);
        if (gap < 0.3) desired = 0;
        else if (gap < 1.4) desired = Math.min(desired, leader.speed + (gap - 0.3) * 1.6);
        // chi ha fretta, arrivato attaccato a quello davanti, suona (una volta sola)
        if (v.hurry && gap < 1 && v.x > -1 && v.x < COLS + 1) {
          v.hurry = false;
          // (senza pescare dal generatore casuale: il clacson non deve cambiare il traffico)
          if (v.id % 5 < 3) v.honkT = 0.05;
        }
      }
      const dv = desired - v.speed;
      v.speed += dv > 0 ? Math.min(dv, ACCEL * h) : Math.max(dv, -DECEL * h);
      v.braking = dv < -0.05 || (desired === 0 && v.speed < 0.05);
      v.x += dir * v.speed * h;
      if (v.honkT > 0) {
        v.honkT -= h;
        if (v.honkT <= 0) this.events.push({ type: 'honk', x: v.x, y: row + 0.5 });
      }
    }

    const exit = this.exitPos(dir);
    while (list.length && list[0].x * dir - list[0].len / 2 > exit) list.shift();

    if (trainRow) {
      if (rs.trainOn && list.length === 0) {
        rs.trainOn = false;
        rs.nextTrain = this.rng.pick(def.mix);
        rs.warn = false;
        rs.trainT = this.rng.range(def.trainEvery[0], def.trainEvery[1]);
      }
      return;
    }
    if (def.kind !== 'road' && def.kind !== 'bike') return;

    const entry = this.entryPos(dir);
    const last = list[list.length - 1];
    const free = last ? last.x * dir - last.len / 2 - entry : Infinity;
    if (free >= rs.nextGap) {
      const kind = this.rng.pick(def.mix);
      const v = this.makeVehicle(row, def, kind, entry - VEHICLE_LENGTH[kind] / 2);
      if (last) v.speed = Math.min(v.speed, last.speed + 0.5);
      list.push(v);
      rs.nextGap = this.sampleGap(def);
    }
  }

  // ---------------------------------------------------------------- giocatore

  /** Posizione disegnata della coppia, al centro della cella (in celle). */
  playerPos(): { x: number; y: number } {
    const p = this.player;
    const k = easeStep(p.t);
    return {
      x: p.fromCol + (p.col - p.fromCol) * k + 0.5,
      y: p.fromRow + (p.row - p.fromRow) * p.t + 0.5,
    };
  }

  /** La riga in cui la coppia "conta" per le collisioni: si cambia a metà salto. */
  logicalRow(): number {
    const p = this.player;
    return p.moving && p.t < 0.5 ? p.fromRow : p.row;
  }

  input(dir: Dir) {
    const p = this.player;
    if (this.status !== 'playing' || p.stunned > 0) return;
    if (!p.moving && p.slip <= 0) this.tryMove(dir);
    else p.queued = dir;
  }

  canUseSlipper() {
    return this.status === 'playing' && this.player.stunned <= 0 && this.player.slippers > 0;
  }

  /** La nonna alza la ciabatta: chi la vede inchioda. Tram e treni no. */
  useSlipper(): boolean {
    const p = this.player;
    if (this.status !== 'playing' || p.stunned > 0) return false;
    if (p.slippers <= 0) {
      this.events.push({ type: 'noSlipper' });
      return false;
    }
    p.slippers--;
    p.slipperT = 0.9;
    this.started = true;
    // ferma un'intera carreggiata davanti (al massimo sono cinque corsie di fila)
    for (let r = Math.max(0, p.row - 1); r <= p.row + 5; r++) {
      for (const v of this.rowState(r).vehicles) {
        if (isTrain(v.kind)) continue;
        v.stopT = SLIPPER_STOP;
        v.honkT = this.rng.chance(0.35) ? this.rng.range(0.5, 1.8) : 0;
      }
    }
    const pos = this.playerPos();
    this.events.push({ type: 'slipper', x: pos.x, y: pos.y });
    return true;
  }

  /** Veicolo fermo (o quasi) che occupa la cella: ci si sbatte contro, non si viene investiti. */
  private parkedAt(row: number, col: number): boolean {
    const rs = this.rowState(row);
    const cx = col + 0.5;
    return rs.vehicles.some((v) => v.speed < 0.6 && Math.abs(v.x - cx) < v.len / 2 + HIT_HALF_WIDTH);
  }

  private tryMove(dir: Dir) {
    const p = this.player;
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const dy = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
    const nc = p.col + dx;
    const nr = p.row + dy;
    if (dx) p.facing = dx > 0 ? 1 : -1;
    const blocked = nc < 0 || nc >= COLS || nr < 0 || this.rowState(nr).blocked[nc] || this.parkedAt(nr, nc);
    if (blocked) {
      p.bumpT = 0.18;
      p.bumpDx = dx;
      p.bumpDy = dy;
      this.events.push({ type: 'bump' });
      return;
    }
    p.fromCol = p.col;
    p.fromRow = p.row;
    p.col = nc;
    p.row = nr;
    p.t = 0;
    p.moving = true;
    p.stepDur = p.coffeeT > 0 ? STEP_TIME_COFFEE : STEP_TIME;
    p.steps++;
    this.started = true;
    this.refreshLive();
    this.events.push({ type: 'step' });
  }

  private arrive() {
    const p = this.player;
    const rs = this.rowState(p.row);
    const def = rs.def;
    if (!isHazard(def.kind)) {
      p.safeCol = p.col;
      p.safeRow = p.row;
    }
    if (p.row > this.maxRow) {
      this.maxRow = p.row;
      this.events.push({ type: 'meter', meters: this.maxRow });
    }
    if (rs.puddle[p.col]) {
      p.slip = SLIP_TIME;
      this.events.push({ type: 'splash', x: p.col + 0.5, y: p.row + 0.5 });
    }
    def.pickups.forEach((pk, i) => {
      if (rs.takenT[i] >= 0 || pk.col !== p.col) return;
      rs.takenT[i] = 0;
      if (pk.kind === 'candy') this.candies++;
      else if (pk.kind === 'coffee') p.coffeeT = COFFEE_TIME;
      else if (pk.kind === 'slipper') p.slippers = Math.min(MAX_SLIPPERS, p.slippers + 1);
      else p.hearts = Math.min(MAX_HEARTS, p.hearts + 1);
      this.events.push({ type: 'pickup', kind: pk.kind, x: pk.col + 0.5, y: p.row + 0.5 });
    });
    const stop = def.stop;
    if (stop && p.row === doorRow(stop) && !this.doneStops.has(stop.entry)) {
      this.doneStops.add(stop.entry);
      this.status = 'stop';
      this.currentStop = stop;
      p.queued = null;
      this.events.push({ type: 'stop', stop });
    }
  }

  /**
   * Fine del minigioco della sosta. Se è andato bene: caramelle e un cuore in
   * regalo; se è andato male la nonna si offende e costa un cuore.
   */
  finishStop(success: boolean, reward = 0) {
    const stop = this.currentStop;
    if (this.status !== 'stop' || !stop) return;
    const p = this.player;
    this.currentStop = null;
    if (success) {
      this.stopsDone++;
      this.candies += reward;
      p.hearts = Math.min(MAX_HEARTS, p.hearts + 1);
    } else {
      p.hearts--;
      p.hits++;
      if (p.hearts <= 0) {
        this.status = 'over';
        this.overCause = 'stop';
        this.events.push({ type: 'over', cause: 'stop' });
        return;
      }
    }
    // la coppia esce dalla piazza, in cima, e il temporale riparte da lontano
    const exit = exitRow(stop);
    p.col = p.fromCol = p.safeCol = 4;
    p.row = p.fromRow = p.safeRow = exit;
    p.t = 1;
    p.moving = false;
    this.maxRow = Math.max(this.maxRow, exit);
    this.stormY = Math.min(this.stormY, exit - STORM_LAG);
    this.stormWarned = false;
    this.status = 'playing';
    this.refreshLive();
    this.events.push({ type: 'meter', meters: this.maxRow });
  }

  private hit(v: Vehicle, px: number) {
    const p = this.player;
    if (v.row >= this.graceRows) {
      p.hearts--;
      p.hits++;
    }
    p.stunned = STUN_TIME;
    p.moving = false; // la coppia resta "congelata" dov'era, a metà salto
    p.queued = null;
    const rs = this.rowState(v.row);
    const y = this.logicalRow() + 0.5;
    if (isTrain(v.kind)) {
      // tram e treni non frenano: lo scout tira indietro la nonna appena in tempo
      p.col = p.fromCol = p.safeCol;
      p.row = p.fromRow = p.safeRow;
      p.t = 1;
      this.events.push({ type: 'hit', x: p.col + 0.5, y: p.row + 0.5 });
    } else {
      // frenata all'ultimo: il veicolo si ferma a un palmo dalla nonna
      v.x = px - v.dir * (v.len / 2 + HIT_HALF_WIDTH + 0.12);
      v.speed = 0;
      v.hitStopT = 1.3;
      const idx = rs.vehicles.indexOf(v);
      for (let i = idx + 1; i < rs.vehicles.length; i++) {
        const lead = rs.vehicles[i - 1];
        const f = rs.vehicles[i];
        const maxFront = lead.x * v.dir - lead.len / 2 - 0.25;
        if (f.x * v.dir + f.len / 2 > maxFront) {
          f.x = (maxFront - f.len / 2) * v.dir;
          f.speed = Math.min(f.speed, lead.speed);
        }
      }
      this.events.push({ type: 'screech', x: v.x, y });
      this.events.push({ type: 'hit', x: px, y });
    }
    if (p.hearts <= 0) this.pendingOver = 'hits';
  }

  private respawn() {
    const p = this.player;
    p.col = p.fromCol = p.safeCol;
    p.row = p.fromRow = p.safeRow;
    p.t = 1;
    p.moving = false;
    p.invuln = INVULN_TIME;
    this.events.push({ type: 'respawn' });
  }

  private end(cause: OverCause) {
    this.status = 'over';
    this.overCause = cause;
    this.player.queued = null;
    this.events.push({ type: 'over', cause });
  }

  private updatePlayer(h: number) {
    const p = this.player;
    if (p.invuln > 0) p.invuln -= h;
    if (p.slipperT > 0) p.slipperT -= h;
    if (p.coffeeT > 0) p.coffeeT -= h;
    if (p.bumpT > 0) p.bumpT -= h;
    if (p.stunned > 0) {
      p.stunned -= h;
      if (p.stunned <= 0) {
        p.stunned = 0;
        if (this.pendingOver) this.end(this.pendingOver);
        else this.respawn();
      }
      return;
    }
    if (p.slip > 0) p.slip -= h;
    if (p.moving) {
      p.t += h / p.stepDur;
      if (p.t >= 1) {
        p.t = 1;
        p.moving = false;
        this.arrive();
      }
    }
    if (!p.moving && p.queued && p.slip <= 0 && this.status === 'playing') {
      const d = p.queued;
      p.queued = null;
      this.tryMove(d);
    }
  }

  private checkCollisions() {
    const p = this.player;
    if (this.status !== 'playing' || p.stunned > 0 || p.invuln > 0) return;
    const row = this.logicalRow();
    const rs = this.rowState(row);
    if (!isHazard(rs.def.kind)) return;
    const px = this.playerPos().x;
    for (const v of rs.vehicles) {
      if (v.speed > 0.6 && Math.abs(v.x - px) < v.len / 2 + HIT_HALF_WIDTH) {
        this.hit(v, px);
        return;
      }
    }
  }

  /** Il temporale avanza da dietro: se raggiunge la nonna, la corsa è finita. */
  private updateStorm(h: number) {
    if (!this.started) return;
    this.stormY = Math.max(this.stormY + stormSpeed(this.maxRow) * h, this.maxRow - STORM_LAG);
    const py = this.playerPos().y;
    const gap = py - this.stormY;
    if (gap < 3.2 && !this.stormWarned) {
      this.stormWarned = true;
      this.events.push({ type: 'stormNear' });
    } else if (gap > 4.5) this.stormWarned = false;
    this.thunderT -= h;
    if (this.thunderT <= 0) {
      this.thunderT = this.rng.range(5, 11);
      if (gap < 9) this.events.push({ type: 'thunder' });
    }
    if (gap < 0.15 && this.player.stunned <= 0) this.end('storm');
  }

  private updatePigeons(h: number) {
    const pos = this.playerPos();
    let scattered = false;
    for (const g of this.pigeons) {
      if (g.gone) continue;
      g.t += h;
      if (!g.flying) {
        const dx = g.x - pos.x;
        const dy = g.y - pos.y;
        if (dx * dx + dy * dy < 1.3 * 1.3) {
          g.flying = true;
          g.vx = (dx >= 0 ? 1 : -1) * this.rng.range(1.5, 3);
          g.vy = this.rng.range(3, 4.5);
          g.flip = g.vx < 0;
          g.t = 0;
          scattered = true;
        }
      } else {
        g.x += g.vx * h;
        g.y += g.vy * h;
        if (g.y > pos.y + 20) g.gone = true;
      }
    }
    if (scattered) this.events.push({ type: 'pigeons', x: pos.x, y: pos.y });
  }

  update(dt: number) {
    if (this.status === 'stop') return;
    const clamped = Math.min(dt, 0.1);
    const steps = Math.max(1, Math.ceil(clamped / (1 / 60)));
    const h = clamped / steps;
    for (let s = 0; s < steps; s++) this.tick(h);
  }

  private tick(h: number) {
    this.time += h;
    if (this.status === 'playing' && this.started) this.elapsed += h;
    for (let i = this.liveLo; i <= this.liveHi; i++) {
      const rs = this.rows[i];
      if (rs.live) this.updateRow(rs, i, h);
      for (let k = 0; k < rs.takenT.length; k++) if (rs.takenT[k] >= 0) rs.takenT[k] += h;
    }
    if (this.status === 'playing') {
      this.updatePlayer(h);
      if (this.status === 'playing') this.checkCollisions();
      if (this.status === 'playing') this.updateStorm(h);
    }
    this.updatePigeons(h);
  }
}
