import { Sim } from '../src/sim';
import { runBot } from '../tests/bot';

// Il bot corre su più semi: quanti metri fa, perché si ferma, quante soste completa.
const runs = Number(process.argv[2] ?? 12);
const target = Number(process.argv[3] ?? 2000);
const results = [];
for (let k = 0; k < runs; k++) {
  const seed = 1000 + k * 7919;
  const r = runBot(new Sim(seed), target, 1500);
  results.push(r);
  console.log(`seme ${seed}: ${String(r.meters).padStart(5)} m in ${r.time.toFixed(0).padStart(4)} s  spaventi=${r.hits} ciabatte=${r.slippersUsed} soste=${r.stops} fine=${r.cause ?? 'traguardo'}`);
}
const m = results.map((r) => r.meters).sort((a, b) => a - b);
console.log(`metri: min ${m[0]}, mediana ${m[Math.floor(m.length / 2)]}, max ${m[m.length - 1]}`);
