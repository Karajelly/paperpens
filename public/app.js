(function () {
  'use strict';
  const E = window.PuzzleEngine;
  const form = document.getElementById('settings');
  const pagesEl = document.getElementById('pages');
  const statusEl = document.getElementById('status');
  const printBtn = document.getElementById('print');
  const makeBtn = document.getElementById('make');

  const TOKENS = {
    star:  { sym: '★', one: 'star',  many: 'stars',  color: '#c58b00' },
    bull:  { sym: '🐂', one: 'bull',  many: 'bulls',  color: '#111' },
    cow:   { sym: '🐄', one: 'cow',   many: 'cows',   color: '#111' },
    cat:   { sym: '🐱', one: 'cat',   many: 'cats',   color: '#111' },
    heart: { sym: '♥', one: 'heart', many: 'hearts', color: '#c0392b' },
    dot:   { sym: '●', one: 'dot',   many: 'dots',   color: '#111' },
  };
  const PASTELS = ['#FCE1E4', '#DDEFE3', '#FFF0BF', '#DCEAFB', '#ECDDF8', '#FFE1C9', '#EEEBD9', '#E4E4E4'];
  const LAYOUT = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3] };

  // ---------- settings <-> form <-> URL ----------

  function randomCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  function todayCode() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function readForm() {
    const f = form.elements;
    return {
      k: +f.k.value,
      n: +f.n.value,
      level: +f.level.value,
      count: Math.max(1, Math.min(24, +f.count.value || 1)),
      perPage: +f.perPage.value,
      paper: f.paper.value,
      token: f.token.value,
      color: f.color.checked,
      rules: f.rules.checked,
      names: f.names.checked,
      key: f.key.checked,
      tips: f.tips.checked,
      code: (f.code.value || '').trim().toUpperCase() || randomCode(),
    };
  }

  function writeForm(s) {
    const f = form.elements;
    for (const key of ['k', 'n', 'level', 'perPage', 'paper', 'token']) if (s[key] != null) f[key].value = String(s[key]);
    if (s.count != null) f.count.value = s.count;
    for (const key of ['color', 'rules', 'names', 'key', 'tips']) if (s[key] != null) f[key].checked = !!s[key];
    if (s.code) f.code.value = s.code;
  }

  function toHash(s) {
    const p = new URLSearchParams();
    for (const [key, v] of Object.entries(s)) p.set(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    return '#' + p.toString();
  }

  function fromHash() {
    if (location.hash.length < 2) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    const s = {};
    for (const [key, v] of p) {
      if (['color', 'rules', 'names', 'key', 'tips'].includes(key)) s[key] = v === '1';
      else if (['k', 'n', 'level', 'count', 'perPage'].includes(key)) s[key] = +v;
      else s[key] = v;
    }
    return s;
  }

  // keep the choices sensible for 1 vs 2 tokens per pen
  function syncOptions() {
    const f = form.elements;
    const two = f.k.value === '2';
    for (const o of f.n.options) o.disabled = two && +o.value < 8;
    if (two && +f.n.value < 8) f.n.value = '9';
    f.level.options[0].disabled = two;
    if (two && f.level.value === '1') f.level.value = '2';
  }

  // ---------- drawing ----------

  function regionColors(p) {
    const { n, regions } = p;
    const adj = Array.from({ length: n }, () => new Set());
    for (let i = 0; i < n * n; i++) {
      const r = (i / n) | 0, c = i % n;
      if (c < n - 1 && regions[i] !== regions[i + 1]) { adj[regions[i]].add(regions[i + 1]); adj[regions[i + 1]].add(regions[i]); }
      if (r < n - 1 && regions[i] !== regions[i + n]) { adj[regions[i]].add(regions[i + n]); adj[regions[i + n]].add(regions[i]); }
    }
    const order = [...Array(n).keys()].sort((a, b) => adj[b].size - adj[a].size);
    const col = new Array(n).fill(-1);
    const offset = p.seed % PASTELS.length;
    for (const g of order) {
      const used = new Set([...adj[g]].map(h => col[h]));
      let c = 0;
      while (used.has((c + offset) % PASTELS.length)) c++;
      col[g] = (c + offset) % PASTELS.length;
    }
    return col.map(c => PASTELS[c]);
  }

  function boardSVG(p, opt) {
    opt = opt || {};
    const n = p.n, cs = 100, m = 8, W = n * cs + 2 * m;
    const reg = p.regions;
    const out = [`<svg viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${n} by ${n} puzzle grid">`];
    out.push(`<rect x="${m}" y="${m}" width="${n * cs}" height="${n * cs}" fill="#fff"/>`);
    if (opt.color) {
      const fills = regionColors(p);
      for (let i = 0; i < n * n; i++) {
        const r = (i / n) | 0, c = i % n;
        out.push(`<rect x="${m + c * cs}" y="${m + r * cs}" width="${cs}" height="${cs}" fill="${fills[reg[i]]}"/>`);
      }
    }
    // thin grid
    const thin = [];
    for (let i = 1; i < n; i++) {
      thin.push(`M${m + i * cs} ${m}V${m + n * cs}`, `M${m} ${m + i * cs}H${m + n * cs}`);
    }
    out.push(`<path d="${thin.join('')}" stroke="#8d8d8d" stroke-width="2.2" fill="none"/>`);
    // pen walls
    const thick = [];
    for (let i = 0; i < n * n; i++) {
      const r = (i / n) | 0, c = i % n, x = m + c * cs, y = m + r * cs;
      if (c < n - 1 && reg[i] !== reg[i + 1]) thick.push(`M${x + cs} ${y}V${y + cs}`);
      if (r < n - 1 && reg[i] !== reg[i + n]) thick.push(`M${x} ${y + cs}H${x + cs}`);
    }
    out.push(`<path d="${thick.join('')}" stroke="#111" stroke-width="10" stroke-linecap="round" fill="none"/>`);
    out.push(`<rect x="${m}" y="${m}" width="${n * cs}" height="${n * cs}" fill="none" stroke="#111" stroke-width="12" stroke-linejoin="round"/>`);
    // marks
    if (opt.xs) {
      const d = [];
      for (const i of opt.xs) {
        const r = (i / n) | 0, c = i % n, cx = m + c * cs + cs / 2, cy = m + r * cs + cs / 2, h = cs * 0.17;
        d.push(`M${cx - h} ${cy - h}L${cx + h} ${cy + h}M${cx + h} ${cy - h}L${cx - h} ${cy + h}`);
      }
      out.push(`<path d="${d.join('')}" stroke="#555" stroke-width="6" stroke-linecap="round"/>`);
    }
    if (opt.tokens) {
      const t = opt.token;
      for (const i of opt.tokens) {
        const r = (i / n) | 0, c = i % n;
        out.push(`<text x="${m + c * cs + cs / 2}" y="${m + r * cs + cs / 2 + 3}" font-size="${cs * 0.62}" text-anchor="middle" dominant-baseline="central" fill="${t.color}">${t.sym}</text>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function sheet(s) {
    const d = el('section', 'sheet' + (s.paper === 'a4' ? ' a4' : ''));
    return d;
  }

  function rulesHTML(s, kk) {
    const t = TOKENS[s.token];
    if (kk === 'mixed') {
      return `<b>How to play:</b><span>Put exactly <b>one ${t.one}</b> (or <b>two</b> on puzzles marked “2 per pen”) in every row, every column and every pen (the areas inside the thick lines). ` +
        `${cap(t.many)} can’t touch each other — not even corners. Mark ✕ on squares that can’t have a ${t.one}.</span>`;
    }
    const k = kk === 2 ? 'two' : 'one';
    const tok = kk === 2 ? t.many : t.one;
    return `<b>How to play:</b><span>Put exactly <b>${k} ${tok}</b> in every row, every column and every pen (the areas inside the thick lines). ` +
      `${cap(t.many)} can’t touch each other — not even corners. Mark ✕ on squares that can’t have a ${t.one}.</span>`;
  }

  function cap(w) { return w[0].toUpperCase() + w.slice(1); }

  function headHTML(s, title) {
    const who = s.names ? `<div class="who"><span>Name<span class="blank"></span></span><span>Date<span class="blank short"></span></span></div>` : '';
    return `<h2>${title}</h2>${who}`;
  }

  function footHTML(s, extra) {
    if (s.homemade) return `<span>Paper Pens · homemade puzzles</span><span>${extra}</span>`;
    const two = s.k === 2 ? ' · 2 per pen' : '';
    return `<span>Paper Pens · code <b>${esc(s.code)}</b> · ${s.n}×${s.n}${two}</span><span>${extra}</span>`;
  }

  function esc(x) { return String(x).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

  function levelName(l) { return E.LEVELS[l] || 'Super hard'; }

  function labelHTML(s, p, idx) {
    let t = `<b>#${idx + 1}</b>`;
    if (p.title) t += ` <b>${esc(p.title)}</b>`;
    if (p.author) t += ` <span class="lvl">by ${esc(p.author)}</span>`;
    t += ` <span class="lvl">· ${levelName(p.level)}${s.homemade ? ` · ${p.n}×${p.n}` : ''}${s.homemade && p.k === 2 ? ' · 2 per pen' : ''}</span>`;
    return `<span>${t}</span>`;
  }

  function render(s, puzzles) {
    pagesEl.innerHTML = '';
    document.getElementById('page-size').textContent =
      `@page { size: ${s.paper === 'a4' ? 'A4' : 'letter'}; margin: 0; }`;
    const [cols, rows] = LAYOUT[s.perPage];
    const t = TOKENS[s.token];
    const totalPages = Math.ceil(puzzles.length / s.perPage);

    for (let pg = 0; pg < totalPages; pg++) {
      const sh = sheet(s);
      sh.appendChild(el('header', 'sheet-head', headHTML(s, 'Paper Pens')));
      if (s.rules) {
        const ks = new Set(puzzles.slice(pg * s.perPage, (pg + 1) * s.perPage).map(p => p.k));
        sh.appendChild(el('div', 'rules', rulesHTML(s, ks.size > 1 ? 'mixed' : [...ks][0])));
      }
      const grid = el('div', 'grid');
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
      for (let j = 0; j < s.perPage; j++) {
        const idx = pg * s.perPage + j;
        const p = puzzles[idx];
        if (!p) break;
        const box = el('div', 'pz');
        const time = s.names ? `<span>Time<span class="blank short"></span></span>` : '';
        box.appendChild(el('div', 'pz-label', `${labelHTML(s, p, idx)}${time}`));
        box.appendChild(el('div', 'board-wrap', boardSVG(p, { color: s.color })));
        grid.appendChild(box);
      }
      sh.appendChild(grid);
      sh.appendChild(el('footer', 'sheet-foot', footHTML(s, `page ${pg + 1} of ${totalPages}`)));
      pagesEl.appendChild(sh);
    }

    if (s.tips) pagesEl.appendChild(tipsSheet(s, puzzles.some(p => p.k === 2) && puzzles.every(p => p.k === 2) ? 2 : 1));

    if (s.key) {
      const per = 12;
      const keyPages = Math.ceil(puzzles.length / per);
      for (let pg = 0; pg < keyPages; pg++) {
        const sh = sheet(s);
        sh.appendChild(el('header', 'sheet-head', `<h2>Answers</h2><div class="who">Fold or cut this page off before solving!</div>`));
        const grid = el('div', 'grid key');
        grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
        grid.style.gridTemplateRows = 'repeat(4, 1fr)';
        for (let j = 0; j < per; j++) {
          const idx = pg * per + j;
          const p = puzzles[idx];
          if (!p) break;
          const box = el('div', 'pz');
          box.appendChild(el('div', 'pz-label', labelHTML(s, p, idx)));
          box.appendChild(el('div', 'board-wrap', boardSVG(p, { color: s.color, tokens: p.solution, token: t })));
          grid.appendChild(box);
        }
        sh.appendChild(grid);
        sh.appendChild(el('footer', 'sheet-foot', footHTML(s, `answers ${pg + 1} of ${keyPages}`)));
        pagesEl.appendChild(sh);
      }
    }
  }

  function tipsSheet(s, k) {
    const t = TOKENS[s.token];
    const one = t.one, many = t.many;
    // example: a small puzzle with one token placed and everything it rules out
    const ex = E.generate({ n: 6, k: 1, level: 1, seed: 20261111 });
    const tok = ex.solution.find(i => { const r = (i / 6) | 0, c = i % 6; return r > 0 && r < 5 && c > 0 && c < 5; }) ?? ex.solution[0];
    const xs = [];
    const tr = (tok / 6) | 0, tc = tok % 6;
    for (let i = 0; i < 36; i++) {
      if (i === tok) continue;
      const r = (i / 6) | 0, c = i % 6;
      if (r === tr || c === tc || ex.regions[i] === ex.regions[tok] || (Math.abs(r - tr) <= 1 && Math.abs(c - tc) <= 1)) xs.push(i);
    }
    const sh = sheet(s);
    sh.appendChild(el('header', 'sheet-head', `<h2>How to solve</h2>`));
    const body = el('div', 'tips');
    const countWord = k === 2 ? 'two' : 'one';
    body.innerHTML = `
      <div>
        <h3>1. ✕ out around every ${one}</h3>
        <p>When you place a ${one}, mark ✕ on the 8 squares touching it. ${k === 1 ? `Its whole row, column and pen are now done too — ✕ them all.` : `Once a row, column or pen has two ${many}, ✕ the rest of it.`}</p>
        <h3>2. Start with the smallest pens</h3>
        <p>A tiny pen has only a few choices. Any square that touches <i>every</i> open square of that pen can’t hold a ${one} — whichever square the pen uses, it would touch it.</p>
        <h3>3. A pen stuck in one row</h3>
        <p>If all of a pen’s open squares sit in one row, that row’s ${one} has to be in that pen. ✕ out the rest of the row. (Same for columns — and backwards: a row that only has open squares in one pen.)</p>
        <h3>4. Count groups</h3>
        <p>If two pens fit completely inside two rows, those two rows’ ${many} must come from those two pens. ✕ every other square in those rows. Works with 3 pens and 3 rows, columns, and so on.</p>
        <h3>5. Try it and see (pencil!)</h3>
        <p>Stuck? Lightly draw a ${one} and follow the ✕s. If some row, column or pen ends up with no room, that square was wrong — erase and ✕ it.</p>
        <div class="paper">
          <b>Pen-and-paper tips</b>
          <ul>
            <li>Use a pencil, or slide the page into a clear sheet protector and use a dry-erase marker so you can reuse it.</li>
            <li>Every puzzle has exactly <b>one</b> answer and never needs guessing. Each row, column and pen ends with ${countWord} ${k === 2 ? many : one}.</li>
            <li>Race a friend: print two copies with the same code and start a timer.</li>
          </ul>
        </div>
      </div>
      <div class="fig">
        <div class="board-wrap">${boardSVG(ex, { color: s.color, tokens: [tok], xs, token: t })}</div>
        <div>One ${one} placed: every ✕ is a square that can’t have a ${one} any more${k === 2 ? ' (in the 1-per-pen game)' : ''}.</div>
      </div>`;
    sh.appendChild(body);
    sh.appendChild(el('footer', 'sheet-foot', `<span>Paper Pens</span><span></span>`));
    return sh;
  }

  // ---------- generate ----------

  let runId = 0;
  let lastMade = null; // { s, puzzles } so switching modes can restore the preview
  const EMPTY_MSG = '<p class="empty">Pick your settings and press <b>Make puzzles</b>. You’ll see the pages here, then press <b>Print</b>.</p>';

  async function make(s) {
    const id = ++runId;
    makeBtn.disabled = true;
    printBtn.disabled = true;
    const puzzles = [];
    for (let i = 0; i < s.count; i++) {
      statusEl.textContent = `Building puzzle ${i + 1} of ${s.count}…`;
      await new Promise(r => setTimeout(r, 0));
      if (id !== runId) return;
      const seed = E.hashString(`${s.code}|${s.n}|${s.k}|${s.level}|${i}`);
      const p = E.generate({ n: s.n, k: s.k, level: s.level, seed });
      if (p) puzzles.push(p);
    }
    lastMade = { s, puzzles };
    render(s, puzzles);
    const off = puzzles.filter(p => p.level !== s.level).length;
    statusEl.textContent = `${puzzles.length} puzzle${puzzles.length === 1 ? '' : 's'} ready.` +
      (off ? ` ${off} came out at a different level than asked (each puzzle shows its level). Small grids can’t get very hard.` : '');
    makeBtn.disabled = false;
    printBtn.disabled = puzzles.length === 0;
  }

  // ---------- modes ----------

  function setMode(mode) {
    document.body.dataset.mode = mode;
    for (const b of document.querySelectorAll('.mode-tabs button')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    if (mode === 'make') {
      if (lastMade) render(lastMade.s, lastMade.puzzles);
      else pagesEl.innerHTML = EMPTY_MSG;
    }
    try { localStorage.setItem('paperpens.mode', mode); } catch (e) { /* storage unavailable */ }
    document.dispatchEvent(new CustomEvent('paperpens:mode', { detail: mode }));
  }

  // Print a list of homemade puzzles with the current paper settings.
  function printHomemade(puzzles) {
    const s = Object.assign(readForm(), { homemade: true });
    render(s, puzzles);
    window.print();
  }

  // Share a URL: the system share sheet where there is one (phones), else the clipboard.
  // Resolves to 'shared', 'copied', 'cancelled' or 'failed'.
  function shareLink(url, title, text) {
    if (navigator.share) {
      return navigator.share({ title, text, url }).then(() => 'shared', e => (e && e.name === 'AbortError' ? 'cancelled' : copy()));
    }
    return copy();
    function copy() {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.resolve('failed');
      return navigator.clipboard.writeText(url).then(() => 'copied', () => 'failed');
    }
  }

  function shareSheet() {
    syncOptions();
    const s = readForm();
    form.elements.code.value = s.code;
    history.replaceState(null, '', toHash(s));
    const what = `${levelName(s.level).toLowerCase()} ${s.n}×${s.n} puzzle${s.count === 1 ? '' : 's'}`;
    shareLink(location.href, 'Paper Pens', `${s.count} printable ${what} (code ${s.code}). Same link, same puzzles.`).then(r => {
      statusEl.textContent = r === 'copied' ? 'Link copied. Anyone who opens it gets these exact puzzles.'
        : r === 'failed' ? `Copy this link to share: ${location.href}` : statusEl.textContent;
    });
  }

  window.PaperPens = { TOKENS, PASTELS, boardSVG, regionColors, readForm, printHomemade, levelName, esc, shareLink };

  // ---------- wire up ----------

  form.elements.k.addEventListener('change', syncOptions);
  document.getElementById('new-code').addEventListener('click', () => { form.elements.code.value = randomCode(); });
  document.getElementById('today').addEventListener('click', () => { form.elements.code.value = todayCode(); });
  printBtn.addEventListener('click', () => window.print());
  document.getElementById('share').addEventListener('click', shareSheet);
  for (const b of document.querySelectorAll('.mode-tabs button')) b.addEventListener('click', () => setMode(b.dataset.mode));
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (document.body.dataset.mode !== 'make') return;
    syncOptions();
    const s = readForm();
    form.elements.code.value = s.code;
    history.replaceState(null, '', toHash(s));
    make(s);
  });

  const fromUrl = fromHash();
  if (fromUrl && fromUrl.design) {
    // a "design" link: designer.js loads the puzzle from the URL
    form.elements.code.value = randomCode();
    syncOptions();
    setMode('design');
  } else if (fromUrl) {
    writeForm(fromUrl);
    syncOptions();
    setMode('make');
    make(readForm());
  } else {
    form.elements.code.value = randomCode();
    syncOptions();
    let saved = 'make';
    try { saved = localStorage.getItem('paperpens.mode') || 'make'; } catch (e) { /* storage unavailable */ }
    setMode(saved === 'design' ? 'design' : 'make');
  }
})();
