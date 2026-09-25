import { generateLevel } from '../src/levels';
import { Sim } from '../src/sim';
import { runBot } from '../tests/bot';

const upTo = Number(process.argv[2] ?? 40);
let wins = 0;
for (let n = 1; n <= upTo; n++) {
  const lv = generateLevel(n);
  const results = [0, 1, 2].map((k) => runBot(new Sim(lv, lv.seed + k * 7919)));
  const w = results.filter((r) => r.won).length;
  wins += w;
  const times = results.filter((r) => r.won).map((r) => r.time.toFixed(1));
  const hits = results.map((r) => r.hits).join('/');
  const kinds = lv.rows.map((r) => r.kind[0]).join('');
  console.log(
    `L${String(n).padStart(2)} rows=${String(lv.rows.length).padStart(2)} ${kinds.padEnd(26)} par=${String(lv.parTime).padStart(3)} won=${w}/3 t=[${times.join(', ')}] hits=${hits} umb=${results.map((r) => r.umbrellasUsed).join('/')}`,
  );
}
console.log(`wins ${wins}/${upTo * 3}`);
