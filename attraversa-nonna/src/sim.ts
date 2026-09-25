import { COLS, VEHICLE_LENGTH, isHazard } from './levels';
import type { LevelDef, PickupKind, RowDef, VehicleKind } from './levels';
import { Rng } from './rng';

/**
 * Simulazione pura del gioco: niente DOM, niente canvas. Il renderer la legge,
 * l'input la comanda, i test la fanno girare da sola (anche con un bot).
 */

/** Spazio fuori dallo schermo in cui i veicoli nascono e spariscono, in celle. */
export const MARGIN = 5;
export const STEP_TIME = 0.2;
export const STEP_TIME_COFFEE = 0.12;
export const COFFEE_TIME = 7;
export const UMBRELLA_STOP = 2.6;
export const MAX_HEARTS = 3;
/** Metà larghezza della "scatola" di collisione della coppia nonna+scout. */
export const HIT_HALF_WIDTH = 0.26;
const STUN_TIME = 1.05;
const INVULN_TIME = 1.4;
const SLIP_TIME = 0.35;
const ACCEL = 5;
const DECEL = 16;
const TRAM_WARN = 1.8;

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Status = 'playing' | 'won' | 'lost';

export interface Vehicle {
  id: number;
  row: number;
  kind: VehicleKind;
  /** Centro del veicolo, in celle. */
  x: number;
  len: number;
  dir: 1 | -1;
  speed: number;
  /** Fermo per l'ombrello della nonna. */
  stopT: number;
  /** Fermo dopo una frenata d'emergenza. */
  hitStopT: number;
  color: number;
  honkT: number;
  braking: boolean;
}

export interface RowState {
  def: RowDef;
  /** Veicoli della corsia, dal primo (il più avanti) all'ultimo. */
  vehicles: Vehicle[];
  nextGap: number;
  tramT: number;
  /** Un tram sta attraversando (dall'ingresso all'uscita). */
  tramOn: boolean;
  warn: boolean;
  blocked: boolean[];
  puddle: boolean[];
}

export interface Pickup {
  row: number;
  col: number;
  kind: PickupKind;
  taken: boolean;
  takenT: number;
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
  umbrellas: number;
  umbrellaT: number;
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
  | { type: 'umbrella'; x: number; y: number }
  | { type: 'noUmbrella' }
  | { type: 'honk'; x: number; y: number }
  | { type: 'screech'; x: number; y: number }
  | { type: 'tramWarn'; row: number }
  | { type: 'tramPass'; row: number }
  | { type: 'splash'; x: number; y: number }
  | { type: 'pigeons'; x: number; y: number }
  | { type: 'respawn' }
  | { type: 'win' }
  | { type: 'lose' };

const easeStep = (t: number) => t * t * (3 - 2 * t);

export class Sim {
  readonly level: LevelDef;
  readonly rows: RowState[];
  readonly player: Player;
  readonly pickups: Pickup[];
  readonly pigeons: Pigeon[] = [];
  events: SimEvent[] = [];
  status: Status = 'playing';
  started = false;
  elapsed = 0;
  time = 0;
  candies = 0;
  candiesTotal: number;
  private rng: Rng;
  private nextId = 1;
  private pendingLose = false;

  constructor(level: LevelDef, seed = level.seed) {
    this.level = level;
    this.rng = new Rng(seed ^ 0x9e3779b9);
    this.rows = level.rows.map((def) => {
      const blocked = Array<boolean>(COLS).fill(false);
      const puddle = Array<boolean>(COLS).fill(false);
      for (const b of def.blockers) blocked[b.col] = true;
      for (const c of def.puddles) puddle[c] = true;
      return {
        def,
        vehicles: [],
        nextGap: 0,
        tramT: 0,
        tramOn: false,
        warn: false,
        blocked,
        puddle,
      };
    });
    this.rows.forEach((rs, row) => this.fillRow(rs, row));

    this.pickups = level.pickups.map((p) => ({ ...p, taken: false, takenT: 0 }));
    this.candiesTotal = this.pickups.filter((p) => p.kind === 'candy').length;

    level.rows.forEach((def, row) => {
      for (const col of def.pigeons) {
        this.pigeons.push({
          x: col + 0.5 + this.rng.range(-0.2, 0.2),
          y: row + 0.5 + this.rng.range(-0.15, 0.15),
          flying: false,
          vx: 0,
          vy: 0,
          t: this.rng.range(0, 10),
          flip: this.rng.chance(0.5),
          gone: false,
        });
      }
    });

    this.player = {
      col: level.startCol,
      row: 0,
      fromCol: level.startCol,
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
      safeCol: level.startCol,
      safeRow: 0,
      umbrellas: level.umbrellas,
      umbrellaT: 0,
      coffeeT: 0,
      bumpT: 0,
      bumpDx: 0,
      bumpDy: 0,
      steps: 0,
    };
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
    return {
      id: this.nextId++,
      row,
      kind,
      x: center * def.dir,
      len: VEHICLE_LENGTH[kind],
      dir: def.dir,
      speed: def.speed,
      stopT: 0,
      hitStopT: 0,
      color: this.rng.int(0, 7),
      honkT: 0,
      braking: false,
    };
  }

  private sampleGap(def: RowDef) {
    return this.rng.range(def.gapMin, def.gapMax);
  }

  /** Riempie la corsia a inizio livello, così il traffico è già in movimento. */
  private fillRow(rs: RowState, row: number) {
    const def = rs.def;
    if (def.kind === 'tram') {
      rs.tramT = this.rng.range(2.8, 5);
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

    if (def.kind === 'tram') {
      if (!rs.tramOn) {
        rs.tramT -= h;
        if (!rs.warn && rs.tramT <= TRAM_WARN) {
          rs.warn = true;
          this.events.push({ type: 'tramWarn', row });
        }
        if (rs.tramT <= 0) {
          const center = this.entryPos(dir) - VEHICLE_LENGTH.tram / 2;
          list.push(this.makeVehicle(row, def, 'tram', center));
          rs.tramOn = true;
          this.events.push({ type: 'tramPass', row });
        }
      }
    }

    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.stopT > 0) v.stopT -= h;
      if (v.hitStopT > 0) v.hitStopT -= h;
      let desired = v.stopT > 0 || v.hitStopT > 0 ? 0 : def.speed;
      if (i > 0) {
        const leader = list[i - 1];
        const gap = leader.x * dir - leader.len / 2 - (v.x * dir + v.len / 2);
        if (gap < 0.3) desired = 0;
        else if (gap < 1.4) desired = Math.min(desired, leader.speed + (gap - 0.3) * 1.6);
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

    if (def.kind === 'tram') {
      if (rs.tramOn && list.length === 0) {
        rs.tramOn = false;
        rs.warn = false;
        rs.tramT = this.rng.range(def.tramEvery[0], def.tramEvery[1]);
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

  /** La corsia in cui la coppia "conta" per le collisioni: si cambia a metà salto. */
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

  canUseUmbrella() {
    return this.status === 'playing' && this.player.stunned <= 0 && this.player.umbrellas > 0;
  }

  useUmbrella(): boolean {
    const p = this.player;
    if (this.status !== 'playing' || p.stunned > 0) return false;
    if (p.umbrellas <= 0) {
      this.events.push({ type: 'noUmbrella' });
      return false;
    }
    p.umbrellas--;
    p.umbrellaT = 0.9;
    this.started = true;
    for (const rs of this.rows) {
      for (const v of rs.vehicles) {
        if (v.kind === 'tram') continue;
        if (v.row < p.row - 1 || v.row > p.row + 4) continue;
        v.stopT = UMBRELLA_STOP;
        v.honkT = this.rng.chance(0.35) ? this.rng.range(0.5, 1.8) : 0;
      }
    }
    const pos = this.playerPos();
    this.events.push({ type: 'umbrella', x: pos.x, y: pos.y });
    return true;
  }

  /** Veicolo fermo (o quasi) che occupa la cella: ci si sbatte contro, non si viene investiti. */
  private parkedAt(row: number, col: number): boolean {
    const rs = this.rows[row];
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
    const blocked =
      nc < 0 || nc >= COLS || nr < 0 || nr >= this.rows.length || this.rows[nr].blocked[nc] || this.parkedAt(nr, nc);
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
    this.events.push({ type: 'step' });
  }

  private arrive() {
    const p = this.player;
    const rs = this.rows[p.row];
    const kind = rs.def.kind;
    if (!isHazard(kind)) {
      p.safeCol = p.col;
      p.safeRow = p.row;
    }
    if (rs.puddle[p.col]) {
      p.slip = SLIP_TIME;
      this.events.push({ type: 'splash', x: p.col + 0.5, y: p.row + 0.5 });
    }
    for (const pk of this.pickups) {
      if (pk.taken || pk.row !== p.row || pk.col !== p.col) continue;
      pk.taken = true;
      if (pk.kind === 'candy') this.candies++;
      else if (pk.kind === 'coffee') p.coffeeT = COFFEE_TIME;
      else p.umbrellas++;
      this.events.push({ type: 'pickup', kind: pk.kind, x: pk.col + 0.5, y: pk.row + 0.5 });
    }
    if (kind === 'goal') {
      this.status = 'won';
      p.queued = null;
      this.events.push({ type: 'win' });
    }
  }

  private hit(v: Vehicle, px: number) {
    const p = this.player;
    p.hearts--;
    p.hits++;
    p.stunned = STUN_TIME;
    p.moving = false; // la coppia resta "congelata" dov'era, a metà salto
    p.queued = null;
    // Frenata all'ultimo: il veicolo si ferma a un palmo dalla nonna.
    const rs = this.rows[v.row];
    if (v.kind !== 'tram') {
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
    }
    const y = this.logicalRow() + 0.5;
    if (v.kind === 'tram') {
      // il tram non frena: lo scout tira indietro la nonna appena in tempo
      p.col = p.fromCol = p.safeCol;
      p.row = p.fromRow = p.safeRow;
      p.t = 1;
      this.events.push({ type: 'hit', x: p.col + 0.5, y: p.row + 0.5 });
    } else {
      this.events.push({ type: 'screech', x: v.x, y });
      this.events.push({ type: 'hit', x: px, y });
    }
    if (p.hearts <= 0) this.pendingLose = true;
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

  private updatePlayer(h: number) {
    const p = this.player;
    if (p.invuln > 0) p.invuln -= h;
    if (p.umbrellaT > 0) p.umbrellaT -= h;
    if (p.coffeeT > 0) p.coffeeT -= h;
    if (p.bumpT > 0) p.bumpT -= h;
    if (p.stunned > 0) {
      p.stunned -= h;
      if (p.stunned <= 0) {
        p.stunned = 0;
        if (this.pendingLose) {
          this.status = 'lost';
          this.events.push({ type: 'lose' });
        } else {
          this.respawn();
        }
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
    const rs = this.rows[row];
    if (!isHazard(rs.def.kind)) return;
    const px = this.playerPos().x;
    for (const v of rs.vehicles) {
      if (v.speed > 0.6 && Math.abs(v.x - px) < v.len / 2 + HIT_HALF_WIDTH) {
        this.hit(v, px);
        return;
      }
    }
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
        if (g.y > this.rows.length + 8) g.gone = true;
      }
    }
    if (scattered) this.events.push({ type: 'pigeons', x: pos.x, y: pos.y });
  }

  update(dt: number) {
    const clamped = Math.min(dt, 0.1);
    const steps = Math.max(1, Math.ceil(clamped / (1 / 60)));
    const h = clamped / steps;
    for (let s = 0; s < steps; s++) this.tick(h);
  }

  private tick(h: number) {
    this.time += h;
    if (this.status === 'playing' && this.started) this.elapsed += h;
    this.rows.forEach((rs, row) => this.updateRow(rs, row, h));
    if (this.status === 'playing') {
      this.updatePlayer(h);
      this.checkCollisions();
    } else if (this.status === 'won') {
      const p = this.player;
      if (p.umbrellaT > 0) p.umbrellaT -= h;
    }
    this.updatePigeons(h);
    for (const pk of this.pickups) if (pk.taken) pk.takenT += h;
  }

  stars(): number {
    if (this.status !== 'won') return 0;
    return 1 + (this.player.hits === 0 ? 1 : 0) + (this.elapsed <= this.level.parTime ? 1 : 0);
  }
}
