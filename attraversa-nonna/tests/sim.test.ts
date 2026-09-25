import { describe, expect, it } from 'vitest';
import { HIT_HALF_WIDTH, MAX_HEARTS, Sim } from '../src/sim';
import type { SimEvent } from '../src/sim';
import { DOOR_COL, exitRow, isHazard } from '../src/world';
import { runBot } from './bot';

const run = (sim: Sim, seconds: number, onEvent?: (e: SimEvent) => void) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    sim.update(1 / 60);
    if (onEvent) sim.events.forEach(onEvent);
    sim.events.length = 0;
  }
};

describe('bot', () => {
  it.each([11, 22, 33, 44, 55])('seme %i: si arriva oltre i 250 metri senza trappole', (seed) => {
    const res = runBot(new Sim(seed), 250, 900);
    expect(res.meters).toBeGreaterThanOrEqual(250);
    expect(res.stops).toBeGreaterThanOrEqual(1);
  });
});

describe('oltre i 1000 metri', () => {
  it.each([7, 77])('seme %i: anche con i mezzi velocissimi si riesce ad andare avanti', (seed) => {
    const sim = new Sim(seed);
    sim.world.ensure(1400);
    const start = sim.world.rows.findIndex((r, i) => i > 1150 && r.kind === 'median');
    sim.placePlayer(start, 4);
    sim.started = true;
    // senza temporale: si misura solo se la strada è attraversabile
    const origUpdate = sim.update.bind(sim);
    sim.update = (dt: number) => {
      sim.stormY = -1e9;
      origUpdate(dt);
    };
    const res = runBot(sim, start + 80, 800);
    expect(res.meters).toBeGreaterThanOrEqual(start + 80);
  });
});

describe('tram', () => {
  it('arriva davvero, dopo il segnale di avviso', () => {
    const sim = new Sim(3);
    sim.world.ensure(400);
    const tram = sim.world.rows.findIndex((r) => r.kind === 'tram');
    expect(tram).toBeGreaterThan(0);
    sim.placePlayer(tram - 1, 4);
    const seen: string[] = [];
    run(sim, 25, (e) => {
      if ((e.type === 'tramWarn' || e.type === 'tramPass') && e.row === tram) seen.push(e.type);
    });
    expect(seen.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i + 1 < seen.length; i += 2) expect(seen.slice(i, i + 2)).toEqual(['tramWarn', 'tramPass']);
  });
});

describe('treni', () => {
  it('sul binario passano regionali e alta velocità, e l\'alta velocità va più forte', () => {
    const sim = new Sim(8);
    sim.world.ensure(1500);
    const rails = sim.world.rows.map((r, i) => (r.kind === 'rail' ? i : -1)).filter((i) => i >= 0);
    const speeds: Record<string, number> = {};
    for (const row of rails.slice(0, 6)) {
      sim.placePlayer(row - 1, 4);
      run(sim, 30, (e) => {
        if (e.type === 'tramPass' && e.row === row) {
          const v = sim.rowState(row).vehicles[0];
          speeds[v.kind] = v.cruise;
        }
      });
    }
    expect(speeds.regional).toBeGreaterThan(7);
    expect(speeds.fast).toBeGreaterThan(speeds.regional * 1.5);
  });
});

describe('ciabatta', () => {
  it('ferma i veicoli nelle corsie vicine; senza ciabatte non succede niente', () => {
    const sim = new Sim(5);
    run(sim, 1);
    expect(sim.useSlipper()).toBe(true);
    run(sim, 0.8);
    const near = [1, 2, 3, 4].flatMap((r) => sim.rowState(r).vehicles.filter((v) => v.kind !== 'tram'));
    expect(near.length).toBeGreaterThan(0);
    for (const v of near) expect(v.speed).toBeLessThan(0.05);
    expect(sim.player.slippers).toBe(0);
    expect(sim.useSlipper()).toBe(false);
  });
});

describe('investimento evitato', () => {
  it('toglie un cuore, il veicolo si ferma prima e la coppia torna al sicuro', () => {
    const sim = new Sim(9);
    let hit = false;
    for (let i = 0; i < 900 && !hit; i++) {
      if (!sim.player.moving && isHazard(sim.rowState(sim.player.row + 1).def.kind)) sim.input('up');
      sim.update(1 / 60);
      hit = sim.events.some((e) => e.type === 'hit');
      sim.events.length = 0;
    }
    expect(hit).toBe(true);
    expect(sim.player.hearts).toBe(MAX_HEARTS - 1);
    const row = sim.logicalRow();
    const px = sim.playerPos().x;
    for (const v of sim.rowState(row).vehicles) {
      if (v.speed === 0 && v.kind !== 'tram') expect(Math.abs(v.x - px)).toBeGreaterThanOrEqual(v.len / 2 + HIT_HALF_WIDTH);
    }
    run(sim, 1.2);
    expect(isHazard(sim.rowState(sim.player.row).def.kind)).toBe(false);
    expect(sim.player.invuln).toBeGreaterThan(0);
  });
});

describe('prima partita', () => {
  it('nei primi metri gli spaventi non tolgono cuori', () => {
    const sim = new Sim(9);
    sim.graceRows = 12;
    let hits = 0;
    for (let i = 0; i < 900 && hits === 0; i++) {
      if (!sim.player.moving && isHazard(sim.rowState(sim.player.row + 1).def.kind)) sim.input('up');
      sim.update(1 / 60);
      hits += sim.events.filter((e) => e.type === 'hit').length;
      sim.events.length = 0;
    }
    expect(hits).toBe(1);
    expect(sim.player.hearts).toBe(MAX_HEARTS);
  });
});

describe('temporale', () => {
  it('chi resta fermo viene raggiunto', () => {
    const sim = new Sim(12);
    sim.input('left');
    let over: SimEvent | undefined;
    run(sim, 60, (e) => {
      if (e.type === 'over') over = e;
    });
    expect(sim.status).toBe('over');
    expect(over).toEqual({ type: 'over', cause: 'storm' });
  });
});

describe('soste', () => {
  it('si entra dal portone; finito bene si esce dietro il palazzo', () => {
    const sim = new Sim(21);
    sim.world.ensure(300);
    const stop = sim.world.stops[0];
    // in piazza ma di lato: il muro non si attraversa
    sim.placePlayer(stop.entry, 2);
    sim.input('up');
    run(sim, 0.4);
    expect(sim.status).toBe('playing');
    expect(sim.player.row).toBe(stop.entry);
    // davanti al portone sì
    sim.placePlayer(stop.entry, DOOR_COL);
    sim.player.invuln = 99;
    sim.input('up');
    const events: SimEvent[] = [];
    run(sim, 0.4, (e) => events.push(e));
    expect(sim.status).toBe('stop');
    expect(events.some((e) => e.type === 'stop')).toBe(true);
    const before = sim.candies;
    sim.player.hearts = 2;
    sim.finishStop(true, 7);
    expect(sim.status).toBe('playing');
    expect(sim.candies).toBe(before + 7);
    expect(sim.player.hearts).toBe(3);
    expect(sim.player.row).toBe(exitRow(stop));
    expect(sim.meters).toBe(exitRow(stop));
  });

  it('un minigioco fallito costa un cuore', () => {
    const sim = new Sim(21);
    sim.world.ensure(300);
    const stop = sim.world.stops[0];
    sim.placePlayer(stop.entry, DOOR_COL);
    sim.player.invuln = 99;
    sim.input('up');
    run(sim, 0.4);
    sim.finishStop(false);
    expect(sim.player.hearts).toBe(MAX_HEARTS - 1);
    expect(sim.status).toBe('playing');
  });
});

describe('movimento', () => {
  it('non esce dai bordi e non attraversa l’arredo urbano', () => {
    const sim = new Sim(1);
    for (let i = 0; i < 6; i++) {
      sim.input('left');
      run(sim, 0.3);
    }
    // colonna 0 del marciapiede di casa è occupata dall'idrante
    expect(sim.player.col).toBe(1);
    const bumps: SimEvent[] = [];
    sim.input('left');
    run(sim, 0.3, (e) => e.type === 'bump' && bumps.push(e));
    expect(bumps.length).toBe(1);
  });

  it('raccoglie una caramella entrando nella sua cella', () => {
    const sim = new Sim(4);
    sim.world.ensure(200);
    const row = sim.world.rows.findIndex((r, i) => i > 0 && r.kind === 'median' && r.pickups.some((p) => p.kind === 'candy'));
    const col = sim.world.rows[row].pickups.find((p) => p.kind === 'candy')!.col;
    sim.placePlayer(row - 1, col);
    sim.player.invuln = 99;
    sim.input('up');
    run(sim, 0.3);
    expect(sim.candies).toBe(1);
  });
});
