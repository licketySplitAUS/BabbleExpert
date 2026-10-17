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
  const health = ST.paneHealth || {};
  const babbleProblem = health.babble && health.babble !== 'ready' ? health.babble : ST.babbleConnection;
  const labels = { login: 'Sign in to Babble', loading: 'Babble loading…', integration: 'Babble integration unavailable', failed: 'Babble could not load', crashed: 'Babble stopped responding', unresponsive: 'Babble not responding', unavailable: 'Babble disconnected' };
  chip.textContent = ST.ready && (!health.babble || health.babble === 'ready')
    ? `Words left: ${ST.remaining}`
    : labels[babbleProblem] || 'Open a Babble puzzle to enable sending';
  chip.dataset.state = ST.ready && health.babble === 'ready' ? 'ok' : 'wait';
  chip.title = `Babble puzzle ${ST.puzzleId || 'not loaded'}${ST.puzzleDate ? ' · ' + ST.puzzleDate : ''}`;
  const clues = $('#clueChip'), source = S?.clueSource === 'selfServe' ? 'Self Serve' : 'Lickety’s';
  clues.textContent = !ST.cluesOk || (health.clues && health.clues !== 'ready') ? `${source}: ${health.clues === 'loading' ? 'loading…' : 'Clues unavailable'}`
    : ST.puzzleMatch === false ? `${source}: grid differs` : `${source}: grid not confirmed`;
  clues.hidden = ST.cluesOk && ST.puzzleMatch === true;
  clues.title = clues.hidden ? 'Clues grid letters match Babble' : clues.textContent;
  clues.dataset.state = ST.cluesOk && ST.puzzleMatch === true ? 'ok' : 'wait';
  const babbleBad = !ST.ready && babbleProblem !== 'loading';
  const cluesBad = !ST.cluesOk && health.clues !== 'loading';
  const mismatch = ST.puzzleMatch !== true && ST.cluesOk;
  $('#recovery').hidden = !(babbleBad || cluesBad || mismatch);
  $('#recoveryMessage').textContent = ST.puzzleMatch === false ? 'Bulk transfer paused until both panes show the same puzzle.'
    : mismatch ? 'Bulk transfer paused until the Clues puzzle can be confirmed.'
    : babbleProblem === 'login' ? 'Sign in using the Babble pane. A browser login is separate from Expert.' : 'Retry the affected page, or open it in your browser. Entries remain in Recent entries.';
  $('#retryBabble').hidden = $('#openBabble').hidden = !babbleBad;
  $('#retryClues').hidden = $('#openClues').hidden = !(cluesBad || mismatch);
  $('#resRetry').hidden = health.resources !== 'failed' && health.resources !== 'crashed' && health.resources !== 'unresponsive';
}

let latestUpdate = {}, feedbackSequence, feedbackExpired = false, feedbackTimer;
let launchNoticeSeen = false, launchNotice = null;
function renderUpdate(update = {}) {
  latestUpdate = update;
  if (!launchNoticeSeen && update.launchNotice) {
    launchNoticeSeen = true;
    launchNotice = update.launchNotice;
    setTimeout(() => { launchNotice = null; renderUpdate(latestUpdate); }, 20000);
  }
  if (feedbackSequence !== update.sequence) {
    feedbackSequence = update.sequence;
    feedbackExpired = false;
    clearTimeout(feedbackTimer);
    if (update.manual && ['current', 'error'].includes(update.phase)) {
      feedbackTimer = setTimeout(() => { feedbackExpired = true; renderUpdate(latestUpdate); }, 15000);
    }
  }
  const labels = { checking: 'Checking for updates…', current: `You’re up to date — ${update.currentVersion || ''}`, downloading: `Downloading update${Number.isFinite(update.percent) ? ` — ${update.percent}%` : '…'}`, ready: `Update ${update.version || ''} ready`, installing: 'Installer starting — please wait for Expert to reopen', available: `Update ${update.version || ''} available`, error: update.message || 'Could not check for updates. Try again.' };
  const persistent = ['downloading', 'ready', 'available', 'installing'].includes(update.phase);
  const manual = update.manual && !feedbackExpired && ['checking', 'current', 'error'].includes(update.phase);
  const notice = launchNotice ? (launchNotice.updated ? `Updated successfully to ${launchNotice.version}` : `Babble Expert ${launchNotice.version} is running`) : '';
  const message = persistent || manual ? (update.message || labels[update.phase]) : notice;
  $('#updateStatus').textContent = message || '';
  $('#updateStatus').hidden = !message;
  $('#updateStatus').title = update.phase === 'ready'
    ? (update.message || 'Install and restart shows installer progress, then reopens Expert. Closing Expert installs silently without reopening; allow installation to finish before using the unchanged desktop shortcut.')
    : message || '';
  $('#btnInstallUpdate').hidden = update.phase !== 'ready';
  $('#btnDownloadUpdate').hidden = update.phase !== 'available';
  $('#btnReleaseNotes').hidden = !['ready', 'available'].includes(update.phase);
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
$('#resRetry').onclick = act('retryResource');
$('#retryBabble').onclick = act('refreshBabble'); $('#openBabble').onclick = act('openBabble');
$('#retryClues').onclick = act('reloadClues'); $('#openClues').onclick = act('openClues');
$('#btnInstallUpdate').onclick = act('installUpdate');
$('#btnDownloadUpdate').onclick = act('downloadUpdate');
$('#btnReleaseNotes').onclick = act('releaseNotes');
$('#btnHistory').onclick = act('showHistory');
$('#btnHelp').onclick = act('showHelp');
const menu = name => e => { const r = e.currentTarget.getBoundingClientRect(); be.menu(name, r.left, r.bottom); };
$('#btnClueSource').onclick = menu('clues');
$('#btnRes').onclick = menu('resources');
$('#btnOpt').onclick = menu('options');

/* ---- events from the main process ---- */
be.onSettings(s => { S = s; wantClues = wantRes = 0; applySettings(); });
be.onState(s => { ST = s; renderState(); renderUpdate(s.update); });
be.onUpdate(renderUpdate);
be.onStatus(t => { $('#lblWord').textContent = t; $('#lblWord').title = t; });
be.onProgress(p => { $('#prgAdd').max = p.max; $('#prgAdd').value = p.value; $('#prgAdd').hidden = p.value === 0 && p.max === 1; });
be.onResources(r => {
  $('#resPane').hidden = !r.open; $('#spl2').hidden = !r.open;
  if (r.open) { $('#resTitle').textContent = r.title; $('#resTitle').hidden = !r.showTitle; $('#resOpen').hidden = !r.external; }
  report();
});

(async () => { S = await be.getSettings(); ST = await be.getState(); applySettings(); $('#lblWord').textContent = ST.lastStatus || ''; $('#lblWord').title = ST.lastStatus || ''; renderUpdate(ST.update); })();
})();
