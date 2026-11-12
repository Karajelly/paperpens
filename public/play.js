/*
 * Solve on screen: opens any puzzle in a dialog where you tap squares to mark
 * ✕ and tokens. Tap cycles empty → ✕ → token → empty, and dragging from an
 * empty square paints ✕s (dragging from a ✕ erases them). Rule breaks show in
 * red, progress is kept in this browser, and a finished grid gets confetti.
 */
(function () {
  'use strict';
  const PP = window.PaperPens;
  const EMPTY = 0, X = 1, TOK = 2;
  const CS = 100, M = 8;
  const STORE = 'paperpens.play.';
  const OPT_KEY = 'paperpens.play.options';

  let dlg = null;     // the <dialog>
  let cur = null;     // { list, idx, p, marks, hist, time, solved, hints, more, flash }
  let tickTimer = 0;
  let opts = { auto: false };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch (e) { /* storage unavailable */ }

  // ---------- storage ----------

  function key(p) { return STORE + p.k + ':' + p.regions.join(''); }

  function loadProgress(p) {
    try {
      const v = JSON.parse(localStorage.getItem(key(p)) || 'null');
      if (v && typeof v.m === 'string' && v.m.length === p.n * p.n) return v;
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  function saveProgress() {
    if (!cur) return;
    const m = Array.from(cur.marks).join('');
    try {
      if (!cur.solved && !/[12]/.test(m) && cur.time === 0) localStorage.removeItem(key(cur.p));
      else localStorage.setItem(key(cur.p), JSON.stringify({ m, t: cur.time, s: cur.solved, h: cur.hints }));
    } catch (e) { /* storage unavailable */ }
  }

  // for labels in the preview: 'solved', 'started' or ''
  function status(p) {
    const v = loadProgress(p);
    if (!v) return '';
    return v.s ? 'solved' : 'started';
  }

  // ---------- rules ----------

  function units(p) {
    if (p._units) return p._units;
    const n = p.n, u = [];
    for (let r = 0; r < n; r++) u.push([...Array(n).keys()].map(c => r * n + c));
    for (let c = 0; c < n; c++) u.push([...Array(n).keys()].map(r => r * n + c));
    for (let g = 0; g < n; g++) u.push(p.regions.map((x, i) => (x === g ? i : -1)).filter(i => i >= 0));
    Object.defineProperty(p, '_units', { value: u, enumerable: false });
    return u;
  }

  function touches(n, i, j) {
    return i !== j && Math.abs(((i / n) | 0) - ((j / n) | 0)) <= 1 && Math.abs((i % n) - (j % n)) <= 1;
  }

  // squares whose token breaks a rule, and units that can no longer be finished
  function check(p, marks) {
    const n = p.n, bad = new Set(), stuck = [];
    const toks = [];
    for (let i = 0; i < n * n; i++) if (marks[i] === TOK) toks.push(i);
    for (const a of toks) for (const b of toks) if (touches(n, a, b)) { bad.add(a); bad.add(b); }
    let full = true;
    for (const u of units(p)) {
      const t = u.filter(i => marks[i] === TOK);
      const open = u.filter(i => marks[i] === EMPTY).length;
      if (t.length > p.k) t.forEach(i => bad.add(i));
      if (t.length + open < p.k) stuck.push(u);
      if (t.length !== p.k) full = false;
    }
    return { bad, stuck, solved: full && bad.size === 0 };
  }

  // ---------- drawing ----------

  function boardHTML() {
    const { p, marks } = cur;
    const n = p.n, W = n * CS + 2 * M;
    const t = PP.TOKENS[PP.readForm().token];
    const res = check(p, marks);
    const base = PP.boardSVG(p, { color: true }).replace('</svg>', '');
    const out = [base.replace('<svg ', '<svg id="play-svg" ')];
    // rows / columns / pens that have no room left
    if (!cur.solved) {
      const shade = new Set();
      for (const u of res.stuck) u.forEach(i => shade.add(i));
      for (const i of shade) out.push(cellRect(n, i, 'fill="#e5484d" fill-opacity=".16"'));
    }
    if (cur.flash != null) out.push(cellRect(n, cur.flash, 'fill="none" stroke="#2f7de1" stroke-width="10" class="hint-flash"', 6));
    const xs = [];
    for (let i = 0; i < n * n; i++) {
      if (marks[i] !== X) continue;
      const [cx, cy] = center(n, i), h = CS * 0.15;
      xs.push(`M${cx - h} ${cy - h}L${cx + h} ${cy + h}M${cx + h} ${cy - h}L${cx - h} ${cy + h}`);
    }
    if (xs.length) out.push(`<path d="${xs.join('')}" stroke="#6b6680" stroke-width="7" stroke-linecap="round"/>`);
    for (let i = 0; i < n * n; i++) {
      if (marks[i] !== TOK) continue;
      const [cx, cy] = center(n, i);
      if (res.bad.has(i)) out.push(`<circle cx="${cx}" cy="${cy}" r="${CS * 0.4}" fill="#ffd9da" stroke="#d93036" stroke-width="6"/>`);
      out.push(`<text x="${cx}" y="${cy + 3}" font-size="${CS * 0.62}" text-anchor="middle" dominant-baseline="central" fill="${t.color}">${t.sym}</text>`);
    }
    if (cur.focus != null && cur.kbd) out.push(cellRect(n, cur.focus, 'fill="none" stroke="#2c8a5f" stroke-width="8" stroke-dasharray="14 9"', 9));
    out.push(`<rect x="0" y="0" width="${W}" height="${W}" fill="transparent"/>`);
    out.push('</svg>');
    return { html: out.join(''), res };
  }

  function center(n, i) { return [M + (i % n) * CS + CS / 2, M + ((i / n) | 0) * CS + CS / 2]; }
  function cellRect(n, i, attrs, inset) {
    const d = inset || 0;
    return `<rect x="${M + (i % n) * CS + d}" y="${M + ((i / n) | 0) * CS + d}" width="${CS - 2 * d}" height="${CS - 2 * d}" rx="${d ? 10 : 0}" ${attrs}/>`;
  }

  function fmt(sec) {
    const h = (sec / 3600) | 0, m = ((sec % 3600) / 60) | 0, s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }

  function draw() {
    const { p } = cur;
    const { html, res } = boardHTML();
    dlg.querySelector('.play-board').innerHTML = html;
    const t = PP.TOKENS[PP.readForm().token];
    const label = p.title ? `${PP.esc(p.title)}${p.author ? ` <small>by ${PP.esc(p.author)}</small>` : ''}`
      : (cur.list.length > 1 ? `Puzzle ${cur.idx + 1}` : 'Puzzle');
    dlg.querySelector('.play-title').innerHTML = `<b>${label}</b><span>${p.n} × ${p.n} · ${PP.levelName(p.level)}${p.k === 2 ? ' · 2 per pen' : ''}</span>`;
    dlg.querySelector('.play-goal').innerHTML = `Put <b>${p.k === 2 ? 'two' : 'one'} ${t.sym}</b> in every row, column and pen. They can’t touch, not even corners.`;
    const placed = cur.marks.filter(v => v === TOK).length;
    dlg.querySelector('.play-count').textContent = `${t.sym} ${placed} / ${p.n * p.k}`;
    dlg.querySelector('[data-act="undo"]').disabled = cur.hist.length === 0 || cur.solved;
    dlg.querySelector('[data-act="hint"]').disabled = cur.solved;
    dlg.querySelector('[data-act="prev"]').hidden = cur.list.length < 2;
    dlg.querySelector('[data-act="prev"]').disabled = cur.idx === 0;
    const nextBtn = dlg.querySelector('[data-act="next"]');
    nextBtn.hidden = cur.list.length < 2 && !cur.more;
    nextBtn.disabled = cur.idx >= cur.list.length - 1 && !cur.more;
    nextBtn.textContent = cur.idx >= cur.list.length - 1 && cur.more ? 'New puzzle →' : 'Next →';
    dlg.querySelector('#play-auto').checked = !!opts.auto;
    dlg.classList.toggle('solved', cur.solved);
    const msg = dlg.querySelector('.play-msg');
    if (cur.solved) {
      msg.className = 'play-msg good';
      msg.innerHTML = `<b>Solved in ${fmt(cur.time)}!</b> ${cur.hints ? `(${cur.hints} hint${cur.hints === 1 ? '' : 's'})` : 'No hints — nice.'}`;
    } else if (cur.note) {
      msg.className = 'play-msg ' + (cur.note.kind || '');
      msg.innerHTML = cur.note.text;
    } else if (res.bad.size) {
      msg.className = 'play-msg warn';
      msg.textContent = 'Something’s off: the red ' + t.many + ' break a rule.';
    } else if (res.stuck.length) {
      msg.className = 'play-msg warn';
      msg.textContent = 'A shaded row, column or pen has no room left. Undo or erase a few marks.';
    } else {
      msg.className = 'play-msg';
      msg.innerHTML = 'Tap a square: once for ✕, twice for ' + t.sym + ', three times to clear. Drag to ✕ lots of squares.';
    }
    drawTime();
  }

  function drawTime() {
    if (dlg) dlg.querySelector('.play-time').textContent = '⏱ ' + fmt(cur.time);
  }

  // ---------- moves ----------

  function snapshot() { cur.hist.push(cur.marks.slice()); if (cur.hist.length > 300) cur.hist.shift(); }

  function after() {
    const res = check(cur.p, cur.marks);
    if (res.solved && !cur.solved) {
      cur.solved = true;
      cur.focus = null;
      stopTick();
      saveProgress();
      draw();
      confetti();
      markPreview();
      return;
    }
    saveProgress();
    draw();
  }

  // ✕ the squares a newly placed token rules out (the 8 around it, and any unit now full)
  function autoX(i) {
    if (!opts.auto || cur.marks[i] !== TOK) return;
    const { p, marks } = cur, n = p.n;
    for (let j = 0; j < n * n; j++) if (marks[j] === EMPTY && touches(n, i, j)) marks[j] = X;
    for (const u of units(p)) {
      if (!u.includes(i)) continue;
      if (u.filter(j => marks[j] === TOK).length === p.k) u.forEach(j => { if (marks[j] === EMPTY) marks[j] = X; });
    }
  }

  function cycle(i) {
    snapshot();
    cur.note = null; cur.flash = null;
    cur.marks[i] = (cur.marks[i] + 1) % 3;
    autoX(i);
    after();
  }

  function cellAt(e) {
    const svg = dlg.querySelector('#play-svg');
    if (!svg) return -1;
    const n = cur.p.n, W = n * CS + 2 * M, box = svg.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width * W - M;
    const y = (e.clientY - box.top) / box.height * W - M;
    const c = Math.floor(x / CS), r = Math.floor(y / CS);
    return r < 0 || c < 0 || r >= n || c >= n ? -1 : r * n + c;
  }

  let stroke = null; // { start, startVal, moved, seen }

  function onDown(e) {
    if (cur.solved || e.button > 0) return;
    const i = cellAt(e);
    if (i < 0) return;
    e.preventDefault();
    cur.kbd = false;
    cur.focus = i;
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    stroke = { start: i, last: i, startVal: cur.marks[i], moved: false, seen: new Set([i]) };
    snapshot();
    cur.note = null; cur.flash = null;
    if (stroke.startVal === EMPTY) { cur.marks[i] = X; draw(); }
  }

  function onMove(e) {
    if (!stroke) return;
    const i = cellAt(e);
    if (i < 0 || i === stroke.last) return;
    // fill in any squares a fast drag skipped over
    const n = cur.p.n, r0 = (stroke.last / n) | 0, c0 = stroke.last % n, r1 = (i / n) | 0, c1 = i % n;
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    for (let s = 1; s <= steps; s++) {
      const j = Math.round(r0 + (r1 - r0) * s / steps) * n + Math.round(c0 + (c1 - c0) * s / steps);
      if (stroke.seen.has(j)) continue;
      stroke.seen.add(j);
      stroke.moved = true;
      if (stroke.startVal === EMPTY && cur.marks[j] === EMPTY) cur.marks[j] = X;
      else if (stroke.startVal === X) {
        if (cur.marks[stroke.start] === X) cur.marks[stroke.start] = EMPTY;
        if (cur.marks[j] === X) cur.marks[j] = EMPTY;
      }
    }
    stroke.last = i;
    draw();
  }

  function onUp() {
    if (!stroke) return;
    const { start, startVal, moved } = stroke;
    stroke = null;
    if (!moved) {
      if (startVal === X) { cur.marks[start] = TOK; autoX(start); }
      else if (startVal === TOK) cur.marks[start] = EMPTY;
    }
    // drop the undo step if nothing changed
    const prev = cur.hist[cur.hist.length - 1];
    if (prev && prev.every((v, j) => v === cur.marks[j])) cur.hist.pop();
    after();
  }

  function onKey(e) {
    if (!cur || cur.solved) {
      if (cur && e.key === 'Enter' && !dlg.querySelector('[data-act="next"]').disabled && document.activeElement === dlg.querySelector('.play-board')) next(1);
      return;
    }
    const n = cur.p.n;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.target.closest('button, input')) return;
    const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
    if (cur.focus == null) cur.focus = 0;
    if (moves[e.key] != null) {
      e.preventDefault();
      const f = cur.focus, r = (f / n) | 0, c = f % n;
      if ((e.key === 'ArrowLeft' && c === 0) || (e.key === 'ArrowRight' && c === n - 1) ||
          (e.key === 'ArrowUp' && r === 0) || (e.key === 'ArrowDown' && r === n - 1)) return;
      cur.focus = f + moves[e.key];
      cur.kbd = true;
      draw();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); cur.kbd = true; cycle(cur.focus);
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault(); cur.kbd = true; set(cur.focus, cur.marks[cur.focus] === X ? EMPTY : X);
    } else if (e.key === 's' || e.key === 'S' || e.key === '.') {
      e.preventDefault(); cur.kbd = true; set(cur.focus, cur.marks[cur.focus] === TOK ? EMPTY : TOK);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault(); cur.kbd = true; set(cur.focus, EMPTY);
    }
  }

  function set(i, v) {
    if (cur.marks[i] === v) return;
    snapshot();
    cur.note = null; cur.flash = null;
    cur.marks[i] = v;
    autoX(i);
    after();
  }

  function undo() {
    if (!cur.hist.length || cur.solved) return;
    cur.marks = cur.hist.pop();
    cur.note = null; cur.flash = null;
    after();
  }

  function restart() {
    if (cur.marks.some(v => v !== EMPTY) && !confirm('Clear this puzzle and start over?')) return;
    cur.marks = new Array(cur.p.n * cur.p.n).fill(EMPTY);
    cur.hist = []; cur.time = 0; cur.solved = false; cur.hints = 0; cur.note = null; cur.flash = null;
    saveProgress();
    markPreview();
    draw();
    startTick();
  }

  // First point out a wrong mark; otherwise show one square that holds a token.
  function hint() {
    const { p, marks } = cur, t = PP.TOKENS[PP.readForm().token];
    const sol = new Set(p.solution);
    cur.hints++;
    const wrongTok = marks.findIndex((v, i) => v === TOK && !sol.has(i));
    const wrongX = marks.findIndex((v, i) => v === X && sol.has(i));
    if (wrongTok >= 0) {
      cur.flash = wrongTok;
      cur.note = { kind: 'hint', text: `That outlined ${t.one} isn’t in the answer.` };
    } else if (wrongX >= 0) {
      cur.flash = wrongX;
      cur.note = { kind: 'hint', text: `The outlined ✕ is wrong: that square needs a ${t.one}.` };
    } else {
      const open = p.solution.filter(i => marks[i] !== TOK);
      // prefer a square in the pen with the fewest open squares: the most "findable" one
      const openIn = g => marks.filter((v, i) => v === EMPTY && p.regions[i] === g).length;
      open.sort((a, b) => openIn(p.regions[a]) - openIn(p.regions[b]));
      snapshot();
      marks[open[0]] = TOK;
      autoX(open[0]);
      cur.flash = open[0];
      cur.note = { kind: 'hint', text: `Here’s one ${t.one} for free. Look at the smallest pens next.` };
    }
    after();
  }

  function next(step) {
    if (cur.idx + step >= cur.list.length && step > 0 && cur.more) {
      const p = cur.more();
      if (!p) return;
      cur.list = cur.list.concat([p]);
    }
    const idx = cur.idx + step;
    if (idx < 0 || idx >= cur.list.length) return;
    load(cur.list, idx, cur.more);
  }

  // ---------- timer ----------

  function startTick() {
    stopTick();
    if (!cur || cur.solved) return;
    tickTimer = setInterval(() => {
      if (document.hidden || !dlg.open) return;
      cur.time++;
      drawTime();
      if (cur.time % 5 === 0) saveProgress();
    }, 1000);
  }
  function stopTick() { clearInterval(tickTimer); tickTimer = 0; }

  // ---------- confetti ----------

  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = dlg.querySelector('.play-board').getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const cols = ['#F6A5B5', '#9ED9AE', '#FFE07A', '#9EC4F5', '#C9AEF2', '#FFBF8F', '#8FDCD6'];
    const bits = [];
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * Math.PI * 2, dist = 140 + Math.random() * 300;
      bits.push(`<i style="--x:${box.left + box.width / 2}px;--y:${box.top + box.height / 2}px;` +
        `--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist + 160}px;--r:${(Math.random() * 720 - 360) | 0}deg;` +
        `--c:${cols[i % cols.length]};animation-delay:${(Math.random() * 120) | 0}ms"></i>`);
    }
    layer.innerHTML = bits.join('');
    dlg.appendChild(layer); // inside the dialog so it shows above the backdrop
    setTimeout(() => layer.remove(), 1700);
  }

  // ---------- dialog ----------

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'play';
    dlg.setAttribute('aria-label', 'Solve on screen');
    dlg.innerHTML = `
      <header class="play-head">
        <div class="play-title"></div>
        <span class="play-time" aria-label="Time"></span>
        <button type="button" class="play-close" data-act="close" aria-label="Close" title="Close (Esc)">✕</button>
      </header>
      <p class="play-goal"></p>
      <div class="play-board" tabindex="0" aria-label="Puzzle grid. Arrow keys move, space cycles a square, X marks, S places a token."></div>
      <div class="play-msg" role="status" aria-live="polite"></div>
      <div class="play-tools">
        <button type="button" class="btn" data-act="undo" title="Undo (Ctrl+Z)">↶ Undo</button>
        <button type="button" class="btn" data-act="hint">💡 Hint</button>
        <button type="button" class="btn ghost" data-act="restart">Start over</button>
        <label class="switch play-auto"><input type="checkbox" id="play-auto"><span class="track"></span><span>Auto ✕</span></label>
      </div>
      <footer class="play-foot">
        <button type="button" class="btn" data-act="prev">← Prev</button>
        <span class="play-count"></span>
        <button type="button" class="btn primary" data-act="next">Next →</button>
      </footer>`;
    document.body.appendChild(dlg);
    const board = dlg.querySelector('.play-board');
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onUp);
    board.addEventListener('contextmenu', e => e.preventDefault());
    dlg.addEventListener('keydown', onKey);
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { close(); return; } // backdrop
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') close();
      else if (act === 'undo') undo();
      else if (act === 'hint') hint();
      else if (act === 'restart') restart();
      else if (act === 'prev') next(-1);
      else if (act === 'next') next(1);
    });
    dlg.querySelector('#play-auto').addEventListener('change', e => {
      opts.auto = e.target.checked;
      try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch (err) { /* storage unavailable */ }
    });
    dlg.addEventListener('close', () => { stopTick(); saveProgress(); markPreview(); document.body.classList.remove('playing'); });
  }

  function load(list, idx, more) {
    if (cur) saveProgress();
    const p = list[idx];
    const saved = loadProgress(p);
    cur = {
      list, idx, p, more,
      marks: saved ? [...saved.m].map(Number) : new Array(p.n * p.n).fill(EMPTY),
      hist: [], time: saved ? saved.t || 0 : 0, solved: !!(saved && saved.s), hints: saved ? saved.h || 0 : 0,
      note: null, flash: null, focus: null, kbd: false,
    };
    draw();
    startTick();
  }

  function open(list, idx, more) {
    if (!list || !list[idx]) return;
    if (!dlg) build();
    load(list, idx, more);
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('playing');
    dlg.querySelector('.play-board').focus({ preventScroll: true });
  }

  function close() { if (dlg && dlg.open) dlg.close(); }

  // refresh the Play / Solved pills on the print preview
  function markPreview() {
    for (const b of document.querySelectorAll('.play-btn[data-idx]')) {
      const p = PP.previewPuzzle && PP.previewPuzzle(+b.dataset.idx);
      if (p) setPill(b, status(p));
    }
  }

  function setPill(b, s) {
    b.classList.toggle('done', s === 'solved');
    b.textContent = s === 'solved' ? '✓ Solved' : s === 'started' ? '▶ Keep going' : '▶ Play';
  }

  Object.assign(PP, { play: open, playStatus: status, setPlayPill: setPill });
})();
