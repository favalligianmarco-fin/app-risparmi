// Screenshot per l'App Store (iPhone 6,9": 1320×2868) in italiano e inglese.
// Uso: npm run screenshots   →   docs/screenshots/<lingua>/*.jpg
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();

for (const locale of ['it-IT', 'en-US']) {
  const lang = locale.slice(0, 2);
  const dir = `docs/screenshots/${lang}`;
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale });
  await ctx.addInitScript(() => {
    localStorage.setItem(
      'attraversa-nonna-v2',
      JSON.stringify({ version: 2, best: 487, candies: 146, nonna: 'campania', owned: ['campania', 'calabria', 'veneto', 'lazio', 'sicilia'], runs: 9, music: false, sfx: false, haptics: false, tutorial: true }),
    );
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5198/');
  await page.waitForFunction(() => window.__game?.sim);
  await page.waitForTimeout(1500);
  const shot = async (name) => {
    await page.evaluate(() => (document.getElementById('hint').hidden = true));
    await page.screenshot({ path: `${dir}/${name}.jpg`, type: 'jpeg', quality: 92 });
    console.log(`${dir}/${name}.jpg`);
  };
  /** Nuova corsa con un seme fisso, coppia ferma nella riga `row`. */
  const start = (seed, row, col = 4, extra = {}) =>
    page.evaluate(
      ({ seed, row, col, extra }) => {
        const g = window.__game;
        const rnd = Math.random;
        Math.random = () => seed;
        g.play();
        Math.random = rnd;
        const sim = g.sim;
        sim.world.ensure(row + 60);
        let r = row;
        while (!['median', 'sidewalk', 'plaza'].includes(sim.world.rows[r].kind)) r++;
        sim.placePlayer(r, col);
        Object.assign(sim.player, { invuln: 0 }, extra);
        sim.candies = 23;
        sim.started = true;
        sim.stormY = r - 14;
        g.renderer.setSim(sim);
        return r;
      },
      { seed, row, col, extra },
    );

  await shot('1-titolo');

  // la ciabatta ferma il traffico
  await start(0.31, 40, 4, { slippers: 2 });
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.__game.sim.useSlipper());
  await page.waitForTimeout(330);
  await shot('2-ciabatta');

  // il palazzo della sosta, con la freccia sul portone
  await page.evaluate(() => {
    const g = window.__game;
    const sim = g.sim;
    sim.world.ensure(600);
    const st = sim.world.stops.find((s) => s.entry > sim.player.row) ?? sim.world.stops[0];
    st.kind = 'pranzo';
    g.renderer.setSim(sim);
    sim.placePlayer(st.entry, 2);
    sim.stormY = st.entry - 20;
  });
  await page.waitForTimeout(1200);
  await shot('3-palazzo');

  // minigioco: salta la fila alla posta
  await page.evaluate(() => {
    const g = window.__game;
    const sim = g.sim;
    sim.world.ensure(600);
    const st = sim.world.stops.find((s) => s.entry > sim.player.row) ?? sim.world.stops[0];
    st.kind = 'poste';
    sim.placePlayer(st.entry, 4);
    sim.player.invuln = 99;
    sim.input('up');
  });
  await page.waitForSelector('[data-go]');
  await page.click('[data-go]');
  await page.mouse.move(220, 800);
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.mg') && performance.now() > 0, null, { timeout: 2000 });
  await page.waitForTimeout(2300);
  await shot('4-posta');
  await page.mouse.up();
  await page.evaluate(() => document.querySelector('.mg')?.remove());

  // passaggio a livello: arriva il treno ad alta velocità
  const railRow = await page.evaluate(() => {
    const sim = window.__game.sim;
    sim.world.ensure(900);
    return sim.world.rows.findIndex((r, i) => i > 300 && r.kind === 'rail' && sim.world.rows[i - 1].kind === 'median');
  });
  await start(0.31, railRow - 1, 3);
  await page.evaluate(() => (window.__freeze = setInterval(() => (window.__game.sim.stormY = -1e9), 50)));
  await page.waitForFunction(
    (row) => {
      const v = window.__game.sim.rowState(row).vehicles[0];
      if (!v || v.kind !== 'fast') return false;
      const nose = v.x + (v.dir * v.len) / 2;
      return nose > 4 && nose < 8;
    },
    railRow,
    { timeout: 120000, polling: 16 },
  );
  await shot('5-treno');
  await page.evaluate(() => clearInterval(window.__freeze));

  // il temporale che insegue
  await start(0.52, 150, 5);
  await page.evaluate(() => {
    const sim = window.__game.sim;
    sim.stormY = sim.playerPos().y - 2.6;
  });
  await page.waitForTimeout(900);
  await shot('6-temporale');

  // le nonne d'Italia
  await page.evaluate(() => window.__game.toMenu());
  await page.waitForTimeout(300);
  await page.click('[data-action="nonne"]');
  await page.waitForTimeout(600);
  await page.click('[data-action="listen"][data-id="calabria"]');
  await page.waitForTimeout(400);
  await shot('7-nonne');
  await ctx.close();
}
await browser.close();
await server.close();
