(() => {
'use strict';
const { lowerBound, prefixIndex, clueIndex, visibleRange } = window.BabbleWordIndex;
const input = document.querySelector('.find'), list = document.querySelector('.words'), notice = document.getElementById('notice');
const ROW = 16, TOP = 26;
let words = [], marked = -1, centred = -1, frame = 0, first = -1, last = -1;
const results = new Map(), rows = new Map();
let keyboardUntil = 0, resumeFrom = null, needsResumeBaseline = false, nativeScroll = false;
let hoverSpeed = 0, hoverDirection = 0, hoverSince = 0, hoverFrame = 0, previousFrame = 0;
function paint(row, index) {
  const word = words[index], result = results.get(word);
  row.textContent = word; row.dataset.index = String(index); row.className = 'w' + (index === marked ? ' found' : '');
  row.style.top = `${index * ROW}px`;
  if (result) { row.dataset.beResult = result.color; row.title = result.message; }
  else { delete row.dataset.beResult; row.removeAttribute('title'); }
}
function render(force = false) {
  frame = 0;
  const { start, end } = visibleRange(words.length, scrollY, innerHeight);
  if (!force && start === first && end === last) return;
  const spare = [];
  for (const [index, row] of rows) if (index < start || index >= end) { rows.delete(index); spare.push(row); }
  for (let index = start; index < end; index++) {
    let row = rows.get(index);
    if (!row) { row = spare.pop() || document.createElement('div'); paint(row, index); rows.set(index, row); if (!row.parentElement) list.appendChild(row); }
    else if (force) paint(row, index);
  }
  for (const row of spare) row.remove();
  first = start; last = end;
}
function requestRender() { if (!frame) frame = requestAnimationFrame(() => render()); }
function stopHover() { hoverSpeed = 0; hoverDirection = 0; cancelAnimationFrame(hoverFrame); hoverFrame = 0; }
function pauseMouse() { stopHover(); keyboardUntil = performance.now() + 1400; needsResumeBaseline = true; }
function centre(index) {
  if (index < 0 || index >= words.length) return;
  centred = index;
  scrollTo(0, TOP + index * ROW + ROW / 2 - (TOP + innerHeight) / 2);
  render(true);
}
function select(index) { marked = index; if (index >= 0) centre(index); else render(true); }
function setSearch(index, fallback = '') { input.value = index >= 0 ? words[index] : fallback; pauseMouse(); select(index); return index >= 0 ? words[index] : ''; }
function finishWord({ word, color, message }) {
  if (!['red', 'green', 'amber'].includes(color)) return;
  word = String(word || '').toLowerCase();
  const index = lowerBound(words, word);
  if (words[index] !== word) return;
  const title = message || ({ red: 'Not accepted by Babble', green: 'Added to Babble', amber: 'Already found or not yet confirmed by Babble' })[color];
  if (results.get(word)?.color === color && results.get(word)?.message === title) return;
  results.set(word, { color, message: title });
  if (rows.has(index)) paint(rows.get(index), index);
}
list.addEventListener('click', event => {
  const row = event.target.closest('.w');
  if (!row) return;
  const index = Number(row.dataset.index), word = words[index];
  if (!word) return;
  const previous = marked; marked = -1;
  if (previous !== index && rows.has(previous)) paint(rows.get(previous), previous);
  results.set(word, { color: 'pending', message: 'Checking with Babble…' }); paint(row, index);
  location.replace('#' + new URLSearchParams({ submit: word, nonce: performance.now() }));
});
input.addEventListener('input', () => { pauseMouse(); select(prefixIndex(words, input.value)); });
document.addEventListener('keydown', event => {
  const editing = event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
  if (!editing && ['n', 'p'].includes(event.key?.toLowerCase()) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
    event.preventDefault(); if (!event.repeat) step(event.key.toLowerCase() === 'p' ? -1 : 1); return;
  }
  if (event.key === 'Escape') { nativeScroll = false; stopHover(); }
  if (event.target === input && event.key === 'Enter') { event.preventDefault(); if (marked >= 0) { centre(marked); rows.get(marked)?.click(); } }
}, true);
function step(direction = 1) { pauseMouse(); document.activeElement?.blur?.(); location.replace('#' + new URLSearchParams({ [direction < 0 ? 'previous' : 'next']: 'clue', nonce: performance.now() })); }
document.addEventListener('contextmenu', event => { if (!event.shiftKey && !event.target.closest('input,textarea,select,[contenteditable]')) { event.preventDefault(); step(); } }, true);
function glide(now) {
  hoverFrame = 0;
  if (!hoverSpeed || nativeScroll || document.hidden) return;
  const elapsed = Math.min(now - previousFrame, 50) / 1000; previousFrame = now;
  if (now - hoverSince >= 300) scrollBy(0, hoverSpeed * elapsed);
  hoverFrame = requestAnimationFrame(glide);
}
document.addEventListener('mousemove', event => {
  const pointer = { x: event.clientX, y: event.clientY };
  if (nativeScroll || event.buttons) { stopHover(); return; }
  if (performance.now() < keyboardUntil) { stopHover(); resumeFrom = pointer; return; }
  if (needsResumeBaseline) { needsResumeBaseline = false; resumeFrom = pointer; return; }
  if (resumeFrom) { if (Math.hypot(pointer.x - resumeFrom.x, pointer.y - resumeFrom.y) < 18) return; resumeFrom = null; keyboardUntil = 0; }
  const top = TOP + 28, zone = Math.min(120, (innerHeight - top) * .18);
  let speed = 0;
  if (pointer.y >= top && pointer.y < top + zone) speed = -140 * Math.pow((top + zone - pointer.y) / zone, 2);
  else if (pointer.y > innerHeight - zone) speed = 140 * Math.pow(Math.min(1, (pointer.y - innerHeight + zone) / zone), 2);
  const direction = Math.sign(speed);
  if (direction !== hoverDirection) hoverSince = performance.now();
  hoverDirection = direction; hoverSpeed = speed;
  if (!speed) stopHover(); else if (!hoverFrame) { previousFrame = performance.now(); hoverFrame = requestAnimationFrame(glide); }
});
addEventListener('scroll', requestRender, { passive: true });
addEventListener('resize', () => { if (centred >= 0 && performance.now() < keyboardUntil) centre(centred); else render(true); });
document.addEventListener('mouseleave', stopHover);
document.addEventListener('wheel', stopHover, { passive: true });
document.addEventListener('mousedown', event => { stopHover(); nativeScroll = event.button === 1 ? !nativeScroll : false; }, true);
addEventListener('blur', () => { nativeScroll = false; stopHover(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { nativeScroll = false; stopHover(); } });
window.BabbleWordList = {
  start(data) {
    words = data.words; results.clear(); marked = centred = -1; first = last = -1;
    for (const row of rows.values()) row.remove(); rows.clear();
    list.style.height = `${words.length * ROW}px`;
    notice.className = ''; notice.hidden = !data.stale; notice.textContent = data.stale ? 'Using saved words.' : '';
    document.title = `${data.length} Letter Words`; render(true);
    window.__babbleExpertWordList = {
      count: words.length, finishWord,
      restoreResults(items, reset = false) { if (reset) { results.clear(); render(true); } for (const item of items) finishWord(item); },
      centreClue(context) { return setSearch(clueIndex(words, context), context.prefix); },
      centrePrefix(raw) { return setSearch(prefixIndex(words, raw, true)); },
      middleWord() { return words[Math.max(0, Math.min(words.length - 1, Math.round((scrollY + (TOP + innerHeight) / 2 - TOP - ROW / 2) / ROW)))] || ''; },
      // Diagnostic counts help performance checks without exposing all rows.
      metrics() { return { count: words.length, rendered: rows.size, first, last }; }
    };
    return true;
  },
  fail() { notice.hidden = false; notice.className = 'error'; notice.textContent = 'Could not load the words. Check your connection, then choose Retry.'; }
};
})();
