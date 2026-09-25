// Trasforma dist-web/index.html (file unico) in un frammento HTML senza <html>/<head>/<body>,
// adatto a essere pubblicato come pagina giocabile. Uso: npm run build:web && node scripts/make-artifact.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-web/index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const pick = (re) => [...head.matchAll(re)].map((m) => m[0]);
const title = pick(/<title>[\s\S]*?<\/title>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);
const out = [...title, ...styles, body.trim(), ...scripts].join('\n');
writeFileSync('dist-web/artifact.html', out);
console.log(`dist-web/artifact.html: ${(out.length / 1024).toFixed(0)} KB`);
