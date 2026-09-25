import { describe, expect, it } from 'vitest';
import { COLS, STOP_LEFT, STOP_RIGHT, STOP_ROWS, World, difficultyAt, isHazard, isSafe } from '../src/world';
import type { RowDef } from '../src/world';

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

  it('all’inizio è facile: niente tram né bici nei primi 60 metri', () => {
    const w = new World(7);
    w.ensure(60);
    for (const r of w.rows.slice(0, 60)) expect(['tram', 'bike']).not.toContain(r.kind);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seme %i: nessuna trappola e soste ben formate', (seed) => {
    const w = new World(seed);
    w.ensure(2500);
    // posti sicuri consecutivi: da ogni tratto libero si deve poter proseguire
    const safe = w.rows.map((r, i) => (isSafe(r.kind) ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k + 1 < safe.length; k++) {
      const lower = w.rows[safe[k]];
      const upper = w.rows[safe[k + 1]];
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
      for (let i = 0; i < STOP_ROWS; i++) {
        const r = w.rows[s.entry + i];
        expect(r.kind).toBe('plaza');
        for (const c of [...STOP_LEFT, ...STOP_RIGHT]) expect(blockedAt(r, c)).toBe(i > 0);
        expect(blockedAt(r, 4)).toBe(false);
      }
    }
    // gli oggetti non stanno mai sull'arredo
    for (const r of w.rows) for (const p of r.pickups) expect(blockedAt(r, p.col)).toBe(false);
    // corsie sempre attraversabili
    for (const r of w.rows) {
      if (isHazard(r.kind) && r.kind !== 'tram') expect(r.gapMin).toBeGreaterThanOrEqual(r.kind === "bike" ? 1.55 : 1.75);
    }
  });
});
