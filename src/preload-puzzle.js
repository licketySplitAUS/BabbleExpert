'use strict';
// A deliberately narrow bridge: the remote page never receives access to IPC.
const { ipcRenderer } = require('electron');
let clicks = [];
let createClues = false;
ipcRenderer.on('create-clues:enabled', (_event, value) => { createClues = value === true; });
ipcRenderer.invoke('create-clues:enabled').then(value => { createClues = value === true; }).catch(() => {});

// Observe DOM input events rather than sampling before a native key reaches the page.
// This also covers paste, individual clue answers, and the page's clickable tiles.
function clueEntry(target) {
  return target && /^(INPUT|TEXTAREA)$/.test(target.tagName) &&
    (target.id === 'add-word' || target.name === 'addWord' ||
      /^edt\d+$/.test(target.name || '') || target.classList.contains('answer'));
}
function previewEntry(target) {
  if (clueEntry(target)) ipcRenderer.send('clues:entry', 'preview', String(target.value || ''));
}
// Track actual tiles, not just letters: equal letters on different tiles still append.
let tileTrail = [];
document.addEventListener('click', event => {
  const tile = event.target.closest && event.target.closest('img[onclick], .board button');
  const entry = tile && document.querySelector('[name="addWord"], #add-word');
  if (!entry) return;
  const label = tile.getAttribute('onclick') || tile.getAttribute('aria-label') || '';
  const match = label.match(/addLetter\s*\(\s*['"]([a-z]+)['"]/i) || label.match(/^Add\s+([a-z]+)$/i);
  if (!match) return;
  const letter = match[1].toLowerCase(), before = String(entry.value || '');
  let last = tileTrail[tileTrail.length - 1];
  if (last && (last.entry !== entry || last.after !== before.toLowerCase())) { tileTrail = []; last = null; }
  if (last && last.tile === tile) {
    event.preventDefault();
    event.stopImmediatePropagation();
    tileTrail.pop();
    // Use the native setter so React's controlled Self Serve input also sees
    // the input event. Legacy Clues uses the same standard input behaviour.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(entry, last.before);
    entry.focus();
    entry.setSelectionRange(entry.value.length, entry.value.length);
    entry.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    tileTrail.push({ tile, entry, before, after: (before + letter).toLowerCase() });
  }
}, true);

document.addEventListener('input', event => previewEntry(event.target), true);
document.addEventListener('focusin', event => previewEntry(event.target), true);
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && clueEntry(event.target))
    ipcRenderer.send('clues:entry', 'submit', String(event.target.value || ''));
}, true);
document.addEventListener('click', event => {
  const target = event.target;
  const row = target.closest && target.closest('tr');
  const answer = row && row.querySelector('input.answer, input[name^="edt"]');
  const check = row && row.querySelector('input[type="checkbox"]');
  const word = answer && String((check?.checked && answer.getAttribute('data-answer-word')) || answer.value || '').trim().toLowerCase();
  // The checkbox keeps its normal found/unfound action. Clicking a solved
  // answer or another part of its row opens Create Clues when enabled.
  if (createClues && event.button === 0 && answer && check?.checked && target !== check && /^[a-z]{4,25}$/.test(word)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    ipcRenderer.send('create-clues:word', { word, x: event.clientX, y: event.clientY });
    return;
  }
  if (clueEntry(target) && (/^edt\d+$/.test(target.name || '') || target.classList.contains('answer'))) {
    ipcRenderer.send('clues:lookup', { name: target.name || '', answerKey: target.getAttribute('data-answer-word') || '' });
  }
  // Automatic puzzle matching calls .click(); report only a person's activation.
  if (event.isTrusted && event.target.closest && event.target.closest('button.grabgrid:not(:disabled)'))
    ipcRenderer.send('clues:grab-grid');
  // Legacy addLetter() assigns .value without emitting input or focusing the field.
  const tile = event.target.closest && event.target.closest('img[onclick], .board button');
  setTimeout(() => previewEntry(tile ? document.querySelector('[name="addWord"], #add-word') : document.activeElement), 0);
}, true);

document.addEventListener('click', event => {
  const image = event.target && event.target.closest && event.target.closest('img');
  if (!image) return;
  let pathname;
  try { pathname = new URL(image.currentSrc || image.src, location.href).pathname; } catch { return; }
  // The original Clues pages have used both MyLogo.gif and MyLogo.jpg.
  if (!/\/MyLogo(?:-full)?\.(?:gif|jpe?g|png|webp)$/i.test(pathname)) return;
  event.preventDefault(); // Keep the linked full-size image from interrupting the five clicks.
  const now = performance.now();
  clicks = clicks.filter(time => now - time <= 1000);
  clicks.push(now);
  if (clicks.length >= 5) {
    clicks = [];
    ipcRenderer.send('celebration:preview');
  }
}, true);
