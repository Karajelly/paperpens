// Run: node test/generator.test.js
// Checks every generated puzzle is valid and has exactly one solution, and
// reports timing + how often each difficulty target is hit.
const E = require('../generator.js');

function check(p) {
  const { n, k, regions, solution } = p;
  const rows = new Array(n).fill(0), cols = new Array(n).fill(0), pens = new Array(n).fill(0);
  for (const i of solution) { rows[(i / n) | 0]++; cols[i % n]++; pens[regions[i]]++; }
  if (![...rows, ...cols, ...pens].every(x => x === k)) throw new Error('bad counts');
  for (const a of solution) for (const b of solution) {
    if (a !== b && Math.abs(((a / n) | 0) - ((b / n) | 0)) <= 1 && Math.abs((a % n) - (b % n)) <= 1) throw new Error('touching');
  }
  const cnt = E.countSolutions(E.makeCtx(n, k, regions), new Uint8Array(n * n), 5);
  if (cnt !== 1) throw new Error('not unique: ' + cnt);
  // pens connected
  for (let g = 0; g < n; g++) {
    const cells = regions.map((r, i) => (r === g ? i : -1)).filter(i => i >= 0);
    const seen = new Set([cells[0]]), st = [cells[0]];
    while (st.length) {
      const i = st.pop(), r = (i / n) | 0, c = i % n;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        const j = rr * n + cc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n && regions[j] === g && !seen.has(j)) { seen.add(j); st.push(j); }
      }
    }
    if (seen.size !== cells.length) throw new Error('pen not connected');
  }
}

const configs = [];
for (const n of [4, 5, 6, 7, 8, 9, 10]) configs.push([n, 1]);
for (const n of [8, 9, 10]) configs.push([n, 2]);
const PER = +(process.argv[2] || 3);

for (const [n, k] of configs) {
  for (let level = 1; level <= 4; level++) {
    let hit = 0, total = 0, worst = 0, sum = 0;
    for (let s = 0; s < PER; s++) {
      const t0 = Date.now();
      const p = E.generate({ n, k, level, seed: 1000 * level + s * 7 + n });
      const dt = Date.now() - t0;
      worst = Math.max(worst, dt); sum += dt;
      if (!p) continue;
      check(p);
      total++;
      if (p.level === level) hit++;
    }
    console.log(`${n}x${n} k=${k} ${E.LEVELS[level].padEnd(6)} made ${total}/${PER} exact ${hit}/${PER}  avg ${Math.round(sum / PER)}ms worst ${worst}ms`);
  }
}
