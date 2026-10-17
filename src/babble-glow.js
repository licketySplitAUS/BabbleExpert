'use strict';
const { findBabbleWordEntry } = require('./babble-entry');

/*
 * The resolver is kept outside the injected browser code so the duplicate-letter
 * behaviour can be unit tested. A q tile represents "qu", as it does in Babble.
 */
function findGridPaths(letters, width, rawWord, limit = 4096) {
  const word = String(rawWord || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!word || !width || letters.length !== width * width) return [];
  const paths = [];

  function visit(index, offset, path, used) {
    if (paths.length >= limit || used.has(index)) return;
    const letter = String(letters[index] || '').toLowerCase();
    if (word[offset] !== letter) return;

    let next = offset + 1;
    if (letter === 'q' && word[next] === 'u') next++;
    const nextPath = path.concat(index);
    if (next >= word.length) { paths.push(nextPath); return; }

    const row = Math.floor(index / width), col = index % width;
    const nextUsed = new Set(used); nextUsed.add(index);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < width && c >= 0 && c < width) visit(r * width + c, next, nextPath, nextUsed);
    }
  }

  for (let i = 0; i < letters.length && paths.length < limit; i++) visit(i, 0, [], new Set());
  return paths;
}

function chooseGridPath(paths, previous = [], weights = []) {
  if (!paths.length) return [];
  let best = paths[0], bestScore = -Infinity;
  for (const path of paths) {
    let shared = 0;
    while (shared < path.length && shared < previous.length && path[shared] === previous[shared]) shared++;
    // Continuity dominates; the small centre bias makes the first choice feel intentional.
    const score = (weights[paths.indexOf(path)] || 0) * 100000 + shared * 10000 - Math.abs(path[0] - 12) - path.reduce((n, v, i) => n + (i ? Math.abs(v - path[i - 1]) : 0), 0) / 100;
    if (score > bestScore) { best = path; bestScore = score; }
  }
  return best;
}

function installBabbleGlow(findPaths, choosePath, allowedHosts, findEntry) {
  'use strict';
  if (!allowedHosts.includes(location.hostname)) return false;
  // Leave authentication/account pages entirely to the website.
  if (!findEntry(document)) return false;
  if (window.__babbleExpertGlow) { window.__babbleExpertGlow.refresh(); return true; }

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'babble-expert-glow';
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs>
    <filter id="be-soft" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="be-bloom" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="9" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="be-rainbow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="180" y2="180" spreadMethod="repeat">
      <stop offset="0" stop-color="#ff5f8f"/><stop offset=".17" stop-color="#ffb84d"/>
      <stop offset=".34" stop-color="#fff06a"/><stop offset=".5" stop-color="#6fffa8"/>
      <stop offset=".67" stop-color="#55dcff"/><stop offset=".84" stop-color="#8d7cff"/>
      <stop offset="1" stop-color="#ff62d0"/>
      <animateTransform attributeName="gradientTransform" type="translate" values="-180 -180;0 0;180 180" dur="7s" repeatCount="indefinite"/>
    </linearGradient>
  </defs><g class="be-live"></g><g class="be-fx"></g>`;

  const style = document.createElement('style');
  style.id = 'babble-expert-glow-style';
  style.textContent = `
    #babble-expert-glow{position:fixed;inset:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;overflow:visible}
    #babble-expert-glow .be-contour{fill:url(#be-rainbow);opacity:.9;filter:url(#be-bloom)}
    #babble-expert-glow .be-gap-shadow{fill:none;stroke:rgba(37,18,55,.62);stroke-width:7;stroke-linecap:round}
    #babble-expert-glow .be-gap{fill:none;stroke:url(#be-rainbow);stroke-width:3.6;stroke-linecap:round;opacity:.96;filter:url(#be-soft)}
    #babble-expert-glow .be-gap-core{fill:none;stroke:rgba(255,255,255,.86);stroke-width:.85;stroke-linecap:round}
    #babble-expert-glow .be-arrow-shadow{fill:rgba(37,18,55,.72);stroke:rgba(37,18,55,.72);stroke-width:3;stroke-linejoin:round}
    #babble-expert-glow .be-arrow{fill:url(#be-rainbow);stroke:rgba(255,255,255,.85);stroke-width:.55;filter:url(#be-soft)}
    #babble-expert-glow .be-release{transform-box:view-box;transform-origin:center;animation:be-release 1.05s cubic-bezier(.16,.8,.28,1) forwards}
    #babble-expert-glow .be-release.green{color:#a8ff68}#babble-expert-glow .be-release.amber{color:#ffd35e}#babble-expert-glow .be-release.red{color:#ff5578}
    #babble-expert-glow .be-release .be-contour{fill:currentColor;filter:url(#be-bloom)}
    #babble-expert-glow .be-release .be-gap,#babble-expert-glow .be-release .be-gap-core,#babble-expert-glow .be-release .be-gap-shadow{stroke:currentColor;filter:url(#be-bloom)}
    #babble-expert-glow .be-release .be-arrow,#babble-expert-glow .be-release .be-arrow-shadow{fill:currentColor;stroke:currentColor}
    @keyframes be-release{0%{opacity:1;transform:translateY(0) scale(1)}35%{opacity:1;transform:translateY(-5px) scale(1.08)}100%{opacity:0;transform:translateY(-34px) scale(1.18)}}
    @media (prefers-reduced-motion:reduce){#babble-expert-glow *{animation-duration:.01ms!important;animation-iteration-count:1!important}}
  `;
  (document.head || document.documentElement).appendChild(style);
  (document.body || document.documentElement).appendChild(svg);

  const live = svg.querySelector('.be-live'), fx = svg.querySelector('.be-fx');
  let board = null, current = [], currentWord = '', pendingNative = false, remainingWords = [], enabled = true;
  const routeCache = new Map();
  const el = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
    return node;
  };

  function readBoard() {
    for (const table of document.querySelectorAll('#left_column table, table')) {
      const rows = Array.from(table.rows || []);
      if (rows.length !== 5 || rows.some(row => row.cells.length !== 5)) continue;
      const cells = rows.flatMap(row => Array.from(row.cells));
      const letters = cells.map(cell => {
        const img = cell.querySelector('img');
        const match = img && (img.getAttribute('src') || '').match(/\/images\/([a-z])\.gif(?:[?#].*)?$/i);
        return match ? match[1].toLowerCase() : '';
      });
      if (letters.every(Boolean)) return { table, cells: cells.map(cell => cell.querySelector('img')), letters, width: 5 };
    }
    return null;
  }

  function longestPaths(word) {
    if (!board) board = readBoard();
    if (!board) return { paths: [], word: '' };
    for (let length = word.length; length > 0; length--) {
      const prefix = word.slice(0, length), paths = findPaths(board.letters, board.width, prefix);
      if (paths.length) return { paths, word: prefix };
    }
    return { paths: [], word: '' };
  }

  function predictiveWeights(paths, prefix) {
    if (!remainingWords.length || !board || !paths.length) return [];
    const weights = paths.map(() => 0);
    for (const word of remainingWords) {
      if (!word.startsWith(prefix)) continue;
      let routes = routeCache.get(word);
      if (!routes) { routes = findPaths(board.letters, board.width, word, 256); routeCache.set(word, routes); }
      paths.forEach((candidate, index) => {
        if (routes.some(route => candidate.every((cell, i) => route[i] === cell))) weights[index] += 1 + Math.min(8, word.length - prefix.length) * .08;
      });
    }
    return weights;
  }

  function gapGeometry(points) {
    let d = '', arrows = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1, ux = dx / distance, uy = dy / distance;
      const edge = point => Math.min(
        Math.abs(ux) < .001 ? Infinity : point.r.width / 2 / Math.abs(ux),
        Math.abs(uy) < .001 ? Infinity : point.r.height / 2 / Math.abs(uy)
      );
      const from = edge(a), to = edge(b);
      const x1 = a.x + ux * from, y1 = a.y + uy * from;
      const x2 = b.x - ux * to, y2 = b.y - uy * to;
      if (Math.hypot(x2 - x1, y2 - y1) > .5) {
        d += `M ${x1} ${y1} L ${x2} ${y2} `;
        const mx = x1 + (x2 - x1) * .62, my = y1 + (y2 - y1) * .62;
        const back = 4.5, wing = 2.8, px = -uy, py = ux;
        arrows.push(`${mx + ux * 2},${my + uy * 2} ${mx - ux * back + px * wing},${my - uy * back + py * wing} ${mx - ux * back - px * wing},${my - uy * back - py * wing}`);
      }
    }
    return { d, arrows };
  }

  function paint() {
    live.replaceChildren();
    delete live.dataset.tiles;
    if (!board || !current.length) return;
    const points = current.map(index => {
      const r = board.cells[index].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
    });
    live.dataset.tiles = String(points.length);
    const gap = gapGeometry(points), serial = String(Date.now()) + Math.random().toString(36).slice(2);
    const mask = el('mask', { id: `be-contour-${serial}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: innerWidth, height: innerHeight });
    const tileSize = Math.max(...points.map(point => Math.max(point.r.width, point.r.height)));
    const outer = el('g', { fill: '#fff' }), inner = el('g', { fill: '#000' });
    points.forEach(point => {
      const pad = Math.max(5, tileSize * .1);
      outer.appendChild(el('rect', { x: point.r.left - pad, y: point.r.top - pad, width: point.r.width + pad * 2, height: point.r.height + pad * 2, rx: Math.max(5, tileSize * .13) }));
      inner.appendChild(el('rect', { x: point.r.left + 1, y: point.r.top + 1, width: point.r.width - 2, height: point.r.height - 2, rx: Math.max(2, tileSize * .045) }));
    });
    if (gap.d) {
      outer.appendChild(el('path', { d: gap.d, fill: 'none', stroke: '#fff', 'stroke-width': Math.max(14, tileSize * .28), 'stroke-linecap': 'square' }));
      inner.appendChild(el('path', { d: gap.d, fill: 'none', stroke: '#000', 'stroke-width': Math.max(6, tileSize * .12), 'stroke-linecap': 'round' }));
    }
    mask.appendChild(outer); mask.appendChild(inner);
    live.appendChild(mask);
    live.appendChild(el('rect', { class: 'be-contour', x: 0, y: 0, width: innerWidth, height: innerHeight, mask: `url(#be-contour-${serial})` }));
    if (gap.d) {
      live.appendChild(el('path', { class: 'be-gap-shadow', d: gap.d }));
      live.appendChild(el('path', { class: 'be-gap', d: gap.d }));
      live.appendChild(el('path', { class: 'be-gap-core', d: gap.d }));
      gap.arrows.forEach(points => {
        live.appendChild(el('polygon', { class: 'be-arrow-shadow', points }));
        live.appendChild(el('polygon', { class: 'be-arrow', points }));
      });
    }
  }

  function update(raw) {
    if (!enabled) { current = []; currentWord = ''; live.replaceChildren(); return; }
    const word = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
    currentWord = word;
    if (!word) { current = []; live.replaceChildren(); return; }
    board = readBoard() || board;
    const found = longestPaths(word);
    current = choosePath(found.paths, current, predictiveWeights(found.paths, found.word));
    paint();
  }

  function finish(raw, colour) {
    update(raw);
    if (current.length && live.childNodes.length) {
      const ghost = live.cloneNode(true);
      ghost.removeAttribute('class');
      ghost.setAttribute('class', `be-release ${['green', 'amber', 'red'].includes(colour) ? colour : 'green'}`);
      fx.appendChild(ghost);
      setTimeout(() => ghost.remove(), 1150);
    }
    current = []; currentWord = ''; live.replaceChildren(); pendingNative = false;
  }

  function looksLikeWordEntry(target) {
    return !!target && target === findEntry(document);
  }

  document.addEventListener('input', event => { if (looksLikeWordEntry(event.target)) update(event.target.value); }, true);
  document.addEventListener('focusin', event => { if (looksLikeWordEntry(event.target)) update(event.target.value); }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && looksLikeWordEntry(event.target)) { update(event.target.value); pendingNative = true; }
  }, true);

  const message = document.getElementById('sub_puzzle_message');
  if (message) new MutationObserver(() => {
    if (!pendingNative) return;
    const text = message.textContent || '';
    const colour = /already entered|duplicate/i.test(text) ? 'amber' : /last word added/i.test(text) ? 'green' : /too short|does not exist|not found|could not|error/i.test(text) ? 'red' : '';
    if (colour) finish(currentWord, colour);
  }).observe(message, { childList: true, subtree: true, characterData: true, attributes: true });

  const repaint = () => { if (current.length) paint(); };
  addEventListener('resize', repaint, { passive: true });
  addEventListener('scroll', repaint, { passive: true, capture: true });
  window.__babbleExpertGlow = {
    update,
    finish,
    getWord() { return currentWord; },
    setEnabled(value) {
      enabled = value !== false;
      svg.style.display = enabled ? '' : 'none';
      if (!enabled) { current = []; currentWord = ''; pendingNative = false; live.replaceChildren(); fx.replaceChildren(); }
    },
    setRemaining(words) {
      remainingWords = Array.isArray(words) ? [...new Set(words.map(word => String(word).toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean))] : [];
      routeCache.clear();
      if (currentWord) update(currentWord);
    },
    refresh() { board = readBoard(); routeCache.clear(); repaint(); },
    destroy() { svg.remove(); style.remove(); delete window.__babbleExpertGlow; }
  };
  return true;
}

function makeBabbleGlowScript(allowedHosts = ['playbabble.com', 'www.playbabble.com']) {
  return `(${installBabbleGlow.toString()})(${findGridPaths.toString()},${chooseGridPath.toString()},${JSON.stringify(allowedHosts)},${findBabbleWordEntry.toString()})`;
}

module.exports = { findGridPaths, chooseGridPath, makeBabbleGlowScript };
