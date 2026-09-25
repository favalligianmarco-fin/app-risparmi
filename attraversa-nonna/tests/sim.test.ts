import { describe, expect, it } from 'vitest';
import { generateLevel } from '../src/levels';
import { HIT_HALF_WIDTH, MAX_HEARTS, Sim } from '../src/sim';
import type { SimEvent } from '../src/sim';

const run = (sim: Sim, seconds: number, onEvent?: (e: SimEvent) => void) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    sim.update(1 / 60);
    if (onEvent) sim.events.forEach(onEvent);
    sim.events.length = 0;
  }
};

describe('tram', () => {
  it('arriva davvero, dopo il segnale di avviso', () => {
    const sim = new Sim(generateLevel(6));
    const seen: string[] = [];
    run(sim, 25, (e) => {
      if (e.type === 'tramWarn' || e.type === 'tramPass') seen.push(e.type);
    });
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen[0]).toBe('tramWarn');
    for (let i = 0; i + 1 < seen.length; i += 2) expect(seen.slice(i, i + 2)).toEqual(['tramWarn', 'tramPass']);
  });
});

describe('ombrello', () => {
  it('ferma i veicoli nelle corsie vicine, ma non il tram', () => {
    const sim = new Sim(generateLevel(9));
    run(sim, 1);
    expect(sim.useUmbrella()).toBe(true);
    run(sim, 0.8);
    const near = sim.rows.slice(0, 5).flatMap((r) => r.vehicles);
    expect(near.length).toBeGreaterThan(0);
    for (const v of near) expect(v.speed).toBeLessThan(0.05);
    expect(sim.player.umbrellas).toBe(0);
    expect(sim.useUmbrella()).toBe(false);
  });
});

describe('investimento evitato', () => {
  it('toglie un cuore e il veicolo si ferma prima della nonna', () => {
    const sim = new Sim(generateLevel(3));
    let hit = false;
    // cammina dritto nel traffico finché qualcosa non inchioda
    for (let i = 0; i < 600 && !hit; i++) {
      if (!sim.player.moving && sim.player.row < 1) sim.input('up');
      sim.update(1 / 60);
      hit = sim.events.some((e) => e.type === 'hit');
      sim.events.length = 0;
    }
    expect(hit).toBe(true);
    expect(sim.player.hearts).toBe(MAX_HEARTS - 1);
    const row = sim.logicalRow();
    const px = sim.playerPos().x;
    for (const v of sim.rows[row].vehicles) {
      if (v.speed === 0) expect(Math.abs(v.x - px)).toBeGreaterThanOrEqual(v.len / 2 + HIT_HALF_WIDTH);
    }
    run(sim, 1.2);
    // torna sul marciapiede, lampeggiante e intoccabile per un attimo
    expect(sim.player.row).toBe(0);
    expect(sim.player.invuln).toBeGreaterThan(0);
  });
});

describe('movimento', () => {
  it('non esce dai bordi e non attraversa l’arredo urbano', () => {
    const sim = new Sim(generateLevel(1));
    for (let i = 0; i < 6; i++) {
      sim.input('left');
      run(sim, 0.3);
    }
    // colonna 0 del marciapiede è occupata dall'idrante: ci si ferma alla colonna 1
    expect(sim.player.col).toBe(1);
    const bumps: SimEvent[] = [];
    sim.input('left');
    run(sim, 0.3, (e) => e.type === 'bump' && bumps.push(e));
    expect(bumps.length).toBe(1);
  });

  it('raccoglie una caramella entrando nella sua cella', () => {
    const lv = generateLevel(1);
    const sim = new Sim(lv);
    const candy = sim.pickups.find((p) => p.kind === 'candy')!;
    Object.assign(sim.player, { row: candy.row - 1, fromRow: candy.row - 1, col: candy.col, fromCol: candy.col, invuln: 99 });
    sim.input('up');
    run(sim, 0.3);
    expect(sim.candies).toBe(1);
    expect(candy.taken).toBe(true);
  });
});
