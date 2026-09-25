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
      'attraversa-nonna-save',
      JSON.stringify({ version: 1, unlocked: 14, stars: { 1: 3, 2: 3, 3: 3, 4: 2, 5: 3, 6: 3, 7: 1, 8: 3, 9: 2, 10: 3, 11: 3, 12: 2, 13: 1 }, candies: 128, outfit: 'sunday', owned: ['classic', 'sunday', 'sporty'], music: false, sfx: false, haptics: false }),
    );
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5198/');
  await page.waitForFunction(() => window.__game?.sim);
  await page.waitForTimeout(1500);
  const shot = async (name) => {
    await page.screenshot({ path: `${dir}/${name}.jpg`, type: 'jpeg', quality: 92 });
    console.log(`${dir}/${name}.jpg`);
  };
  const hideBanner = () => page.evaluate(() => document.getElementById('banner').hidden = true);

  await shot('1-titolo');

  // l'ombrello ferma il traffico
  await page.evaluate(() => {
    const g = window.__game;
    g.startLevel(12);
    const sim = g.sim;
    const row = sim.rows.findIndex((r) => r.def.kind === 'median');
    Object.assign(sim.player, { row, fromRow: row, col: 4, fromCol: 4, safeRow: row, safeCol: 4 });
    sim.started = true;
  });
  await hideBanner();
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__game.sim.useUmbrella());
  await page.waitForTimeout(380);
  await shot('2-ombrello');

  // il tram in arrivo
  await page.evaluate(() => {
    const g = window.__game;
    g.startLevel(9);
    const sim = g.sim;
    const tram = sim.rows.findIndex((r) => r.def.kind === 'tram');
    const row = tram - 1;
    Object.assign(sim.player, { row, fromRow: row, col: 3, fromCol: 3, safeRow: row, safeCol: 3 });
    sim.started = true;
  });
  await hideBanner();
  await page.waitForFunction(() => {
    const sim = window.__game.sim;
    const rs = sim.rows.find((r) => r.def.kind === 'tram');
    const v = rs.vehicles[0];
    return v && v.x > 2.5 && v.x < 6.5;
  }, null, { timeout: 30000 });
  await shot('3-tram');

  // bici e caramelle, più avanti
  await page.evaluate(() => {
    const g = window.__game;
    g.startLevel(11);
    const sim = g.sim;
    const bike = sim.rows.findIndex((r) => r.def.kind === 'bike');
    const row = bike - 1;
    Object.assign(sim.player, { row, fromRow: row, col: 5, fromCol: 5, safeRow: row, safeCol: 5, coffeeT: 6 });
    sim.started = true;
  });
  await hideBanner();
  await page.waitForTimeout(1800);
  await shot('4-bici');

  // arrivo e stelle
  await page.evaluate(() => {
    const g = window.__game;
    g.startLevel(5);
    const sim = g.sim;
    const row = sim.rows.length - 2;
    Object.assign(sim.player, { row, fromRow: row, col: 4, fromCol: 4 });
    sim.candies = sim.candiesTotal;
    sim.started = true;
    sim.elapsed = 9.4;
  });
  await hideBanner();
  await page.waitForFunction(() => {
    const sim = window.__game.sim;
    const r = sim.player.row;
    return sim.rows.slice(r, r + 2).every((rs) => rs.vehicles.every((v) => Math.abs(v.x - 4.5) > 2.2));
  }, null, { timeout: 20000, polling: 16 });
  await page.evaluate(() => window.__game.sim.input('up'));
  await page.waitForTimeout(3400);
  await shot('5-vittoria');

  await page.evaluate(() => window.__game.toMenu());
  await page.waitForTimeout(300);
  await page.click('[data-action="wardrobe"]');
  await page.waitForTimeout(700);
  await shot('6-guardaroba');
  await ctx.close();
}
await browser.close();
await server.close();
