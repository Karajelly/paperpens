/*
 * "Design your own" mode: kids paint pens onto a grid, and the page checks
 * whether the puzzle works (exactly one answer), how hard it is, and can
 * nudge it into shape. Finished puzzles are saved in this browser and print
 * with the same sheets as generated ones.
 */
(function () {
  'use strict';
  const E = window.PuzzleEngine;
  const $ = id => document.getElementById(id);
  const P = () => window.PaperPens;

  const COLORS = ['#F6A5B5', '#9ED9AE', '#FFE07A', '#9EC4F5', '#C9AEF2', '#FFBF8F', '#8FDCD6', '#D9C99A', '#C4C4C4', '#EFA6DD'];
  const NAMES = ['pink', 'green', 'yellow', 'blue', 'purple', 'orange', 'teal', 'tan', 'gray', 'rose'];
  const LETTERS = 'ABCDEFGHIJ';
  const STORE_KEY = 'paperpens.designs';

  const st = {
    n: 6, k: 1,
    regions: new Array(36).fill(-1),
    pen: 0,               // -1 = eraser
    painting: false,
    showAnswer: false,
    editingId: null,
    result: null,         // last analysis
    flash: new Set(),     // squares changed by "Help me fix"
  };
  let memoryStore = null; // used if localStorage is unavailable

  // ---------- storage ----------

  function loadSaved() {
    if (memoryStore) return memoryStore;
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch (e) { memoryStore = []; return memoryStore; }
  }

  function writeSaved(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); memoryStore = null; }
    catch (e) { memoryStore = list; }
  }

  // ---------- share codes ----------

  function toCode(n, k, regions) { return `PP1-${n}-${k}-${regions.map(g => LETTERS[g]).join('')}`; }

  function fromCode(code) {
    const m = /^PP1-(\d+)-([12])-([A-J]+)$/i.exec(code.trim().replace(/\s+/g, ''));
    if (!m) return null;
    const n = +m[1], k = +m[2], body = m[3].toUpperCase();
    if (n < 4 || n > 10 || body.length !== n * n || (k === 2 && n < 8)) return null;
    const regions = [...body].map(ch => LETTERS.indexOf(ch));
    if (regions.some(g => g < 0 || g >= n)) return null;
    return { n, k, regions };
  }

  // ---------- analysis ----------

  function pieces(n, regions, g) {
    const cells = [];
    for (let i = 0; i < n * n; i++) if (regions[i] === g) cells.push(i);
    const seen = new Set(), groups = [];
    for (const c of cells) {
      if (seen.has(c)) continue;
      const grp = [c]; seen.add(c);
      for (let q = 0; q < grp.length; q++) {
        const i = grp[q], r = (i / n) | 0, col = i % n;
        for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, col > 0 ? i - 1 : -1, col < n - 1 ? i + 1 : -1]) {
          if (j >= 0 && regions[j] === g && !seen.has(j)) { seen.add(j); grp.push(j); }
        }
      }
      groups.push(grp);
    }
    return groups;
  }

  function analyze() {
    const { n, k, regions } = st;
    const blank = regions.filter(g => g < 0).length;
    const used = new Set(regions.filter(g => g >= 0));
    const unused = [];
    for (let g = 0; g < n; g++) if (!used.has(g)) unused.push(g);

    if (blank > 0) {
      return { state: 'incomplete', blank, unused, marks: new Set(),
        msg: `Keep going! ${blank} square${blank === 1 ? '' : 's'} still need a color.` +
          (unused.length ? ` You still need to use: ${unused.map(g => NAMES[g]).join(', ')}.` : '') };
    }
    if (unused.length) {
      return { state: 'incomplete', unused, marks: new Set(),
        msg: `A ${n}×${n} puzzle needs ${n} pens. Use every color at least once — still missing: ${unused.map(g => NAMES[g]).join(', ')}.` };
    }
    for (let g = 0; g < n; g++) {
      const groups = pieces(n, regions, g);
      if (groups.length > 1) {
        groups.sort((a, b) => b.length - a.length);
        const marks = new Set(groups.slice(1).flat());
        return { state: 'split', marks,
          msg: `The ${NAMES[g]} pen is in ${groups.length} pieces. Each pen has to be one shape where the squares touch side by side. The circled squares are the loose bits.` };
      }
    }
    const ctx = E.makeCtx(n, k, regions);
    const sols = E.findSolutions(ctx, 2);
    if (sols.length === 0) {
      return { state: 'impossible', marks: new Set(),
        msg: `Hmm — there’s no way to solve this one. ${k === 2 ? 'Two per pen needs roomy pens. ' : ''}Try changing the shapes of a few pens, especially very long thin ones or tiny ones.` };
    }
    if (sols.length > 1) {
      const marks = new Set();
      for (let i = 0; i < n * n; i++) if ((sols[0][i] === E.TOKEN) !== (sols[1][i] === E.TOKEN)) marks.add(i);
      return { state: 'multiple', marks, sols,
        msg: 'Almost! This puzzle has more than one answer, so solvers would have to guess. The circled squares are where two answers disagree — move a wall near them, or press Help me fix.' };
    }
    const solution = [];
    for (let i = 0; i < n * n; i++) if (sols[0][i] === E.TOKEN) solution.push(i);
    const { level } = E.grade(ctx);
    const lvl = P().levelName(level);
    return { state: 'good', marks: new Set(), solution, level,
      msg: level > 4
        ? 'It works — exactly one answer! But it’s super hard: it needs tricks beyond the tips page. Great for grown-ups.'
        : `It works — exactly one answer! Difficulty: ${lvl}.` };
  }

  // ---------- drawing ----------

  function editorSVG() {
    const { n, regions } = st;
    const cs = 60, m = 6, W = n * cs + 2 * m;
    const out = [`<svg viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" id="editor-svg" role="grid" aria-label="Puzzle editor, ${n} by ${n}">`];
    for (let i = 0; i < n * n; i++) {
      const r = (i / n) | 0, c = i % n, g = regions[i];
      out.push(`<rect x="${m + c * cs}" y="${m + r * cs}" width="${cs}" height="${cs}" fill="${g >= 0 ? COLORS[g] : '#fff'}"/>`);
    }
    const thin = [];
    for (let i = 1; i < n; i++) thin.push(`M${m + i * cs} ${m}V${m + n * cs}`, `M${m} ${m + i * cs}H${m + n * cs}`);
    out.push(`<path d="${thin.join('')}" stroke="#9a9a9a" stroke-width="1.4" fill="none"/>`);
    const thick = [];
    for (let i = 0; i < n * n; i++) {
      const r = (i / n) | 0, c = i % n, x = m + c * cs, y = m + r * cs;
      const a = regions[i];
      if (c < n - 1) { const b = regions[i + 1]; if (a !== b && (a >= 0 || b >= 0)) thick.push(`M${x + cs} ${y}V${y + cs}`); }
      if (r < n - 1) { const b = regions[i + n]; if (a !== b && (a >= 0 || b >= 0)) thick.push(`M${x} ${y + cs}H${x + cs}`); }
    }
    out.push(`<path d="${thick.join('')}" stroke="#111" stroke-width="5" stroke-linecap="round" fill="none"/>`);
    out.push(`<rect x="${m}" y="${m}" width="${n * cs}" height="${n * cs}" fill="none" stroke="#111" stroke-width="6"/>`);
    const res = st.result;
    if (res) {
      for (const i of res.marks) {
        const r = (i / n) | 0, c = i % n;
        out.push(`<circle cx="${m + c * cs + cs / 2}" cy="${m + r * cs + cs / 2}" r="${cs * 0.3}" fill="none" stroke="#e05a00" stroke-width="4" stroke-dasharray="7 5"/>`);
      }
      if (st.showAnswer && res.state === 'good') {
        const t = P().TOKENS[P().readForm().token];
        for (const i of res.solution) {
          const r = (i / n) | 0, c = i % n;
          out.push(`<text x="${m + c * cs + cs / 2}" y="${m + r * cs + cs / 2 + 2}" font-size="${cs * 0.6}" text-anchor="middle" dominant-baseline="central" fill="${t.color}">${t.sym}</text>`);
        }
      }
    }
    for (const i of st.flash) {
      const r = (i / n) | 0, c = i % n;
      out.push(`<rect class="flash" x="${m + c * cs + 4}" y="${m + r * cs + 4}" width="${cs - 8}" height="${cs - 8}" rx="8" fill="none" stroke="#1565c0" stroke-width="4"/>`);
    }
    out.push('</svg>');
    return out.join('');
  }

  function drawEditor() {
    $('editor').innerHTML = editorSVG();
  }

  function drawPalette() {
    const counts = new Array(st.n).fill(0);
    for (const g of st.regions) if (g >= 0) counts[g]++;
    const items = [];
    for (let g = 0; g < st.n; g++) {
      items.push(`<button type="button" class="swatch${st.pen === g ? ' on' : ''}${counts[g] ? '' : ' unused'}" data-pen="${g}" style="--c:${COLORS[g]}" aria-pressed="${st.pen === g}" title="${NAMES[g]} pen">` +
        `<span class="chip"></span><span>${LETTERS[g]}</span><small>${counts[g] || ''}</small></button>`);
    }
    items.push(`<button type="button" class="swatch eraser${st.pen === -1 ? ' on' : ''}" data-pen="-1" aria-pressed="${st.pen === -1}" title="Eraser"><span class="chip">⌫</span><span>Erase</span></button>`);
    $('palette').innerHTML = items.join('');
  }

  function drawVerdict() {
    const res = st.result;
    const box = $('verdict');
    box.className = 'verdict ' + (res ? res.state : '');
    box.innerHTML = `<p>${res ? res.msg : ''}</p>`;
    $('fix').disabled = !res || !['incomplete', 'multiple', 'split'].includes(res.state);
    $('save').disabled = !res || res.state !== 'good';
    const showBtn = $('show-answer');
    showBtn.disabled = !res || res.state !== 'good';
    showBtn.textContent = st.showAnswer ? 'Hide the answer' : 'Peek at the answer';
    $('share-code').value = st.regions.every(g => g >= 0) ? toCode(st.n, st.k, st.regions) : '';
  }

  function refresh(recheck) {
    if (recheck) {
      const was = st.result && st.result.state;
      st.result = analyze();
      if (st.result.state === 'good' && was !== 'good' && !st.quiet) confetti();
    }
    drawEditor();
    drawPalette();
    drawVerdict();
  }

  // A little burst of paper confetti from the editor when a puzzle starts working.
  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('editor').getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const bits = [];
    for (let i = 0; i < 46; i++) {
      const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 260;
      bits.push(`<i style="--x:${box.left + box.width / 2}px;--y:${box.top + box.height / 2}px;` +
        `--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist + 160}px;--r:${(Math.random() * 720 - 360) | 0}deg;` +
        `--c:${COLORS[i % COLORS.length]};animation-delay:${(Math.random() * 120) | 0}ms"></i>`);
    }
    layer.innerHTML = bits.join('');
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1700);
  }

  // ---------- painting ----------

  function cellAt(e) {
    const svg = $('editor-svg');
    const box = svg.getBoundingClientRect();
    const n = st.n, cs = 60, m = 6, W = n * cs + 2 * m;
    const x = (e.clientX - box.left) / box.width * W - m;
    const y = (e.clientY - box.top) / box.height * W - m;
    const c = Math.floor(x / cs), r = Math.floor(y / cs);
    if (r < 0 || c < 0 || r >= n || c >= n) return -1;
    return r * n + c;
  }

  function paint(i) {
    if (i < 0 || st.regions[i] === st.pen) return false;
    st.regions[i] = st.pen;
    return true;
  }

  let lastCell = -1;
  function onDown(e) {
    e.preventDefault();
    const i = cellAt(e);
    if (i < 0) return;
    st.painting = true;
    lastCell = i;
    e.currentTarget.setPointerCapture(e.pointerId);
    st.flash.clear();
    if (paint(i)) { st.result = null; st.showAnswer = false; quickDraw(); }
  }
  function onMove(e) {
    if (!st.painting) return;
    const i = cellAt(e);
    if (i < 0 || i === lastCell) return;
    // fill every square between the last one and this one, so fast drags don't skip
    const n = st.n;
    let changed = false;
    if (lastCell >= 0) {
      const r0 = (lastCell / n) | 0, c0 = lastCell % n, r1 = (i / n) | 0, c1 = i % n;
      const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
      for (let s = 1; s < steps; s++) {
        const r = Math.round(r0 + (r1 - r0) * s / steps), c = Math.round(c0 + (c1 - c0) * s / steps);
        changed = paint(r * n + c) || changed;
      }
    }
    lastCell = i;
    changed = paint(i) || changed;
    if (changed) quickDraw();
  }
  function onUp() {
    if (!st.painting) return;
    st.painting = false;
    $('verdict').innerHTML = '<p>Checking…</p>';
    setTimeout(() => refresh(true), 10);
  }
  // redraw while dragging without re-checking the puzzle
  function quickDraw() { drawEditor(); }

  // ---------- actions ----------

  function resetGrid(n, k, regions) {
    st.n = n; st.k = k;
    st.regions = regions ? regions.slice() : new Array(n * n).fill(-1);
    st.pen = 0; st.showAnswer = false; st.flash.clear();
    $('d-size').value = String(n);
    $('d-k').value = String(k);
    syncDesignOptions();
    st.quiet = true; refresh(true); st.quiet = false;
  }

  function syncDesignOptions() {
    const two = $('d-k').value === '2';
    for (const o of $('d-size').options) o.disabled = two && +o.value < 8;
  }

  function hasWork() { return st.regions.some(g => g >= 0); }

  function onSizeChange() {
    syncDesignOptions();
    let n = +$('d-size').value; const k = +$('d-k').value;
    if (k === 2 && n < 8) { n = 8; $('d-size').value = '8'; }
    if (n === st.n && k === st.k) return;
    if (k !== st.k && n === st.n && st.regions.every(g => g >= 0)) {
      // same grid, different rule: keep the drawing
      st.k = k; st.showAnswer = false; refresh(true); return;
    }
    if (hasWork() && !confirm('Start a new grid? Your current drawing will be cleared.')) {
      $('d-size').value = String(st.n); $('d-k').value = String(st.k); syncDesignOptions(); return;
    }
    st.editingId = null;
    resetGrid(n, k);
  }

  function randomLayout() {
    if (hasWork() && !confirm('Replace your drawing with a random puzzle to change?')) return;
    const p = E.generate({ n: st.n, k: st.k, level: st.k === 2 ? 2 : 1, seed: (Math.random() * 2 ** 32) >>> 0 });
    if (!p) { alert('Couldn’t make one this time — try again.'); return; }
    st.editingId = null;
    resetGrid(st.n, st.k, p.regions);
  }

  function blankGrid() {
    if (hasWork() && !confirm('Clear the whole grid?')) return;
    st.editingId = null;
    resetGrid(st.n, st.k);
  }

  function orthOf(n, i) {
    const r = (i / n) | 0, c = i % n, out = [];
    if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
    return out;
  }

  function helpFix() {
    const res = st.result;
    if (!res) return;
    const { n, k } = st;
    const before = st.regions.slice();
    const rnd = E.rng((Math.random() * 2 ** 32) >>> 0);

    if (res.state === 'incomplete') {
      // Color blank squares from their neighbours, then give unused colors a square.
      const reg = st.regions;
      let guard = 0;
      while (reg.some(g => g < 0) && reg.some(g => g >= 0) && guard++ < n * n) {
        for (let i = 0; i < n * n; i++) {
          if (reg[i] >= 0) continue;
          const nb = orthOf(n, i).map(j => reg[j]).filter(g => g >= 0);
          if (nb.length) reg[i] = nb[Math.floor(rnd() * nb.length)];
        }
      }
      if (reg.every(g => g < 0)) { randomLayout(); return; }
      // unused colors: steal an edge square from a big neighbour pen
      for (let g = 0; g < n; g++) {
        if (reg.includes(g)) continue;
        const sizes = new Array(n).fill(0); reg.forEach(x => { sizes[x]++; });
        let best = -1, bestSize = 1;
        for (let i = 0; i < n * n; i++) {
          const s = sizes[reg[i]];
          if (s <= bestSize) continue;
          const others = reg.map((x, j) => (j !== i && x === reg[i]) ? j : -1).filter(j => j >= 0);
          const test = reg.slice(); test[i] = g;
          if (pieces(n, test, reg[i]).length === 1 && others.length) { best = i; bestSize = s; }
        }
        if (best >= 0) reg[best] = g;
      }
    } else if (res.state === 'split') {
      // hand loose pieces to a neighbouring pen
      for (const i of res.marks) {
        const nb = orthOf(n, i).map(j => st.regions[j]).filter(g => g !== st.regions[i]);
        if (nb.length) st.regions[i] = nb[0];
      }
    } else if (res.state === 'multiple') {
      const sol = [];
      for (let i = 0; i < n * n; i++) if (res.sols[0][i] === E.TOKEN) sol.push(i);
      const fixed = E.repairUnique(n, k, st.regions.slice(), sol, rnd, 60);
      if (!fixed) {
        st.result = Object.assign({}, res, { msg: 'I couldn’t fix this one by moving a few walls. Try changing one pen’s shape near the circles, or start from a random layout.' });
        drawVerdict();
        return;
      }
      st.regions = fixed;
    }
    st.flash = new Set();
    for (let i = 0; i < n * n; i++) if (before[i] !== st.regions[i]) st.flash.add(i);
    refresh(true);
    if (st.flash.size && st.result) {
      st.result.msg = `I changed ${st.flash.size} square${st.flash.size === 1 ? '' : 's'} (outlined in blue). ` + st.result.msg;
      drawVerdict();
    }
  }

  function save() {
    const res = st.result;
    if (!res || res.state !== 'good') return;
    const list = loadSaved();
    const item = {
      id: st.editingId || String(Date.now()),
      n: st.n, k: st.k, regions: st.regions.slice(),
      solution: res.solution, level: res.level,
      title: $('d-title').value.trim().slice(0, 40),
      author: $('d-author').value.trim().slice(0, 30),
      created: new Date().toISOString(),
      print: true,
    };
    const at = list.findIndex(x => x.id === item.id);
    if (at >= 0) list[at] = Object.assign(list[at], item); else list.unshift(item);
    writeSaved(list);
    st.editingId = item.id;
    drawSaved();
    flashNote(at >= 0 ? 'Updated in My puzzles.' : 'Saved to My puzzles!');
  }

  function flashNote(text) {
    const el = $('save-note');
    el.textContent = text;
    clearTimeout(flashNote.t);
    flashNote.t = setTimeout(() => { el.textContent = ''; }, 3000);
  }

  // ---------- saved list ----------

  function asPuzzle(x) {
    return { n: x.n, k: x.k, regions: x.regions, solution: x.solution, level: x.level,
      seed: E.hashString(x.regions.join(',')), title: x.title, author: x.author };
  }

  function drawSaved() {
    const list = loadSaved();
    const wrap = $('saved-list');
    const pp = P();
    if (!list.length) {
      wrap.innerHTML = '<p class="muted">No saved puzzles yet. When a puzzle says “It works”, press <b>Save</b>.</p>';
    } else {
      wrap.innerHTML = list.map(x => `
        <article class="saved" data-id="${x.id}">
          <div class="thumb">${pp.boardSVG(asPuzzle(x), { color: true })}</div>
          <div class="meta">
            <b>${pp.esc(x.title || 'Untitled')}</b>
            <span class="muted">${x.author ? 'by ' + pp.esc(x.author) + ' · ' : ''}${x.n}×${x.n}${x.k === 2 ? ' · 2 per pen' : ''} · ${pp.levelName(x.level)}</span>
            <label class="check"><input type="checkbox" data-act="print" ${x.print !== false ? 'checked' : ''}> Print</label>
            <div class="mini-actions">
              <button type="button" data-act="play">▶ Play</button>
              <button type="button" data-act="edit">Edit</button>
              <button type="button" data-act="code">Copy code</button>
              <button type="button" data-act="delete">Delete</button>
            </div>
          </div>
        </article>`).join('');
    }
    if (memoryStore) wrap.insertAdjacentHTML('afterbegin', '<p class="muted">This browser isn’t letting the page save, so these puzzles will disappear when you close it. Use “Copy code” to keep them.</p>');
    const selected = list.filter(x => x.print !== false).length;
    $('print-mine').disabled = selected === 0;
    $('print-mine').textContent = selected ? `Print ${selected} puzzle${selected === 1 ? '' : 's'}` : 'Print';
  }

  function onSavedClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.saved');
    const list = loadSaved();
    const x = list.find(y => y.id === card.dataset.id);
    if (!x) return;
    const act = btn.dataset.act;
    if (act === 'print') { x.print = btn.checked; writeSaved(list); drawSaved(); return; }
    if (act === 'play') { P().play(list.map(asPuzzle), list.indexOf(x)); return; }
    if (act === 'edit') {
      if (hasWork() && st.editingId !== x.id && !confirm('Open this puzzle? Your current drawing will be replaced.')) return;
      $('d-title').value = x.title || '';
      $('d-author').value = x.author || '';
      st.editingId = x.id;
      resetGrid(x.n, x.k, x.regions);
      $('designer').scrollIntoView({ behavior: 'smooth' });
    } else if (act === 'delete') {
      if (!confirm(`Delete “${x.title || 'Untitled'}”? This can’t be undone.`)) return;
      writeSaved(list.filter(y => y.id !== x.id));
      if (st.editingId === x.id) st.editingId = null;
      drawSaved();
    } else if (act === 'code') {
      const code = toCode(x.n, x.k, x.regions);
      copyText(code).then(ok => { btn.textContent = ok ? 'Copied!' : code; setTimeout(() => { btn.textContent = 'Copy code'; }, 2500); });
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
    return Promise.resolve(false);
  }

  function loadCode() {
    const parsed = fromCode($('load-code').value);
    if (!parsed) { flashNote('That code doesn’t look right. It starts with PP1-.'); return; }
    if (hasWork() && !confirm('Open this code? Your current drawing will be replaced.')) return;
    st.editingId = null;
    $('d-title').value = ''; $('d-author').value = '';
    resetGrid(parsed.n, parsed.k, parsed.regions);
    $('load-code').value = '';
  }

  function shareURL() {
    const p = new URLSearchParams({ design: toCode(st.n, st.k, st.regions) });
    const title = $('d-title').value.trim(), author = $('d-author').value.trim();
    if (title) p.set('title', title.slice(0, 40));
    if (author) p.set('by', author.slice(0, 30));
    return `${location.origin}${location.pathname}#${p}`;
  }

  function shareDesign() {
    if (!$('share-code').value) { flashNote('Finish coloring every square first.'); return; }
    const title = $('d-title').value.trim();
    const url = shareURL();
    P().shareLink(url, title ? `${title} · Paper Pens` : 'A Paper Pens puzzle', 'Can you solve my puzzle? One in every row, column and pen.')
      .then(r => {
        if (r === 'copied') flashNote('Link copied. It opens this puzzle for whoever you send it to.');
        else if (r === 'failed') prompt('Copy this link to share your puzzle:', url);
      });
  }

  // Open a puzzle from a shared link (#design=PP1-…&title=…&by=…), then tidy the URL.
  function openFromURL() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (!p.has('design')) return;
    history.replaceState(null, '', location.pathname + location.search);
    const parsed = fromCode(p.get('design'));
    if (!parsed) { flashNote('That shared link is broken. Ask for the share code instead.'); return; }
    st.editingId = null;
    $('d-title').value = (p.get('title') || '').slice(0, 40);
    $('d-author').value = (p.get('by') || '').slice(0, 30);
    resetGrid(parsed.n, parsed.k, parsed.regions);
  }

  function printMine() {
    const list = loadSaved().filter(x => x.print !== false);
    if (!list.length) return;
    P().printHomemade(list.map(asPuzzle));
  }

  // ---------- init ----------

  let ready = false;
  function init() {
    if (ready) return;
    ready = true;
    $('palette').addEventListener('click', e => {
      const b = e.target.closest('[data-pen]');
      if (!b) return;
      st.pen = +b.dataset.pen;
      drawPalette();
    });
    // listen on the container: the SVG inside is redrawn while painting
    const ed = $('editor');
    ed.addEventListener('pointerdown', onDown);
    ed.addEventListener('pointermove', onMove);
    ed.addEventListener('pointerup', onUp);
    ed.addEventListener('pointercancel', onUp);
    $('d-size').addEventListener('change', onSizeChange);
    $('d-k').addEventListener('change', onSizeChange);
    $('blank').addEventListener('click', blankGrid);
    $('random').addEventListener('click', randomLayout);
    $('fix').addEventListener('click', helpFix);
    $('save').addEventListener('click', save);
    $('show-answer').addEventListener('click', () => { st.showAnswer = !st.showAnswer; refresh(false); });
    $('saved-list').addEventListener('click', onSavedClick);
    $('saved-list').addEventListener('change', onSavedClick);
    $('load-btn').addEventListener('click', loadCode);
    $('copy-share').addEventListener('click', () => {
      const code = $('share-code').value;
      if (!code) return;
      copyText(code).then(ok => flashNote(ok ? 'Code copied — paste it anywhere to share.' : 'Select the code and copy it.'));
    });
    $('print-mine').addEventListener('click', printMine);
    $('share-link').addEventListener('click', shareDesign);
    syncDesignOptions();
    st.quiet = true; refresh(true); st.quiet = false;
    drawSaved();
    openFromURL();
  }

  document.addEventListener('paperpens:mode', e => { if (e.detail === 'design') init(); });
  if (document.body.dataset.mode === 'design') init();
})();
