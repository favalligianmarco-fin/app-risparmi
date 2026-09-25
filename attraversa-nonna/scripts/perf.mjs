// Misura la fluidità: frame al secondo e percentili del tempo tra un frame e l'altro.
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4175, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: Number(process.env.DPR ?? 3), isMobile: true, hasTouch: true, locale: 'it-IT' });
await ctx.addInitScript(() => {
  localStorage.setItem('attraversa-nonna-save', JSON.stringify({ version: 1, unlocked: 40, stars: {}, candies: 0, outfit: 'classic', owned: ['classic'], music: false, sfx: false, haptics: false }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:4175/');
await page.waitForTimeout(800);
for (const throttle of [1, 4]) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.click('[data-action="levels"]');
  await page.click('[data-action="level"][data-n="24"]');
  await page.waitForTimeout(1000);
  const res = await page.evaluate(() => new Promise((resolve) => {
    const d = [];
    let last = performance.now();
    const t0 = last;
    const step = (ts) => {
      d.push(ts - last);
      last = ts;
      if (ts - t0 < 4000) requestAnimationFrame(step);
      else resolve(d);
    };
    requestAnimationFrame(step);
  }));
  const js = await page.evaluate(() => window.__perf);
  res.sort((a, b) => a - b);
  const p = (q) => res[Math.floor(res.length * q)].toFixed(1);
  console.log(`CPU x${throttle}: ${res.length / 4} fps, frame ms p50=${p(0.5)} p95=${p(0.95)} p99=${p(0.99)} max=${res[res.length - 1].toFixed(1)} | JS: sim=${js.sim.toFixed(2)}ms render=${js.render.toFixed(2)}ms`);
  await page.click('#btn-pause');
  await page.click('[data-action="menu"]');
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));
