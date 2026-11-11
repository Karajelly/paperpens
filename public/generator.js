/*
 * Puzzle engine: builds grid puzzles where every row, column and pen holds
 * exactly k tokens and no two tokens touch (not even diagonally).
 *
 *  - randomSolution: a valid token layout
 *  - pens are grown around the tokens, then nudged until the puzzle has
 *    exactly one solution (checked with countSolutions)
 *  - grade: solves the puzzle the way a person would and reports the hardest
 *    technique it needed, so we only print puzzles that are fair on paper
 *
 * Works in the browser (window.PuzzleEngine) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const UNK = 0, TOKEN = 1, EMPTY = 2;

  const LEVELS = {
    1: 'Easy',     // forced squares, X-ing out, a pen stuck in one row/column
    2: 'Medium',   // "this square would block a whole pen"
    3: 'Hard',     // counting groups of pens and rows together
    4: 'Tricky',   // try-and-see: assume a token and find a contradiction
  };

  // ---------- random helpers ----------

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

  // ---------- board context ----------

  function makeCtx(n, k, regions) {
    const units = [];
    for (let r = 0; r < n; r++) { const u = []; for (let c = 0; c < n; c++) u.push(r * n + c); units.push(u); }
    for (let c = 0; c < n; c++) { const u = []; for (let r = 0; r < n; r++) u.push(r * n + c); units.push(u); }
    for (let g = 0; g < n; g++) units.push([]);
    const cellUnits = [];
    const nbrs = [];
    for (let i = 0; i < n * n; i++) {
      const r = (i / n) | 0, c = i % n;
      units[2 * n + regions[i]].push(i);
      cellUnits.push([r, n + c, 2 * n + regions[i]]);
      const nb = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) nb.push(rr * n + cc);
      }
      nbrs.push(nb);
    }
    return { n, k, regions, units, cellUnits, nbrs };
  }

  function touching(n, i, j) {
    return Math.abs(((i / n) | 0) - ((j / n) | 0)) <= 1 && Math.abs((i % n) - (j % n)) <= 1;
  }

  function setToken(ctx, st, i) {
    if (st[i] === TOKEN) return true;
    if (st[i] === EMPTY) return false;
    st[i] = TOKEN;
    for (const j of ctx.nbrs[i]) {
      if (st[j] === TOKEN) return false;
      st[j] = EMPTY;
    }
    return true;
  }

  // Basic rules: a full unit gets X'd out; a unit with exactly as many open
  // squares as tokens still needed gets filled. Returns -1 contradiction,
  // 0 nothing changed, 1 progress.
  function basic(ctx, st) {
    const { k, units } = ctx;
    let any = false, changed = true;
    while (changed) {
      changed = false;
      for (const u of units) {
        let b = 0, un = 0;
        for (const i of u) { if (st[i] === TOKEN) b++; else if (st[i] === UNK) un++; }
        if (b > k || b + un < k) return -1;
        if (un === 0) continue;
        if (b === k) {
          for (const i of u) if (st[i] === UNK) st[i] = EMPTY;
          changed = true;
        } else if (b + un === k) {
          for (const i of u) if (st[i] === UNK && !setToken(ctx, st, i)) return -1;
          changed = true;
        }
      }
      if (changed) any = true;
    }
    return any ? 1 : 0;
  }

  // Can this unit still get the tokens it needs?
  function unitImpossible(ctx, st, u) {
    let b = 0; const un = [];
    for (const i of u) { if (st[i] === TOKEN) b++; else if (st[i] === UNK) un.push(i); }
    const need = ctx.k - b;
    if (need < 0 || un.length < need) return true;
    if (need === 2) {
      for (let a = 0; a < un.length; a++)
        for (let c = a + 1; c < un.length; c++)
          if (!touching(ctx.n, un[a], un[c])) return false;
      return true;
    }
    return false;
  }

  // ---------- solution counting ----------

  function countSolutions(ctx, st, cap) {
    if (basic(ctx, st) < 0) return 0;
    const { k, units } = ctx;
    let best = -1, bestUn = Infinity;
    for (let ui = 0; ui < units.length; ui++) {
      let b = 0, un = 0;
      for (const i of units[ui]) { if (st[i] === TOKEN) b++; else if (st[i] === UNK) un++; }
      if (un > 0 && b < k && un < bestUn) { bestUn = un; best = ui; }
    }
    if (best < 0) {
      for (let i = 0; i < st.length; i++) if (st[i] === UNK) return 0;
      return 1;
    }
    let cell = -1;
    for (const i of units[best]) if (st[i] === UNK) { cell = i; break; }
    let total = 0;
    const a = st.slice();
    if (setToken(ctx, a, cell)) total += countSolutions(ctx, a, cap);
    if (total >= cap) return total;
    const e = st.slice();
    e[cell] = EMPTY;
    total += countSolutions(ctx, e, cap - total);
    return total;
  }

  // Collect up to `cap` full solutions (each a Uint8Array state).
  function findSolutions(ctx, cap) {
    const out = [];
    const { k, units } = ctx;
    (function rec(st) {
      if (out.length >= cap || basic(ctx, st) < 0) return;
      let best = -1, bestUn = Infinity;
      for (let ui = 0; ui < units.length; ui++) {
        let b = 0, un = 0;
        for (const i of units[ui]) { if (st[i] === TOKEN) b++; else if (st[i] === UNK) un++; }
        if (un > 0 && b < k && un < bestUn) { bestUn = un; best = ui; }
      }
      if (best < 0) { if (st.indexOf(UNK) < 0) out.push(st); return; }
      let cell = -1;
      for (const i of units[best]) if (st[i] === UNK) { cell = i; break; }
      const a = st.slice();
      if (setToken(ctx, a, cell)) rec(a);
      const e = st.slice(); e[cell] = EMPTY;
      rec(e);
    })(new Uint8Array(ctx.n * ctx.n));
    return out;
  }

  function solve(ctx) {
    // returns one solution (array of token cells) or null
    function rec(st) {
      if (basic(ctx, st) < 0) return null;
      let cell = -1;
      for (let i = 0; i < st.length; i++) if (st[i] === UNK) { cell = i; break; }
      if (cell < 0) return st;
      const a = st.slice();
      if (setToken(ctx, a, cell)) { const r = rec(a); if (r) return r; }
      const e = st.slice(); e[cell] = EMPTY;
      return rec(e);
    }
    const r = rec(new Uint8Array(ctx.n * ctx.n));
    if (!r) return null;
    const out = [];
    for (let i = 0; i < r.length; i++) if (r[i] === TOKEN) out.push(i);
    return out;
  }

  // ---------- human-style grader ----------

  // Pens confined to rows (or rows confined to pens) — Sudoku-style counting.
  // Size-1 groups are "a pen stuck in one row"; bigger groups are the Hard
  // counting trick.
  function groupElims(ctx, st, minS, maxS) {
    const { n, k, units, regions } = ctx;
    const need = units.map(u => { let b = 0; for (const i of u) if (st[i] === TOKEN) b++; return k - b; });
    const rowsOfReg = new Array(n).fill(0), colsOfReg = new Array(n).fill(0);
    const regsOfRow = new Array(n).fill(0), regsOfCol = new Array(n).fill(0);
    for (let i = 0; i < n * n; i++) {
      if (st[i] !== UNK) continue;
      const r = (i / n) | 0, c = i % n, g = regions[i];
      rowsOfReg[g] |= 1 << r; colsOfReg[g] |= 1 << c;
      regsOfRow[r] |= 1 << g; regsOfCol[c] |= 1 << g;
    }
    for (let dir = 0; dir < 2; dir++) {
      const linesOfReg = dir ? colsOfReg : rowsOfReg;
      const regsOfLine = dir ? regsOfCol : regsOfRow;
      const off = dir ? n : 0;
      const lineOf = dir ? (i => i % n) : (i => (i / n) | 0);

      // A: a group of pens fits inside the same number of lines
      const actR = [];
      for (let g = 0; g < n; g++) if (need[2 * n + g] > 0 && linesOfReg[g]) actR.push(g);
      for (let m = 1; m < (1 << actR.length); m++) {
        const s = popcount(m);
        if (s < minS || s > maxS) continue;
        let gMask = 0, lMask = 0, needG = 0;
        for (let b = 0; b < actR.length; b++) if (m & (1 << b)) {
          const g = actR[b]; gMask |= 1 << g; lMask |= linesOfReg[g]; needG += need[2 * n + g];
        }
        let needL = 0;
        for (let l = 0; l < n; l++) if (lMask & (1 << l)) needL += need[off + l];
        if (needL !== needG) continue;
        let prog = false;
        for (let l = 0; l < n; l++) if (lMask & (1 << l)) {
          for (const i of units[off + l]) if (st[i] === UNK && !(gMask & (1 << regions[i]))) { st[i] = EMPTY; prog = true; }
        }
        if (prog) return true;
      }

      // B: a group of lines only touches the same number of pens
      const actL = [];
      for (let l = 0; l < n; l++) if (need[off + l] > 0 && regsOfLine[l]) actL.push(l);
      for (let m = 1; m < (1 << actL.length); m++) {
        const s = popcount(m);
        if (s < minS || s > maxS) continue;
        let lMask = 0, gMask = 0, needL = 0;
        for (let b = 0; b < actL.length; b++) if (m & (1 << b)) {
          const l = actL[b]; lMask |= 1 << l; gMask |= regsOfLine[l]; needL += need[off + l];
        }
        let needG = 0;
        for (let g = 0; g < n; g++) if (gMask & (1 << g)) needG += need[2 * n + g];
        if (needL !== needG) continue;
        let prog = false;
        for (let g = 0; g < n; g++) if (gMask & (1 << g)) {
          for (const i of units[2 * n + g]) if (st[i] === UNK && !(lMask & (1 << lineOf(i)))) { st[i] = EMPTY; prog = true; }
        }
        if (prog) return true;
      }
    }
    return false;
  }

  // "If a token went here, it would X out every open square of some pen."
  function lookahead(ctx, st) {
    const { k, units, nbrs, cellUnits } = ctx;
    for (let x = 0; x < st.length; x++) {
      if (st[x] !== UNK) continue;
      const t = st.slice();
      let bad = false;
      t[x] = TOKEN;
      for (const j of nbrs[x]) { if (t[j] === TOKEN) bad = true; else t[j] = EMPTY; }
      if (!bad) {
        for (const ui of cellUnits[x]) {
          let b = 0; for (const i of units[ui]) if (t[i] === TOKEN) b++;
          if (b > k) bad = true;
          else if (b === k) for (const i of units[ui]) if (t[i] === UNK) t[i] = EMPTY;
        }
      }
      if (!bad) for (const u of units) if (unitImpossible(ctx, t, u)) { bad = true; break; }
      if (bad) { st[x] = EMPTY; return true; }
    }
    return false;
  }

  function contradicts(ctx, t) {
    for (;;) {
      const r = basic(ctx, t);
      if (r < 0) return true;
      for (const u of ctx.units) if (unitImpossible(ctx, t, u)) return true;
      if (r > 0) continue;
      if (groupElims(ctx, t, 1, 1)) continue;
      return false;
    }
  }

  // "Suppose a token went here... that breaks something two steps later."
  function trial(ctx, st) {
    for (let x = 0; x < st.length; x++) {
      if (st[x] !== UNK) continue;
      const t = st.slice();
      if (!setToken(ctx, t, x) || contradicts(ctx, t)) { st[x] = EMPTY; return true; }
    }
    return false;
  }

  // Returns { level: 1..4, or 5 if a person couldn't finish it with these techniques }
  function grade(ctx) {
    const st = new Uint8Array(ctx.n * ctx.n);
    const n = ctx.n;
    let level = 1;
    for (let guard = 0; guard < 10000; guard++) {
      if (st.indexOf(UNK) < 0) return { level };
      const r = basic(ctx, st);
      if (r < 0) return { level: 5 };
      if (r > 0) continue;
      if (groupElims(ctx, st, 1, 1)) continue;
      if (lookahead(ctx, st)) { level = Math.max(level, 2); continue; }
      if (groupElims(ctx, st, 2, n - 1)) { level = Math.max(level, 3); continue; }
      if (trial(ctx, st)) { level = Math.max(level, 4); continue; }
      return { level: 5 };
    }
    return { level: 5 };
  }

  // ---------- generation ----------

  function randomSolution(n, k, rnd) {
    const combos = [];
    (function build(start, cur) {
      if (cur.length === k) { combos.push(cur.slice()); return; }
      for (let c = start; c < n; c++) {
        if (cur.length && c - cur[cur.length - 1] < 2) continue;
        cur.push(c); build(c + 1, cur); cur.pop();
      }
    })(0, []);
    const colCount = new Array(n).fill(0);
    const rows = [];
    let budget = 20000;
    function rec(r) {
      if (r === n) return true;
      if (--budget < 0) return false;
      const prev = r ? rows[r - 1] : [];
      for (const combo of shuffle(combos.slice(), rnd)) {
        let ok = true;
        for (const c of combo) {
          if (colCount[c] >= k) { ok = false; break; }
          for (const p of prev) if (Math.abs(p - c) <= 1) { ok = false; break; }
          if (!ok) break;
        }
        if (!ok) continue;
        // every column must still be able to reach k
        for (const c of combo) colCount[c]++;
        rows.push(combo);
        let feasible = true;
        const left = n - r - 1;
        for (let c = 0; c < n; c++) if (k - colCount[c] > Math.ceil(left / 2)) { feasible = false; break; }
        if (feasible && rec(r + 1)) return true;
        rows.pop();
        for (const c of combo) colCount[c]--;
      }
      return false;
    }
    if (!rec(0)) return null;
    const cells = [];
    rows.forEach((combo, r) => combo.forEach(c => cells.push(r * n + c)));
    return cells;
  }

  function orth(n, i) {
    const r = (i / n) | 0, c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  function growRegions(n, seeds, rnd) {
    const reg = new Int16Array(n * n).fill(-1);
    const size = new Array(seeds.length).fill(1);
    seeds.forEach((s, g) => { reg[s] = g; });
    let left = n * n - seeds.length;
    while (left > 0) {
      // frontier per region
      const front = seeds.map(() => []);
      for (let i = 0; i < n * n; i++) {
        if (reg[i] !== -1) continue;
        for (const j of orth(n, i)) if (reg[j] !== -1) front[reg[j]].push(i);
      }
      // prefer smaller pens so sizes stay fairly even, with some randomness
      let total = 0;
      const w = front.map((f, g) => (f.length ? 1 / Math.pow(size[g], 1.3) : 0));
      for (const x of w) total += x;
      let pick = rnd() * total, g = 0;
      for (; g < w.length; g++) { pick -= w[g]; if (pick <= 0 && w[g] > 0) break; }
      if (g >= w.length) g = w.findIndex(x => x > 0);
      const cell = front[g][Math.floor(rnd() * front[g].length)];
      reg[cell] = g; size[g]++; left--;
    }
    return reg;
  }

  // pair up 2n small pens into n pens holding 2 tokens each
  function mergePairs(n, reg, count, rnd) {
    const adj = Array.from({ length: count }, () => new Set());
    for (let i = 0; i < n * n; i++) for (const j of orth(n, i)) if (reg[i] !== reg[j]) adj[reg[i]].add(reg[j]);
    const mate = new Array(count).fill(-1);
    let budget = 5000;
    function rec() {
      if (--budget < 0) return false;
      const a = mate.indexOf(-1);
      if (a < 0) return true;
      for (const b of shuffle([...adj[a]], rnd)) {
        if (mate[b] !== -1) continue;
        mate[a] = b; mate[b] = a;
        if (rec()) return true;
        mate[a] = -1; mate[b] = -1;
      }
      return false;
    }
    if (!rec()) return null;
    const id = new Array(count).fill(-1);
    let next = 0;
    for (let a = 0; a < count; a++) if (id[a] < 0) { id[a] = next; id[mate[a]] = next; next++; }
    return reg.map(g => id[g]);
  }

  function connectedWithout(n, reg, g, skip) {
    let start = -1, total = 0;
    for (let i = 0; i < n * n; i++) if (reg[i] === g && i !== skip) { total++; if (start < 0) start = i; }
    if (total === 0) return false;
    const seen = new Uint8Array(n * n);
    const stack = [start]; seen[start] = 1;
    let got = 0;
    while (stack.length) {
      const i = stack.pop(); got++;
      for (const j of orth(n, i)) if (!seen[j] && j !== skip && reg[j] === g) { seen[j] = 1; stack.push(j); }
    }
    return got === total;
  }

  // Move square i (and, if it is buried inside its pen, a short path of squares
  // leading to the pen's edge) into a neighbouring pen. Never moves a square
  // holding one of our solution's tokens and keeps every pen in one piece.
  function carvePath(n, regions, isTok, i, rnd) {
    const A = regions[i];
    const prev = new Map([[i, -1]]);
    const queue = [i];
    const exits = [];
    while (queue.length) {
      const p = queue.shift();
      const nb = shuffle(orth(n, p), rnd);
      for (const q of nb) {
        if (regions[q] !== A) { exits.push([p, regions[q]]); continue; }
        if (!prev.has(q) && !isTok[q]) { prev.set(q, p); queue.push(q); }
      }
    }
    for (const [end, B] of exits) {
      const path = [];
      for (let p = end; p !== -1; p = prev.get(p)) path.push(p);
      const set = new Set(path);
      // A must stay connected without the path
      let start = -1, total = 0;
      for (let x = 0; x < n * n; x++) if (regions[x] === A && !set.has(x)) { total++; if (start < 0) start = x; }
      if (!total) continue;
      const seen = new Set([start]), st = [start];
      while (st.length) {
        const x = st.pop();
        for (const y of orth(n, x)) if (regions[y] === A && !set.has(y) && !seen.has(y)) { seen.add(y); st.push(y); }
      }
      if (seen.size !== total) continue;
      for (const x of path) regions[x] = B;
      return true;
    }
    return false;
  }

  function makeUniquePuzzle(n, k, rnd) {
    const sol = randomSolution(n, k, rnd);
    if (!sol) return null;
    let regions;
    if (k === 1) regions = growRegions(n, shuffle(sol.slice(), rnd), rnd);
    else {
      const small = growRegions(n, shuffle(sol.slice(), rnd), rnd);
      regions = mergePairs(n, small, sol.length, rnd);
      if (!regions) return null;
    }
    regions = Array.from(regions);
    const fixed = repairUnique(n, k, regions, sol, rnd);
    return fixed ? { regions: fixed, solution: sol } : null;
  }

  /**
   * Nudge pen walls until `sol` is the only solution. Changes `regions` in
   * place and returns it, or returns null if it gets stuck. Squares holding a
   * token in `sol` never change pens, so `sol` stays valid throughout.
   */
  function repairUnique(n, k, regions, sol, rnd, maxSteps) {
    const isTok = new Uint8Array(n * n);
    sol.forEach(i => { isTok[i] = 1; });
    // Kill alternative solutions one at a time: take a square that holds a
    // token in the wrong solution (but not in ours) and move it into a
    // neighbouring pen. That breaks the wrong solution's pen counts while ours
    // stays valid.
    maxSteps = maxSteps || n * n * 2;
    for (let step = 0; step < maxSteps; step++) {
      const sols = findSolutions(makeCtx(n, k, regions), 2);
      if (sols.length === 1) return regions;
      if (sols.length === 0) return null;
      const alt = sols.find(s => sol.some(i => s[i] !== TOKEN)) || sols[1];
      const cands = [];
      for (let i = 0; i < n * n; i++) if (alt[i] === TOKEN && !isTok[i]) cands.push(i);
      shuffle(cands, rnd);
      let moved = false;
      for (const i of cands) {
        if (carvePath(n, regions, isTok, i, rnd)) { moved = true; break; }
      }
      if (!moved) return null;
    }
    return findSolutions(makeCtx(n, k, regions), 2).length === 1 ? regions : null;
  }

  function attemptsFor(n, k) { return k === 2 ? (n === 10 ? 60 : 80) : 150; }

  /**
   * generate({ n, k, level, seed }) -> puzzle
   * Deterministic for the same inputs. If the exact level can't be found within
   * the attempt budget, returns the closest one (puzzle.level says which).
   */
  function generate(opts) {
    const n = opts.n, k = opts.k || 1, target = opts.level || 1;
    const rnd = rng(opts.seed >>> 0);
    let best = null, bestScore = Infinity;
    const attempts = opts.attempts || attemptsFor(n, k);
    for (let a = 0; a < attempts; a++) {
      const p = makeUniquePuzzle(n, k, rnd);
      if (!p) continue;
      const { level } = grade(makeCtx(n, k, p.regions));
      if (level > 4) continue;
      const puzzle = { n, k, regions: p.regions, solution: p.solution.slice().sort((x, y) => x - y), level, seed: opts.seed >>> 0 };
      if (level === target) return puzzle;
      const score = Math.abs(level - target) * 2 + (level > target ? 1 : 0);
      if (score < bestScore) { best = puzzle; bestScore = score; }
    }
    return best;
  }

  const api = {
    LEVELS, rng, hashString, makeCtx, countSolutions, findSolutions, solve, grade, generate,
    randomSolution, makeUniquePuzzle, repairUnique, TOKEN,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PuzzleEngine = api;
})(typeof self !== 'undefined' ? self : this);
