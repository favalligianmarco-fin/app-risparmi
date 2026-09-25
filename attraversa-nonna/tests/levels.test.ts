import { describe, expect, it } from 'vitest';
import { COLS, generateLevel, isHazard } from '../src/levels';
import { Sim } from '../src/sim';
import { runBot } from './bot';

const LEVELS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('generatore di livelli', () => {
  it('è deterministico', () => {
    expect(generateLevel(7)).toEqual(generateLevel(7));
  });

  it.each(LEVELS)('livello %i: struttura valida', (n) => {
    const lv = generateLevel(n);
    expect(lv.rows[0].kind).toBe('sidewalk');
    expect(lv.rows[lv.rows.length - 1].kind).toBe('goal');
    for (const r of lv.rows) {
      const free = COLS - r.blockers.length;
      expect(free).toBeGreaterThanOrEqual(5);
      if (isHazard(r.kind) && r.kind !== 'tram') {
        expect(r.speed).toBeGreaterThan(0);
        expect(r.gapMin).toBeGreaterThan(1.5);
      }
    }
    const cells = new Set(lv.pickups.map((p) => `${p.row}:${p.col}`));
    expect(cells.size).toBe(lv.pickups.length);
  });
});

describe('ogni livello si può vincere', () => {
  it.each(LEVELS)('livello %i', (n) => {
    const lv = generateLevel(n);
    const res = runBot(new Sim(lv));
    expect(res.won).toBe(true);
    expect(res.hits).toBeLessThanOrEqual(1);
  });
});
