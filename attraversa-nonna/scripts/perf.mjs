// Misura la fluidità durante una corsa che sale veloce (lo sfondo si disegna al volo).
// Uso: npm run perf   (DPR=2 npm run perf per simulare uno schermo meno denso)
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5194, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: Number(process.env.DPR ?? 3),
  isMobile: true,
  hasTouch: true,
  locale: 'it-IT',
});
await ctx.addInitScript(() => {
  localStorage.setItem('attraversa-nonna-v2', JSON.stringify({ version: 2, best: 0, candies: 0, nonna: 'campania', owned: ['campania'], runs: 1, music: false, sfx: false, haptics: false, tutorial: true }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5194/');
await page.waitForFunction(() => window.__game?.sim);
for (const throttle of [1, 4]) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate(() => {
    const g = window.__game;
    g.play();
    const sim = g.sim;
    // corsa automatica: sempre avanti, intoccabile, senza soste né lavori in corso
    window.__auto = setInterval(() => {
      sim.player.invuln = 99;
      sim.idleT = -999;
      if (sim.status === 'stop') sim.finishStop(true, 0);
      sim.input('up');
    }, 110);
  });
  await page.waitForTimeout(800);
  const res = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const d = [];
        let last = performance.now();
        const t0 = last;
        const step = (ts) => {
          d.push(ts - last);
          last = ts;
          if (ts - t0 < 5000) requestAnimationFrame(step);
          else resolve({ d, meters: window.__game.sim.meters });
        };
        requestAnimationFrame(step);
      }),
  );
  const js = await page.evaluate(() => window.__perf);
  await page.evaluate(() => clearInterval(window.__auto));
  const d = res.d.sort((a, b) => a - b);
  const p = (q) => d[Math.floor(d.length * q)].toFixed(1);
  console.log(
    `CPU x${throttle}: ${(d.length / 5).toFixed(0)} fps, frame ms p50=${p(0.5)} p95=${p(0.95)} p99=${p(0.99)} max=${d[d.length - 1].toFixed(1)} | ${res.meters} m | JS sim=${js.sim.toFixed(2)} render=${js.render.toFixed(2)} ms | fette ${js.bg.chunks}, ${(js.bg.ms / js.bg.chunks).toFixed(1)} ms l'una`,
  );
}
await browser.close();
await server.close();
