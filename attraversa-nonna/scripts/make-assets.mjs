// Genera icona dell'app (1024×1024, senza canale alfa come richiede l'App Store),
// immagine di avvio e icona per la versione web. Uso: npm run assets
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { createServer } from 'vite';

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** PNG a 24 bit (RGB, niente alfa). */
function pngRGB(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5199/scripts/assets.html');
await page.waitForFunction(() => typeof window.makeAssets === 'function');
const assets = await page.evaluate(() => window.makeAssets());
const save = (path, a) => {
  writeFileSync(path, pngRGB(a.width, a.height, Buffer.from(a.rgb, 'base64')));
  console.log('scritto', path, `${a.width}x${a.height}`);
};
const iconDir = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
save(`${iconDir}/AppIcon-512@2x.png`, assets.icon);
const splashDir = 'ios/App/App/Assets.xcassets/Splash.imageset';
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) save(`${splashDir}/${f}`, assets.splash);
save('public/apple-touch-icon.png', assets.touchIcon);
save('docs/icona-app-store.png', assets.icon);
await browser.close();
await server.close();
