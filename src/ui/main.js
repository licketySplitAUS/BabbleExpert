(() => {
'use strict';
const $ = s => document.querySelector(s);
let S = null;
let ST = { ready: false, puzzleId: '', remaining: null, cluesOk: false, busy: false, canSend: false };

/* ---- tell the main process where the two page boxes are, so it can lay the real browsers over them ---- */
let pending = false;
const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; };
function report() {
  if (pending) return; pending = true;
  requestAnimationFrame(() => {
    pending = false;
    be.layout({ clues: box($('#slotClues')), babble: box($('#slotBabble')), res: $('#resPane').hidden ? null : box($('#slotRes')) });
  });
}
const ro = new ResizeObserver(report);
['#main', '#slotClues', '#slotBabble', '#slotRes'].forEach(s => ro.observe($(s)));
addEventListener('resize', report);

/* ---- settings -> screen ---- */
function applySettings() {
  document.documentElement.style.setProperty('--accent', S.yellow ? '#ffff00' : '#ffcc01');
  $('#app').classList.toggle('switched', S.switchSides);
  $('#slotClues').style.width = S.cluesW + 'px';
  $('#resPane').style.width = S.resW + 'px';
  $('#btnGet').textContent = S.switchSides ? 'Send Words to Clues →' : '← Send Words to Clues';
  $('#btnSend').textContent = S.switchSides ? '← Send Words to Babble' : 'Send Words to Babble →';
  $('#btnAdd').textContent = S.add.visible ? "Hide 'Add'" : 'Lickety Add';
  $('#btnClueSource').textContent = S.clueSource === 'selfServe' ? 'Clues: Self Serve \u25be' : "Clues: Lickety's \u25be";
  $('#lblThin').hidden = !S.add.visible; $('#chbThin').checked = S.add.thin;
  document.querySelectorAll('[data-hint]').forEach(el => { if (S.hideHints) el.removeAttribute('title'); else el.title = el.dataset.hint; });
  renderState(); report();
}

/* ---- Babble / Clues state -> buttons and the status chip ---- */
function renderState() {
  $('#btnGet').disabled = $('#btnSend').disabled = !ST.canSend;
  $('#btnAdd').disabled = !((ST.ready && ST.puzzleId) || (S && S.add.visible));
  const chip = $('#chip');
  if (!ST.cluesOk) { chip.textContent = 'Clues page not ready'; chip.dataset.state = 'wait'; }
  else if (!ST.ready) { chip.textContent = 'Open a Babble puzzle to enable sending'; chip.dataset.state = 'wait'; }
  else { chip.textContent = 'Words left: ' + ST.remaining; chip.dataset.state = 'ok'; }
}

/* ---- splitters ---- */
function splitter(el, get, set, dir, min = 150) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    const x0 = e.clientX, w0 = get();
    const move = ev => { set(Math.max(min, w0 + dir() * (ev.clientX - x0))); report(); };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); save(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  });
}
let wantClues = 0, wantRes = 0;
const save = () => be.setSettings({ cluesW: wantClues || S.cluesW, resW: wantRes || S.resW });
splitter($('#spl1'), () => $('#slotClues').offsetWidth, w => { wantClues = Math.round(w); $('#slotClues').style.width = wantClues + 'px'; }, () => (S.switchSides ? -1 : 1));
splitter($('#spl2'), () => $('#resPane').offsetWidth, w => { wantRes = Math.round(w); $('#resPane').style.width = wantRes + 'px'; }, () => -1, 80);

/* ---- buttons ---- */
const act = n => () => be.action(n);
$('#btnRefresh').onclick = act('refreshBabble');
$('#btnClues').onclick = act('reloadClues');
$('#btnGet').onclick = act('get');
$('#btnSend').onclick = act('send');
$('#btnAdd').onclick = act('toggleAdd');
$('#chbThin').onchange = e => be.setSettings({ add: { thin: e.target.checked } });
$('#resClose').onclick = act('hideResources');
$('#resOpen').onclick = act('openResourceExternal');
const menu = name => e => { const r = e.currentTarget.getBoundingClientRect(); be.menu(name, r.left, r.bottom); };
$('#btnClueSource').onclick = menu('clues');
$('#btnRes').onclick = menu('resources');
$('#btnOpt').onclick = menu('options');

/* ---- events from the main process ---- */
be.onSettings(s => { S = s; wantClues = wantRes = 0; applySettings(); });
be.onState(s => { ST = s; renderState(); });
be.onStatus(t => { $('#lblWord').textContent = t; });
be.onProgress(p => { $('#prgAdd').max = p.max; $('#prgAdd').value = p.value; });
be.onResources(r => {
  $('#resPane').hidden = !r.open; $('#spl2').hidden = !r.open;
  if (r.open) { $('#resTitle').textContent = r.title; $('#resTitle').hidden = !r.showTitle; $('#resOpen').hidden = !r.external; }
  report();
});

(async () => { S = await be.getSettings(); ST = await be.getState(); applySettings(); })();
})();
