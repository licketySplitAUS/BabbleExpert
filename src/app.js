'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, shell, screen } = require('electron');
const { Engine, classify } = require('./engine');
const { makePages } = require('./pages');
const { Settings } = require('./settings');
const { resourcesTemplate, cluesTemplate, optionsTemplate } = require('./menus');
const { makeBabbleGlowScript } = require('./babble-glow');
const { makeFireworksOverlayScript, stopFireworksOverlayScript } = require('./fireworks-overlay');
const { createTelemetry } = require('./telemetry');
const { recordLaunchVersion } = require('./updates');
const { makeAnonymousId } = require('./anonymous-id');
const RESOURCES = require('./resources');

const TELEMETRY_CONSENT_VERSION = 2;

const DEFAULTS = {
  urls: {
    babble: 'https://playbabble.com',
    clues: 'https://r46.me/babbleclues.html',
    selfServeClues: 'https://selfserve.r46.me/'
  },
  hosts: {
    babble: ['playbabble.com', 'www.playbabble.com'],
    clues: ['r46.me', 'www.r46.me', 'selfserve.r46.me']
  }
};
const isHttp = u => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
const hostOf = u => { try { return new URL(u).hostname; } catch { return ''; } };
const isReloadKey = i => i.type === 'keyDown' && (i.key.toLowerCase() === 'f5' || ((i.control || i.meta) && i.key.toLowerCase() === 'r'));
const rectOk = r => r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;

function createApp(opts) {
  const urls = { ...DEFAULTS.urls, ...(opts.urls || {}) };
  const hosts = { ...DEFAULTS.hosts, ...(opts.hosts || {}) };
  const title = opts.title || 'Babble Expert from licketySplitAUS';
  const cheat = !!opts.cheat;
  const settings = new Settings(path.join(opts.userDataDir, 'settings.json'));
  if (!settings.data.anonymousId) { settings.patch({ anonymousId: makeAnonymousId() }); settings.flush(); }
  const version = String(opts.version || '0.0.0');
  const sessionStartedAt = Date.now();
  const telemetryEndpoint = opts.telemetryEndpoint === undefined ? 'https://selfserve.r46.me/api/babble-notify' : opts.telemetryEndpoint;
  const telemetry = createTelemetry({
    endpoint: telemetryEndpoint,
    enabled: () => settings.data.usageSharing === true,
    version,
    anonymousId: settings.data.anonymousId,
    fetchImpl: opts.telemetryFetch || globalThis.fetch
  });
  const clueSources = {
    lickety: { label: "Lickety's Clues", url: urls.clues },
    selfServe: { label: 'Self Serve Clues', url: urls.selfServeClues }
  };
  const currentClueSource = () => clueSources[settings.data.clueSource] || clueSources.lickety;
  let engine = null, notifyState = () => {}, lastStatus = '', updateActions = {};
  const launchNotice = app.isPackaged ? recordLaunchVersion(settings, version) : null;
  let updateSequence = 0;
  let updateState = { phase: app.isPackaged ? 'idle' : 'development', launchNotice, sequence: updateSequence };
  const paneHealth = { babble: 'loading', clues: 'loading', resources: 'ready' };
  function setPaneHealth(name, health) {
    paneHealth[name] = health;
    if (engine && health !== 'ready') engine._set(name === 'babble' ? { ready: false, babbleConnection: health }
      : name === 'clues' ? { cluesOk: false, cluesConnection: health, puzzleMatch: null } : {});
    notifyState();
  }
  let quitting = false, finalizingClose = false, lastRects = null, addWin = null, historyWin = null, helpWin = null, restoredAdd = false, currentRes = null;
  app.on('before-quit', event => {
    if (!quitting && !finalizingClose && settings.data.usageSharing === true) { event.preventDefault(); finishSessionAndQuit(); }
    else quitting = true;
  });

  /* ---------- main window ---------- */
  const saved = settings.data.window;
  const visibleSaved = saved && screen.getAllDisplays().some(d => {
    const b = d.workArea; return saved.x != null && saved.x + 50 < b.x + b.width && saved.x + saved.width - 50 > b.x && saved.y >= b.y - 10 && saved.y < b.y + b.height - 50;
  });
  const win = new BrowserWindow({
    title, width: (saved && saved.width) || 1280, height: (saved && saved.height) || 800,
    ...(visibleSaved ? { x: saved.x, y: saved.y } : {}),
    minWidth: 760, minHeight: 420, show: false, backgroundColor: '#f0f0f0',
    webPreferences: { preload: path.join(__dirname, 'preload-main.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  // Keep the WebContents reference: reading win.webContents after the BrowserWindow has
  // been destroyed throws, while late renderer IPC can still be delivered during teardown.
  const mainWc = win.webContents;
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', e => e.preventDefault());
  if (!saved || saved.maximized) win.maximize();
  win.once('ready-to-show', () => { win.show(); maybePromptTelemetry(); });
  function saveWindowSettings() {
    const b = win.getNormalBounds();
    settings.setWindow({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() });
    settings.flush();
  }
  win.on('close', event => {
    saveWindowSettings();
    if (!quitting && !finalizingClose && settings.data.usageSharing === true) {
      event.preventDefault();
      finishSessionAndQuit();
    }
  });
  win.on('closed', () => { clearInterval(timer); clearInterval(hintTimer); app.quit(); });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWc.setVisualZoomLevelLimits(1, 1);

  /* ---------- the two web pages (+ optional resources pane) ---------- */
  function finishSessionAndQuit() {
    if (finalizingClose) return;
    finalizingClose = true;
    const durationSeconds = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 1000));
    const deadline = new Promise(resolve => setTimeout(resolve, 1500));
    Promise.race([telemetry.send('session', { durationSeconds }), deadline]).finally(() => {
      quitting = true;
      if (!win.isDestroyed()) win.destroy();
      app.quit();
    });
  }
  async function prepareForUpdate() {
    await engine?.whenIdle();
    saveWindowSettings();
    if (settings.data.usageSharing === true && !finalizingClose) {
      finalizingClose = true;
      const durationSeconds = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 1000));
      await Promise.race([
        telemetry.send('session', { durationSeconds }),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    }
    // The updater must be allowed to close every window, including Lickety Add.
    quitting = true;
  }

  const mkView = (partition, extra = {}) => new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, ...extra } });
  const cluesView = mkView('persist:babble', { preload: path.join(__dirname, 'preload-puzzle.js') }); // same cookie jar as Babble: logins stick
  const babbleView = mkView('persist:babble');
  const resView = mkView('persist:resources', { autoplayPolicy: 'no-user-gesture-required' });
  for (const v of [cluesView, babbleView, resView]) { win.contentView.addChildView(v); v.setVisible(false); }

  function guard(wc, sameSiteHosts, name) {
    wc.on('did-start-loading', () => { if (!wc.getURL().startsWith('data:')) setPaneHealth(name, 'loading'); });
    wc.on('did-stop-loading', () => { if (isHttp(wc.getURL()) || wc.getURL().startsWith('file:')) setPaneHealth(name, 'ready'); });
    wc.on('render-process-gone', () => setPaneHealth(name, 'crashed'));
    wc.on('unresponsive', () => setPaneHealth(name, 'unresponsive'));
    wc.on('responsive', () => setPaneHealth(name, 'ready'));
    wc.setWindowOpenHandler(({ url }) => {
      if (isHttp(url)) { if (sameSiteHosts && sameSiteHosts.includes(hostOf(url))) wc.loadURL(url); else shell.openExternal(url); }
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => { if (!isHttp(url)) e.preventDefault(); });
    wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 || wc.isDestroyed()) return;       // -3 = cancelled by a newer navigation
      setPaneHealth(name, 'failed');
      const msg = `<body style="font:14px sans-serif;padding:24px"><h3>Couldn't load this page</h3><p>${desc.replace(/[<&]/g, '')}</p><p>Check your connection, then press Refresh.</p></body>`;
      wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(msg));
    });
  }
  guard(babbleView.webContents, hosts.babble, 'babble'); guard(cluesView.webContents, hosts.clues, 'clues'); guard(resView.webContents, null, 'resources');
  const experiments = {
    funWordPlay: { label: 'Fun Word Play', title: 'Fun Word Play', url: pathToFileURL(path.join(__dirname, 'experiments', 'fun-word-play.html')).href, minWidth: 480, external: false, interactive: true, telemetryEvent: 'option' },
    chillVibes: { label: 'Chill Vibes', title: 'Chill Vibes', url: pathToFileURL(path.join(__dirname, 'experiments', 'chill-vibes.html')).href, minWidth: 480, external: false, interactive: true, telemetryEvent: 'option' },
    fireworks: { label: 'Fireworks', title: 'Fireworks', url: pathToFileURL(path.join(__dirname, 'experiments', 'fireworks.html')).href, minWidth: 500, external: false, showTitle: false, telemetryEvent: false }
  };
  function sendResourceInteraction(payload) {
    if (!currentRes || !currentRes.interactive || resView.webContents.isDestroyed() || resView.webContents.isLoading()) return;
    let actual, expected;
    try { actual = new URL(resView.webContents.getURL()); expected = new URL(currentRes.url); } catch { return; }
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) return;
    resView.webContents.executeJavaScript(`(function(){var f=window.BabbleExpertInteract;if(typeof f==='function')f(${JSON.stringify(payload)});})()`, false).catch(() => {});
  }
  const relayKey = input => {
    if (input && input.type === 'keyDown' && !input.isAutoRepeat) sendResourceInteraction({ type: 'key', key: input.key, code: input.code, shift: !!input.shift, ctrl: !!(input.control || input.meta) });
  };
  const helpKey = (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F1') return;
    event.preventDefault();
    if (!input.isAutoRepeat) showHelp();
  };
  for (const wc of [mainWc, babbleView.webContents, cluesView.webContents, resView.webContents]) wc.on('before-input-event', helpKey);
  mainWc.on('before-input-event', (_event, input) => relayKey(input));

  const loadPage = (wc, url) => wc.loadURL(url).catch(() => {}); // load failures have their own recovery state
  const refreshBabble = () => loadPage(babbleView.webContents, urls.babble);
  let clueReloadSnapshot = null;
  async function reloadClues() {
    // Self Serve persists its own words. Preserve the original page's checked
    // words too, but only restore them if the reloaded puzzle is the same one.
    clueReloadSnapshot = null;
    try { clueReloadSnapshot = await pages.clues.reloadSnapshot(); } catch { /* page may be unavailable */ }
    return loadPage(cluesView.webContents, currentClueSource().url);
  }
  function selectClueSource(source) {
    if (!clueSources[source] || source === settings.data.clueSource) return;
    patch({ clueSource: source });
    loadPage(cluesView.webContents, clueSources[source].url);
    engine.status(`Switched to ${clueSources[source].label}`);
  }
  // F5 / Ctrl+R / Cmd+R use the same refresh actions as the toolbar.
  babbleView.webContents.on('before-input-event', (e, i) => { if (isReloadKey(i)) { e.preventDefault(); refreshBabble(); } });
  cluesView.webContents.on('before-input-event', (e, i) => { if (isReloadKey(i)) { e.preventDefault(); reloadClues(); } });
  /* ---------- the brain ---------- */
  const pages = makePages({ getBabble: () => babbleView.webContents, getClues: () => cluesView.webContents, babbleHosts: hosts.babble, cluesHosts: hosts.clues });
  const fireworksScripts = { babble: makeFireworksOverlayScript(hosts.babble), clues: makeFireworksOverlayScript(hosts.clues) };
  const stopCelebrationOverlays = () => {
    pages.babble.fireworks(stopFireworksOverlayScript).catch(() => {});
    pages.clues.fireworks(stopFireworksOverlayScript).catch(() => {});
  };
  // The packaged celebration announces each start/replay through its own URL.
  // Only that exact local file can trigger the transparent, silent overlays.
  resView.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (!isMainFrame || currentRes !== experiments.fireworks) return;
    let actual, expected;
    try { actual = new URL(url); expected = new URL(experiments.fireworks.url); } catch { return; }
    if (actual.protocol !== 'file:' || actual.pathname !== expected.pathname || !actual.hash.startsWith('#fireworks=')) return;
    pages.babble.fireworks(fireworksScripts.babble).catch(() => {});
    pages.clues.fireworks(fireworksScripts.clues).catch(() => {});
  });
  const glowScript = makeBabbleGlowScript(hosts.babble);
  let lastGlowHints = '', remainingGlowWords = new Set(), lastClueEntry = '', clueTypingTimer = null;
  let gridCheckBusy = false, gridRetryAfter = 0;
  async function syncCluePuzzle() {
    if (gridCheckBusy || settings.data.clueSource !== 'selfServe' || !engine.state.ready ||
        !/^[A-Z]{25}$/.test(engine.state.gridLetters) || Date.now() < gridRetryAfter) return;
    gridCheckBusy = true;
    try {
      const result = await pages.clues.ensurePuzzle(engine.state.gridLetters);
      if (result === 'requested') {
        gridRetryAfter = Date.now() + 60000;
        engine.status('Updating Self Serve clues to match the PlayBabble puzzle…');
      }
    } catch { /* either page may still be loading */ }
    finally { gridCheckBusy = false; }
  }
  async function syncGlowHints() {
    try {
      const words = await pages.clues.remainingWords();
      const signature = JSON.stringify(words);
      remainingGlowWords = new Set(words.map(word => String(word).toLowerCase()));
      if (signature !== lastGlowHints) { await pages.babble.setGlowRemaining(words); lastGlowHints = signature; }
    } catch { /* either page is still loading */ }
  }
  babbleView.webContents.on('did-stop-loading', () => pages.babble.installGlow(glowScript)
    .then(() => pages.babble.setGlowEnabled(settings.data.highlightEntry))
    .then(syncGlowHints, () => {}));
  cluesView.webContents.on('did-stop-loading', async () => {
    const snapshot = clueReloadSnapshot;
    clueReloadSnapshot = null;
    if (snapshot) {
      try { await pages.clues.restoreReloadSnapshot(snapshot); }
      catch { engine.status('Clues reloaded; could not restore the checked words.'); }
    }
    lastGlowHints = ''; syncGlowHints();
  });
  cluesView.webContents.on('before-input-event', (_event, input) => {
    relayKey(input);
    if (input.type !== 'keyDown') return;
    if (input.key === 'Enter' && lastClueEntry) {
      const word = lastClueEntry, wasRemaining = remainingGlowWords.has(word);
      setTimeout(async () => {
        let colour = 'red';
        try { if (await pages.clues.hasWord(word)) colour = wasRemaining ? 'green' : 'amber'; } catch { /* keep red */ }
        pages.babble.finishGlow(word, colour).catch(() => {});
        sendResourceInteraction({ type: 'word', phase: 'submit', word, color: colour });
        syncGlowHints();
      }, 80);
      return;
    }
    if (input.key.length !== 1 && !['Backspace', 'Delete'].includes(input.key)) return;
    clearTimeout(clueTypingTimer);
    clueTypingTimer = setTimeout(async () => {
      try {
        const word = await pages.clues.activeWordEntry();
        if (word == null) return;
        lastClueEntry = word;
        await pages.babble.previewGlow(word);
        sendResourceInteraction({ type: 'word', phase: 'preview', word });
      } catch { /* a page may be navigating */ }
    }, 20);
  });
  let lastBabbleEntry = '', babbleTypingTimer = null;
  babbleView.webContents.on('before-input-event', (_event, input) => {
    if (!engine?.ready) { lastBabbleEntry = ''; return; }
    relayKey(input);
    if (input.type !== 'keyDown') return;
    if (input.key === 'Enter' && lastBabbleEntry) {
      sendResourceInteraction({ type: 'word', phase: 'submit', word: lastBabbleEntry });
      lastBabbleEntry = '';
      return;
    }
    if (input.key.length !== 1 && !['Backspace', 'Delete'].includes(input.key)) return;
    clearTimeout(babbleTypingTimer);
    babbleTypingTimer = setTimeout(async () => {
      try {
        lastBabbleEntry = String(await pages.babble.currentGlowWord() || '');
        sendResourceInteraction({ type: 'word', phase: 'preview', word: lastBabbleEntry });
      } catch { /* a page may be navigating */ }
    }, 20);
  });
  // Attach the enhancement listeners before the first navigation, including very fast local/test pages.
  refreshBabble(); loadPage(cluesView.webContents, currentClueSource().url);
  engine = new Engine({ pages, getAddOptions: () => settings.data.add, pace: opts.pace === undefined ? 100 : opts.pace });
  let resourceSubmitQueue = Promise.resolve();
  resView.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (!isMainFrame || !currentRes || !currentRes.submitWords) return;
    let page, expected;
    try { page = new URL(url); expected = new URL(currentRes.url); } catch { return; }
    if (page.origin !== expected.origin || page.pathname !== expected.pathname) return;
    const word = new URLSearchParams(page.hash.slice(1)).get('submit');
    if (!word || !/^[a-z]{4,12}$/.test(word)) return;
    resourceSubmitQueue = resourceSubmitQueue.then(async () => {
      const result = await engine.submit(word);
      if (result && result.color) pages.babble.finishGlow(word, result.color).catch(() => {});
      sendResourceInteraction({ type: 'word', phase: 'submit', word, color: result && result.color });
      if (addWin && !addWin.isDestroyed() && addWin.isVisible()) addWin.webContents.send('resource-submit', { word, result });
    }).catch(e => engine.status('Could not submit resource word: ' + e.message));
  });
  const timer = setInterval(() => engine.tick().catch(() => {}), opts.tickMs || 1000);
  const hintTimer = setInterval(() => { syncGlowHints(); syncCluePuzzle(); }, 3000);
  engine.tick().catch(() => {});

  const uis = () => {
    const list = [];
    if (!mainWc.isDestroyed()) list.push(mainWc);
    if (historyWin && !historyWin.isDestroyed()) list.push(historyWin.webContents);
    if (addWin && !addWin.isDestroyed()) {
      const addWc = addWin.webContents;
      if (!addWc.isDestroyed()) list.push(addWc);
    }
    return list;
  };
  const send = (ch, payload) => uis().forEach(wc => { if (!wc.isDestroyed()) wc.send(ch, payload); });
  const fullState = () => ({ ...engine.state, canSend: engine.canSend && paneHealth.babble === 'ready' && paneHealth.clues === 'ready', paneHealth, lastStatus, update: updateState });
  notifyState = () => send('state', fullState());
  const setUpdateState = state => { updateState = { ...state, launchNotice, sequence: ++updateSequence }; send('update', updateState); };
  const setUpdateActions = actions => { updateActions = actions || {}; };
  let completionPuzzle = '', previousRemaining = null;
  engine.on('state', state => {
    send('state', fullState());
    if (!restoredAdd && engine.state.ready && settings.data.add.visible) { restoredAdd = true; setAddVisible(true); }   // like fShowAdd in the Delphi code
    if (state.puzzleId !== completionPuzzle) { completionPuzzle = state.puzzleId; previousRemaining = null; }
    const remaining = state.ready && /^\d+$/.test(String(state.remaining)) ? Number(state.remaining) : null;
    if (remaining === 0 && previousRemaining !== null && previousRemaining > 0) openResource(experiments.fireworks);
    if (remaining !== null) previousRemaining = remaining;
  });
  engine.on('status', t => { lastStatus = t; send('status', t); });
  engine.on('history', history => send('history', history));
  engine.on('progress', p => send('progress', p));
  const publicSettings = () => JSON.parse(JSON.stringify({ ...settings.data, window: undefined }));
  const patch = p => {
    const previousHighlight = settings.data.highlightEntry;
    if (!settings.patch(p)) return;
    send('settings', publicSettings());
    if (settings.data.highlightEntry !== previousHighlight) pages.babble.setGlowEnabled(settings.data.highlightEntry).catch(() => {});
  };
  async function maybePromptTelemetry() {
    if (!telemetryEndpoint || opts.telemetryPrompt === false) return;
    if (settings.data.usageSharing === null || (settings.data.usageSharing === true && settings.data.usageConsentVersion < TELEMETRY_CONSENT_VERSION)) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['Allow', 'No thanks'], defaultId: 0, cancelId: 1,
        title: 'Anonymous usage notifications',
        message: 'Help improve Babble Expert?',
        detail: `With your permission, Babble Expert will notify lickety when the app is installed or upgraded, when a Resources or Options menu item is used, and how long the app was open. A random ID (${settings.data.anonymousId}) lets those messages be recognised as coming from the same installation. It sends the app version, operating system, selected menu item, session length and approximate country. It never sends entered words, puzzle activity, usernames, precise location or your IP address.`
      });
      patch({ usageSharing: response === 0, usageConsentVersion: TELEMETRY_CONSENT_VERSION });
    }
    if (settings.data.usageSharing === true && settings.data.telemetryVersion !== version) {
      const event = settings.data.telemetryVersion ? 'upgrade' : 'install';
      const previousVersion = settings.data.telemetryVersion;
      if (await telemetry.send(event, previousVersion ? { previousVersion } : undefined)) patch({ telemetryVersion: version });
    }
  }

  /* ---------- Lickety Add (always-on-top box) ---------- */
  function onScreen(b) {
    const d = screen.getDisplayMatching(b).workArea;
    return b.x + 60 < d.x + d.width && b.x + b.width - 60 > d.x && b.y >= d.y - 5 && b.y + 30 < d.y + d.height;
  }
  function ensureAddWindow() {
    if (addWin && !addWin.isDestroyed()) return addWin;
    addWin = new BrowserWindow({
      parent: win, width: 604, height: 150, minWidth: 260, minHeight: 70, show: false, frame: false, resizable: true,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, backgroundColor: '#f0f0f0',
      webPreferences: { preload: path.join(__dirname, 'preload-add.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
    });
    addWin.setAlwaysOnTop(true, 'floating');
    addWin.webContents.on('before-input-event', (_event, input) => relayKey(input));
    addWin.webContents.on('before-input-event', helpKey);
    addWin.setMenuBarVisibility(false);
    addWin.loadFile(path.join(__dirname, 'ui', 'add.html'));
    addWin.on('close', e => { if (!quitting) { e.preventDefault(); setAddVisible(false); } });
    let t; const saveBounds = () => { clearTimeout(t); t = setTimeout(() => { if (addWin && !addWin.isDestroyed() && addWin.isVisible()) settings.setAddBounds(addWin.getBounds()); }, 250); };
    addWin.on('move', saveBounds); addWin.on('resize', saveBounds);
    return addWin;
  }
  function setAddVisible(v) {
    if (v) {
      const w = ensureAddWindow();
      let b = settings.data.add.bounds;
      if (!b || !onScreen(b)) {            // first time: top-left of the Babble pane, as the Delphi form did
        const c = win.getContentBounds(), r = lastRects && lastRects.babble;
        b = { x: c.x + (r ? Math.round(r.x) : 300) + 12, y: c.y + (r ? Math.round(r.y) : 80) + 12, width: 604, height: 150 };
      }
      w.setBounds(b);
      w.show();
      w.webContents.send('focus-add');
    } else if (addWin && !addWin.isDestroyed()) addWin.hide();
    patch({ add: { visible: !!v } });
  }
  const focusAdd = () => { if (addWin && !addWin.isDestroyed() && addWin.isVisible()) addWin.webContents.send('focus-add'); };

  function showHistory() {
    if (historyWin && !historyWin.isDestroyed()) { historyWin.show(); historyWin.focus(); return; }
    historyWin = new BrowserWindow({
      parent: win, modal: true, width: 740, height: 440, minWidth: 440, minHeight: 260,
      title: 'Recent entries', show: false, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload-main.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
    });
    historyWin.once('ready-to-show', () => historyWin?.show());
    historyWin.on('closed', () => { historyWin = null; });
    historyWin.loadFile(path.join(__dirname, 'ui', 'history.html'));
  }

  function showHelp() {
    if (helpWin && !helpWin.isDestroyed()) { helpWin.show(); helpWin.focus(); return; }
    helpWin = new BrowserWindow({
      parent: win, width: 650, height: 620, minWidth: 440, minHeight: 360,
      title: 'Babble Expert Help', show: false, autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
    });
    helpWin.once('ready-to-show', () => helpWin?.show());
    helpWin.on('closed', () => { helpWin = null; });
    helpWin.loadFile(path.join(__dirname, 'ui', 'help.html'));
  }

  /* ---------- resources pane ---------- */
  function openResource(r) {
    if (currentRes === experiments.fireworks) stopCelebrationOverlays();
    currentRes = r.local ? { ...r, externalUrl: r.url, url: pathToFileURL(path.join(__dirname, r.local)).href } : r;
    patch({ resW: currentRes.width || Math.max(settings.data.resW, currentRes.minWidth || 380) });
    loadPage(resView.webContents, currentRes.url);
    send('resources', { open: true, title: currentRes.title || currentRes.label, external: currentRes.external !== false, showTitle: currentRes.showTitle !== false });
    if (currentRes.telemetryEvent !== false) telemetry.send(currentRes.telemetryEvent || 'resource', String(currentRes.title || currentRes.label || '').trim());
  }
  function hideResources() {
    stopCelebrationOverlays();
    currentRes = null; resView.webContents.loadURL('about:blank'); resView.setVisible(false);
    send('resources', { open: false });
  }

  /* ---------- IPC (only our own two windows may call in) ---------- */
  const trusted = e => e.sender === mainWc || (addWin && !addWin.isDestroyed() && e.sender === addWin.webContents) || (historyWin && !historyWin.isDestroyed() && e.sender === historyWin.webContents);
  ipcMain.on('celebration:preview', e => {
    if (e.sender !== cluesView.webContents || e.sender.isDestroyed() || !hosts.clues.includes(hostOf(e.sender.getURL()))) return;
    openResource(experiments.fireworks);
  });
  ipcMain.handle('settings:get', e => (trusted(e) ? publicSettings() : null));
  ipcMain.handle('settings:set', (e, p) => { if (trusted(e) && p && typeof p === 'object') patch(p); });
  ipcMain.handle('state:get', e => (trusted(e) ? fullState() : null));
  ipcMain.handle('history:get', e => (trusted(e) ? engine.history : []));
  ipcMain.handle('action', async (e, name, id) => {
    if (!trusted(e)) return;
    switch (name) {
      case 'send': return engine.sendToBabble();
      case 'get': { const r = await engine.getFromBabble(); focusAdd(); return r; }
      case 'refreshBabble': return refreshBabble();
      case 'reloadClues': return reloadClues();
      case 'showHistory': return showHistory();
      case 'showHelp': return showHelp();
      case 'openBabble': return shell.openExternal(urls.babble);
      case 'openClues': return shell.openExternal(currentClueSource().url);
      case 'retryResource': if (currentRes) return loadPage(resView.webContents, currentRes.url); return;
      case 'checkUpdates': return updateActions.check?.({ manual: true });
      case 'installUpdate': if (updateState.phase === 'ready') return updateActions.install?.(); return;
      case 'downloadUpdate': if (updateState.phase === 'available') return updateActions.download?.(); return;
      case 'releaseNotes': return shell.openExternal('https://github.com/licketySplitAUS/BabbleExpert/releases/latest');
      case 'restoreEntry': {
        const entry = engine.history.find(item => item.id === id);
        if (!entry) return;
        setAddVisible(true);
        const wc = addWin.webContents;
        const restore = () => { if (!wc.isDestroyed()) wc.send('restore-entry', { text: entry.text, ctrl: entry.ctrl, kind: entry.kind }); };
        if (wc.isLoading()) wc.once('did-finish-load', restore); else restore();
        return;
      }
      case 'retryEntry': {
        const entry = engine.history.find(item => item.id === id);
        if (!entry || entry.kind !== 'word' || entry.outcome === 'pending' || engine.state.pending || engine.state.busy) return;
        if (entry.puzzleId && entry.puzzleId !== engine.state.puzzleId) { engine.status('That entry belongs to another puzzle. Restore it to review before sending.'); return; }
        const result = await engine.submit(entry.text, entry.ctrl);
        pages.babble.finishGlow(entry.word, result.color).catch(() => {});
        if (addWin && !addWin.isDestroyed() && addWin.isVisible()) addWin.webContents.send('submission-result', result);
        syncGlowHints();
        return result;
      }
      case 'toggleAdd': return setAddVisible(!(addWin && !addWin.isDestroyed() && addWin.isVisible()));
      case 'closeAdd': return setAddVisible(false);
      case 'hideResources': return hideResources();
      case 'openResourceExternal': if (currentRes) shell.openExternal(currentRes.externalUrl || currentRes.url); return;
    }
  });
  ipcMain.handle('add:submit', async (e, { text, ctrl } = {}) => {
    if (!trusted(e)) return null;
    const result = await engine.submit(String(text || ''), !!ctrl);
    syncGlowHints();
    return result;
  });
  ipcMain.on('add:preview', (e, text) => {
    if (!trusted(e)) return;
    const word = String(text || '');
    pages.babble.previewGlow(word).catch(() => {});
    sendResourceInteraction({ type: 'word', phase: 'preview', word });
  });
  ipcMain.on('add:finish', (e, { text, color } = {}) => {
    if (!trusted(e)) return;
    const word = String(text || ''), resultColor = String(color || '');
    pages.babble.finishGlow(word, resultColor).catch(() => {});
    sendResourceInteraction({ type: 'word', phase: 'submit', word, color: resultColor });
  });
  ipcMain.on('add:classify', (e, { text, ctrl } = {}) => { e.returnValue = trusted(e) ? classify(String(text || ''), { ctrl: !!ctrl, ...settings.data.add }) : { kind: 'none' }; });
  ipcMain.on('menu', (e, { name, x, y } = {}) => {
    if (e.sender !== mainWc || mainWc.isDestroyed() || win.isDestroyed()) return;
    const tpl = name === 'resources'
      ? resourcesTemplate({ resources: RESOURCES, cheat, open: openResource, hide: hideResources })
      : name === 'clues'
        ? cluesTemplate(settings.data.clueSource, selectClueSource)
        : optionsTemplate(settings.data, patch, { open: openResource, experiments, track: item => telemetry.send('option', item), checkUpdates: app.isPackaged ? () => updateActions.check?.({ manual: true }) : null });
    Menu.buildFromTemplate(tpl).popup({ window: win, x: Math.round(x) || 0, y: Math.round(y) || 0 });
  });
  ipcMain.on('layout', (e, r) => {
    if (e.sender !== mainWc || mainWc.isDestroyed() || win.isDestroyed() || !r) return;
    lastRects = r;
    const place = (v, rect) => { if (!rectOk(rect)) { v.setVisible(false); return; } v.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }); v.setVisible(true); };
    place(cluesView, r.clues); place(babbleView, r.babble); place(resView, r.res);
  });

  return { win, engine, settings, telemetry, views: { clues: cluesView, babble: babbleView, res: resView }, experiments, sendResourceInteraction, getAddWindow: () => addWin, setAddVisible, refreshBabble, openResource, hideResources, prepareForUpdate, setUpdateState, setUpdateActions, patch, urls };
}

module.exports = { createApp, DEFAULTS };
