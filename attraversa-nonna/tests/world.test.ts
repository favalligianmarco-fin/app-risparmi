import { describe, expect, it } from 'vitest';
import { COLS, DOOR_COL, STOP_ROWS, World, difficultyAt, doorRow, exitRow, isHazard, isSafe, speedFactor } from '../src/world';
import type { RowDef } from '../src/world';
void isHazard;

const blockedAt = (r: RowDef, c: number) => r.blockers.some((b) => b.col === c);

describe('strada infinita', () => {
  it('è deterministica a parità di seme', () => {
    const a = new World(42);
    const b = new World(42);
    a.ensure(800);
    b.ensure(800);
    expect(a.rows.slice(0, 800)).toEqual(b.rows.slice(0, 800));
    const c = new World(43);
    c.ensure(800);
    expect(c.rows.slice(0, 800)).not.toEqual(a.rows.slice(0, 800));
  });

  it('la difficoltà cresce coi metri fino a un tetto', () => {
    expect(difficultyAt(0)).toBe(1);
    expect(difficultyAt(250)).toBeGreaterThan(difficultyAt(100));
    expect(difficultyAt(5000)).toBe(45);
  });

  it('i mezzi vanno sempre più veloci', () => {
    const w = new World(3);
    w.ensure(1500);
    const avg = (from: number, to: number) => {
      const lanes = w.rows.slice(from, to).filter((r) => r.kind === 'road');
      return lanes.reduce((a, r) => a + r.speed, 0) / lanes.length;
    };
    expect(avg(100, 200)).toBeGreaterThan(avg(5, 60) * 1.2);
    expect(avg(500, 600)).toBeGreaterThan(avg(100, 200) * 1.3);
    expect(avg(1100, 1300)).toBeGreaterThan(avg(500, 600) * 1.3);
    expect(speedFactor(0)).toBe(1);
    expect(speedFactor(10000)).toBe(5);
  });

  it('più avanti arrivano i treni', () => {
    const w = new World(5);
    w.ensure(1200);
    const rails = w.rows.filter((r) => r.kind === 'rail');
    expect(rails.length).toBeGreaterThan(3);
    expect(w.rows.findIndex((r) => r.kind === 'rail')).toBeGreaterThan(130);
    expect(rails.some((r) => r.mix.includes('fast'))).toBe(true);
  });

  it('all’inizio è facile: niente tram né bici nei primi 60 metri', () => {
    const w = new World(7);
    w.ensure(60);
    for (const r of w.rows.slice(0, 60)) expect(['tram', 'bike']).not.toContain(r.kind);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seme %i: nessuna trappola e soste ben formate', (seed) => {
    const w = new World(seed);
    w.ensure(2500);
    // posti sicuri consecutivi: da ogni tratto libero si deve poter proseguire
    // (dentro il palazzo della sosta si passa solo dal portone: lì si controlla a parte)
    const inside = (i: number) => {
      const r = w.rows[i];
      return !!r.stop && i > r.stop.entry && i < exitRow(r.stop);
    };
    const safe = w.rows.map((r, i) => (isSafe(r.kind) && !inside(i) ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k + 1 < safe.length; k++) {
      const lower = w.rows[safe[k]];
      const upper = w.rows[safe[k + 1]];
      if (upper.stop && safe[k + 1] === exitRow(upper.stop)) continue;
      let c = 0;
      while (c < COLS) {
        if (blockedAt(lower, c)) {
          c++;
          continue;
        }
        let ok = false;
        while (c < COLS && !blockedAt(lower, c)) {
          if (!blockedAt(upper, c)) ok = true;
          c++;
        }
        expect(ok).toBe(true);
      }
    }
    expect(w.stops.length).toBeGreaterThan(10);
    for (const s of w.stops) {
      expect(w.rows[s.entry].kind).toBe('plaza');
      // davanti al palazzo la piazza è aperta, la facciata ha solo il portone
      for (let c = 1; c < COLS - 1; c++) expect(blockedAt(w.rows[s.entry], c)).toBe(false);
      for (let c = 0; c < COLS; c++) expect(blockedAt(w.rows[doorRow(s)], c)).toBe(c !== DOOR_COL);
      for (let i = doorRow(s) + 1; i < exitRow(s); i++) for (let c = 0; c < COLS; c++) expect(blockedAt(w.rows[i], c)).toBe(true);
      expect(exitRow(s) - s.entry).toBe(STOP_ROWS - 1);
      expect(blockedAt(w.rows[exitRow(s)], DOOR_COL)).toBe(false);
    }
    // gli oggetti non stanno mai sull'arredo
    for (const r of w.rows) for (const p of r.pickups) expect(blockedAt(r, p.col)).toBe(false);
    // corsie sempre attraversabili
    for (const r of w.rows) {
      if (r.kind === 'road' || r.kind === 'bike') {
        expect(r.gapMin).toBeGreaterThanOrEqual(r.kind === 'bike' ? 1.55 : 1.75);
        // abbastanza "tempo libero" tra un mezzo e l'altro, anche quando vanno forte
        expect(r.gapMin / r.speed).toBeGreaterThanOrEqual(0.5);
      }
    }
  });
});
