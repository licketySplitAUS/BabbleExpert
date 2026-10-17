(() => {
'use strict';
const $ = s => document.querySelector(s);
const ta = $('#mmoAdd');
let S = null, lastWord = '', nextWord = '', flashT = null;
const COLORS = { green: '#97cc32', amber: '#ffcc01', red: '#970000', chat: '#6797ac' };

/* ---- the coloured flash: how you know what happened to what you typed ---- */
const dark = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255 < .5; };
function resetFlash() { ta.style.background = ''; ta.style.color = ''; }
function flash(name) {
  const c = COLORS[name]; if (!c) return;
  ta.style.background = c; ta.style.color = dark(c) ? '#fff' : '';
  clearTimeout(flashT);
  const ms = S.add.speed * 300;                  // speed 0 = no visible flash, like the Delphi timer interval 0
  if (ms === 0) resetFlash(); else flashT = setTimeout(resetFlash, ms);
}

/* ---- a single word uses the chosen size; chat text is a little smaller ---- */
function updateFont() {
  const pt = parseInt(S.add.fontSize, 10), t = ta.value.trim();
  const single = S.add.noChat || !/\s/.test(t);
  ta.style.fontSize = (single ? pt : (pt === 10 ? 10 : 13)) * 4 / 3 + 'px';
}
function applySettings() {
  document.documentElement.style.setProperty('--accent', S.yellow ? '#ffff00' : '#ffcc01');
  document.body.classList.toggle('thin', S.add.thin);
  $('#cbbFont').value = S.add.fontSize; $('#trkSpeed').value = S.add.speed;
  $('#chbNoChat').checked = S.add.noChat; $('#chbDontClear').checked = S.add.dontClear;
  document.querySelectorAll('[title]').forEach(() => {});
  updateFont();
}

/* ---- Enter / Shift+Enter / Ctrl+Enter / Up / Down ---- */
ta.addEventListener('keydown', async e => {
  if (e.key === 'Enter') {
    if (e.shiftKey) return;                                    // new line
    e.preventDefault();
    const ctrl = e.ctrlKey || e.metaKey, text = ta.value;
    const c = be.classify(text, ctrl);
    if (c.kind === 'none') return;
    lastWord = c.kind === 'word' ? c.word : text.trim();       // one level of Up-arrow history, as in Delphi
    nextWord = '';
    ta.value = c.kind === 'word' && !c.clear ? c.keep : '';
    updateFont();
    const r = await be.submit(text, ctrl);
    if (r && r.color) { flash(r.color); if (c.kind === 'word') be.finish(c.word, r.color); }
  } else if (e.key === 'ArrowUp' && !ta.value.includes('\n')) {
    e.preventDefault(); nextWord = ta.value; ta.value = lastWord; ta.setSelectionRange(1e6, 1e6); updateFont();
  } else if (e.key === 'ArrowDown' && !ta.value.includes('\n')) {
    e.preventDefault(); if (nextWord) { ta.value = nextWord; ta.setSelectionRange(1e6, 1e6); updateFont(); }
  }
});
ta.addEventListener('input', () => { updateFont(); be.preview(ta.value); });

/* ---- controls ---- */
$('#addClose').onclick = () => be.close();
$('#cbbFont').onchange = e => be.setSettings({ add: { fontSize: e.target.value } });
$('#trkSpeed').oninput = e => be.setSettings({ add: { speed: +e.target.value } });
$('#chbNoChat').onchange = e => be.setSettings({ add: { noChat: e.target.checked } });
$('#chbDontClear').onchange = e => be.setSettings({ add: { dontClear: e.target.checked } });

be.onSettings(s => { S = s; applySettings(); });
be.onState(st => { $('#lblRemaining').textContent = st.remaining == null ? '' : st.remaining; });
be.onFocus(() => { ta.focus(); });
be.onResourceSubmit(({ word, result }) => {
  const c = be.classify(word, false);
  lastWord = word; nextWord = '';
  ta.value = c.kind === 'word' && !c.clear ? c.keep : '';
  updateFont();
  if (result && result.color) flash(result.color); // the main process releases the grid path for resource clicks
});
(async () => { S = await be.getSettings(); applySettings(); const st = await be.getState(); if (st && st.remaining != null) $('#lblRemaining').textContent = st.remaining; ta.focus(); })();
})();
