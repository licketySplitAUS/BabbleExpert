'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, shell, screen, clipboard, powerMonitor } = require('electron');
const { supportSummary } = require('./support');
const { Engine, classify } = require('./engine');
const { makePages } = require('./pages');
const { Settings, ZOOM_LEVELS } = require('./settings');
const { resourcesTemplate, cluesTemplate, optionsTemplate } = require('./menus');
const { makeBabbleGlowScript } = require('./babble-glow');
const { createWordListResults } = require('./word-list');
const { createWordListData } = require('./word-list-data');
const { ProgressJournal } = require('./progress-journal');
const { makeFireworksOverlayScript, stopFireworksOverlayScript } = require('./fireworks-overlay');
const { createTelemetry } = require('./telemetry');
const { recordLaunchVersion } = require('./updates');
const { createReleaseNotes } = require('./release-notes');
const { createUpdateHighlights } = require('./update-highlights');
const { createLicketyMessenger } = require('./lickety-message');
const { makeAnonymousId } = require('./anonymous-id');
const { clueLabel, createDefinitionLookup } = require('./create-clues');
const RESOURCES = require('./resources');
const { createTourController } = require('./tour');
const { singleFlight } = require('./polling');
const { guardStartupWindow, revealWindow } = require('./startup');
const { canonicalBabbleUrl, browserToolsTemplate } = require('./browser-tools');
const { watchPageDiagnostics } = require('./diagnostics');
const { createPageRecovery } = require('./page-recovery');
const { loadLocalWindow, trustedLocal, rememberLocalWindow } = require('./local-window');
const { allowedPage } = require('./page-runtime');
const { createHints } = require('./hints');

const TELEMETRY_CONSENT_VERSION = 3;

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
  const journal = new ProgressJournal({ file: path.join(opts.userDataDir, 'progress-journal.json'), enabled: settings.data.journalEnabled,
    ...(opts.journalNow ? { now: opts.journalNow } : {}), ...(opts.journalClock ? { clock: opts.journalClock } : {}) });
  const wordData = createWordListData({ cacheDir: path.join(opts.userDataDir, 'word-lists'), allowLocal: !app.isPackaged, fetchImpl: opts.wordListFetch || globalThis.fetch });
  const wordListViewer = pathToFileURL(path.join(__dirname, 'ui', 'word-list.html')).href;
  let wordListGeneration = 0, journalWin = null, journalTimer = null, journalHeartbeat = null, journalAvailable = false, journalSeenAt = -Infinity;
  opts.diagnostics?.useSettings(settings);
  const diagnostic = opts.diagnostics?.report || (() => {});
  const localWindowError = label => dialog.showMessageBox(win, { type: 'warning', title: label, message: `${label} could not open.`, detail: 'Your puzzle remains open. Please try again from the menu.', buttons: ['OK'] });
  const loadLocal = (window, name, label, extra = {}) => loadLocalWindow(window, path.join(__dirname, 'ui', name), { parent: win, label, diagnostic, onError: localWindowError, ...extra });
  if (!settings.data.anonymousId) { settings.patch({ anonymousId: makeAnonymousId() }); settings.flush(); }
  const version = String(opts.version || '0.0.0');
  const highlights = createUpdateHighlights({ settings, version,
    enabled: opts.updateHighlightsEnabled ?? (app.isPackaged && !opts.recordingSession) });
  let highlightsWin = null, highlightsConsidered = false;
  const releaseNotes = createReleaseNotes({ runningVersion: version, fetchImpl: opts.releaseNotesFetch });
  const messenger = createLicketyMessenger({ version, anonymousId: settings.data.anonymousId, fetchImpl: opts.messageFetch,
    ...(opts.messageEndpoint !== undefined ? { endpoint: opts.messageEndpoint } : {}) });
  let messageWin = null, messageSending = false;
  const sessionStartedAt = Date.now();
  const telemetryEndpoint = opts.telemetryEndpoint === undefined ? 'https://selfserve.r46.me/api/babble-notify' : opts.telemetryEndpoint;
  const telemetry = createTelemetry({
    endpoint: telemetryEndpoint,
    enabled: () => settings.data.usageSharing === true,
    cityEnabled: () => settings.data.usageConsentVersion >= 3,
    version,
    anonymousId: settings.data.anonymousId,
    getUsernameLink: () => settings.data.usernameLink,
    fetchImpl: opts.telemetryFetch || globalThis.fetch
  });
  const definitionLookup = createDefinitionLookup({ fetchImpl: opts.definitionFetch || globalThis.fetch });
  let cluePopup = null, createdClue = null, clueRequest = 0;
  const clueSources = {
    lickety: { label: "Lickety's Clues", url: urls.clues },
    selfServe: { label: 'Self Serve Clues', url: urls.selfServeClues }
  };
  const currentClueSource = () => clueSources[settings.data.clueSource] || clueSources.lickety;
  let engine = null, notifyState = () => {}, lastStatus = '', updateActions = {};
  const launchNotice = app.isPackaged || opts.updateHighlightsEnabled === true ? recordLaunchVersion(settings, version) : null;
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
  let resourceLoading = false, wordListReady = false, resourceNavigation = 0;
  let activeClue = null, nextClueBusy = false;
  app.on('before-quit', event => {
    journal.suspend(); journal.flush();
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
  rememberLocalWindow(win, path.join(__dirname, 'ui', 'index.html'));
  const hints = createHints({ BrowserWindow, ipcMain, screen, parent: win,
    getOwners: () => [win, addWin].filter(Boolean), enabled: () => !settings.data.hideHints });
  watchPageDiagnostics(mainWc, 'main', diagnostic, { slowMs: 10000 });
  const startup = guardStartupWindow(win, {
    log: opts.startupLog,
    onFailure: opts.onStartupFailure || (error => {
      try { dialog.showErrorBox('Babble Expert could not start', error.message); }
      finally { app.exit(1); }
    })
  });
  let zoomWin = null;
  function openZoomMenu(x = 0, y = 0) {
    if (zoomWin && !zoomWin.isDestroyed()) { zoomWin.show(); zoomWin.focus(); return; }
    const origin = win.getContentBounds();
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    const popup = new BrowserWindow({ parent: win, title: 'Zoom', width: 220, height: 160,
      x: Math.max(area.x, Math.min(origin.x + x, area.x + area.width - 220)),
      y: Math.max(area.y, Math.min(origin.y + y, area.y + area.height - 160)),
      frame: false, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload-zoom.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
    });
    zoomWin = popup;
    popup.on('blur', () => { if (!popup.isDestroyed()) popup.close(); });
    popup.on('closed', () => { if (zoomWin === popup) zoomWin = null; });
    loadLocal(popup, 'zoom.html', 'Zoom');
  }
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', e => e.preventDefault());
  if (!saved || saved.maximized) win.maximize();
  const tour = createTourController({ BrowserWindow, ipcMain, parent: win, settings, diagnostic,
    getWorkArea: () => screen.getDisplayMatching(win.getBounds()).workArea,
    onError: () => dialog.showMessageBox(win, { type: 'warning', title: 'Guided tour', message: 'The guided tour could not open.', detail: 'You can keep using Babble Expert. Try the tour again later from Help or Options.', buttons: ['OK'] }),
    canOpen: event => !!helpWin && !helpWin.isDestroyed() && event.sender === helpWin.webContents && event.senderFrame === helpWin.webContents.mainFrame });
  mainWc.once('did-finish-load', () => {
    if (!win.isDestroyed()) void maybePromptTelemetry().catch(() => {}).then(() => {
      if (!win.isDestroyed() && !highlightsConsidered && highlights.pending()) showHighlights();
    });
  });
  function saveWindowSettings() {
    journal.suspend(); journal.flush();
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
  const pauseJournal = () => { journalAvailable = false; journal.suspend(); journal.flush(); };
  for (const event of ['suspend', 'lock-screen', 'resume']) powerMonitor?.on(event, pauseJournal);
  win.on('blur', () => journal.suspend());
  win.on('minimize', pauseJournal);
  win.on('closed', () => { clearInterval(timer); clearInterval(hintTimer); clearInterval(journalTimer); clearInterval(journalHeartbeat); pauseJournal();
    for (const event of ['suspend', 'lock-screen', 'resume']) powerMonitor?.removeListener(event, pauseJournal); app.quit(); });
  win.loadFile(path.join(__dirname, 'ui', 'index.html')).catch(() => startup.fail('The main window file could not be opened.'));
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
  const babbleView = mkView('persist:babble', { preload: path.join(__dirname, 'preload-babble.js') });
  const resView = mkView('persist:resources', { autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false });
  for (const v of [cluesView, babbleView, resView]) { win.contentView.addChildView(v); v.setVisible(false); }
  const applyZoom = () => {
    for (const v of [cluesView, babbleView, resView]) {
      if (!v.webContents.isDestroyed()) v.webContents.setZoomFactor(settings.data.zoom / 100);
    }
  };
  // Reapply after navigation, including resources opened after changing zoom.
  for (const v of [cluesView, babbleView, resView]) v.webContents.on('dom-ready', applyZoom);
  applyZoom();

  const pageRecovery = new Map();
  function guard(wc, sameSiteHosts, name) {
    watchPageDiagnostics(wc, name, diagnostic);
    const recovery = createPageRecovery(wc, { onState: health => setPaneHealth(name, health) });
    pageRecovery.set(wc, recovery);
    win.once('closed', recovery.dispose);
    wc.on('did-start-loading', () => {
      if (name === 'babble') closeCreatedClue();
      if (name === 'clues') { engine?.cluesPageChanged(); if (createdClue?.source === 'clues') closeCreatedClue(); }
    });
    wc.on('unresponsive', () => setPaneHealth(name, 'unresponsive'));
    wc.on('responsive', () => setPaneHealth(name, 'ready'));
    wc.setWindowOpenHandler(({ url }) => {
      if (isHttp(url)) {
        if (['playbabble.com', 'www.playbabble.com'].includes(hostOf(url))) loadPage(babbleView.webContents, url);
        else if (sameSiteHosts && sameSiteHosts.includes(hostOf(url))) loadPage(wc, url);
        else shell.openExternal(url);
      }
      return { action: 'deny' };
    });
    const navigate = (e, url, _isInPlace, isMainFrame) => {
      if (isMainFrame === false) return;
      if (!isHttp(url)) { e.preventDefault(); return; }
      if (sameSiteHosts && sameSiteHosts.includes(hostOf(url)) && !allowedPage(canonicalBabbleUrl(url), sameSiteHosts, !app.isPackaged)) { e.preventDefault(); return; }
      const canonical = canonicalBabbleUrl(url);
      const isBabble = ['playbabble.com', 'www.playbabble.com'].includes(hostOf(url));
      if (canonical !== url || (isBabble && wc !== babbleView.webContents)) {
        e.preventDefault();
        loadPage(babbleView.webContents, canonical);
      }
    };
    wc.on('will-navigate', navigate);
    wc.on('will-redirect', navigate);
    wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  }
  guard(babbleView.webContents, hosts.babble, 'babble'); guard(cluesView.webContents, hosts.clues, 'clues'); guard(resView.webContents, null, 'resources');
  const experiments = {
    funWordPlay: { label: 'Fun Word Play', title: 'Fun Word Play', url: pathToFileURL(path.join(__dirname, 'experiments', 'fun-word-play.html')).href, minWidth: 480, external: false, interactive: true, telemetryEvent: 'option' },
    chillVibes: { label: 'Chill Vibes', title: 'Chill Vibes', url: pathToFileURL(path.join(__dirname, 'experiments', 'chill-vibes.html')).href, minWidth: 480, external: false, interactive: true, telemetryEvent: 'option' },
    fireworks: { label: 'Fireworks', title: 'Fireworks', url: pathToFileURL(path.join(__dirname, 'experiments', 'fireworks.html')).href, minWidth: 500, external: false, showTitle: false, telemetryEvent: false }
  };
  const wordListResults = createWordListResults();
  function sendResourceInteraction(payload) {
    if (payload.type === 'word' && payload.phase === 'submit') wordListResults.record(payload);
    if (!currentRes || !(currentRes.interactive || currentRes.wordLength) || resView.webContents.isDestroyed() ||
        (currentRes.wordLength ? !wordListReady : resView.webContents.isLoading())) return;
    let actual, expected;
    try { actual = new URL(resView.webContents.getURL()); expected = new URL(currentRes.url); } catch { return; }
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) return;
    if (currentRes.wordLength && actual.search !== expected.search) return;
    return resView.webContents.mainFrame.executeJavaScript(`(function(){var p=${JSON.stringify(payload)};var list=window.__babbleExpertWordList;if(list&&p.type==='word'&&p.phase==='submit')list.finishWord(p);if(list&&p.type==='word-results')list.restoreResults(p.results,p.reset);var f=window.BabbleExpertInteract;if(typeof f==='function')f(p);})()`, false).catch(() => {});
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

  const loadPage = (wc, url) => pageRecovery.get(wc).load(canonicalBabbleUrl(url));
  const refreshBabble = () => loadPage(babbleView.webContents, urls.babble);
  let clueReloadSnapshot = null;
  async function reloadClues(current = false, ignoreCache = false) {
    // Self Serve persists its own words. Preserve the original page's checked
    // words too, but only restore them if the reloaded puzzle is the same one.
    clueReloadSnapshot = null;
    try { clueReloadSnapshot = await pages.clues.reloadSnapshot(); } catch { /* page may be unavailable */ }
    if (current) return ignoreCache ? cluesView.webContents.reloadIgnoringCache() : cluesView.webContents.reload();
    return loadPage(cluesView.webContents, currentClueSource().url);
  }
  function browserToolsMenu() {
    return browserToolsTemplate({ dialog, win, status: text => engine.status(text), panes: [
      { label: 'Babble', wc: babbleView.webContents, home: refreshBabble, sessionLabel: 'Babble and Clues (shared)' },
      { label: 'Clues', wc: cluesView.webContents, home: () => reloadClues(), reload: ignoreCache => reloadClues(true, ignoreCache), sessionLabel: 'Babble and Clues (shared)' },
      ...(currentRes ? [{ label: 'Resources', wc: resView.webContents, home: () => reloadResource(true), reload: ignoreCache => reloadResource(ignoreCache), sessionLabel: 'Resources (separate from Babble and Clues)' }] : [])
    ] });
  }
  function selectClueSource(source) {
    if (!clueSources[source] || source === settings.data.clueSource) return;
    patch({ clueSource: source });
    telemetry.send('option', `Clues: ${clueSources[source].label}`);
    engine.cluesPageChanged();
    loadPage(cluesView.webContents, clueSources[source].url);
    engine.status(`Switched to ${clueSources[source].label}`);
  }
  // F5 / Ctrl+R / Cmd+R use the same refresh actions as the toolbar.
  babbleView.webContents.on('before-input-event', (e, i) => { if (isReloadKey(i)) { e.preventDefault(); refreshBabble(); } });
  cluesView.webContents.on('before-input-event', (e, i) => { if (isReloadKey(i)) { e.preventDefault(); reloadClues(); } });
  /* ---------- the brain ---------- */
  const pages = makePages({ getBabble: () => babbleView.webContents, getClues: () => cluesView.webContents, babbleHosts: hosts.babble, cluesHosts: hosts.clues, allowLocal: !app.isPackaged });
  const fireworksScripts = { babble: makeFireworksOverlayScript(hosts.babble), clues: makeFireworksOverlayScript(hosts.clues) };
  const stopCelebrationOverlays = () => {
    pages.babble.fireworks(stopFireworksOverlayScript).catch(() => {});
    pages.clues.fireworks(stopFireworksOverlayScript).catch(() => {});
  };
  // The packaged celebration announces each start/replay through its own URL.
  // Only that exact local file can trigger the transparent, silent overlays.
  let lastFireworksStart = '';
  resView.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (!isMainFrame || currentRes !== experiments.fireworks) return;
    let actual, expected;
    try { actual = new URL(url); expected = new URL(experiments.fireworks.url); } catch { return; }
    if (actual.protocol !== 'file:' || actual.pathname !== expected.pathname || !actual.hash.startsWith('#fireworks=')) return;
    if (url === lastFireworksStart) return;
    lastFireworksStart = url;
    // Report the actual start, including automatic completion, once for all
    // three Expert panes. Embedded Clues defers its celebration/report to us.
    telemetry.send('option', new URLSearchParams(actual.hash.slice(1)).get('user') === '1' ? 'Fireworks replay' : 'Fireworks');
    pages.babble.fireworks(fireworksScripts.babble).catch(() => {});
    pages.clues.fireworks(fireworksScripts.clues).catch(() => {});
  });
  const glowScript = makeBabbleGlowScript(hosts.babble);
  let lastGlowHints = '', remainingGlowWords = new Set();
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
  const syncGlowHints = singleFlight(async () => {
    try {
      const words = await pages.clues.remainingWords();
      const signature = JSON.stringify(words);
      remainingGlowWords = new Set(words.map(word => String(word).toLowerCase()));
      if (signature !== lastGlowHints) { await pages.babble.setGlowRemaining(words); lastGlowHints = signature; }
    } catch { /* either page is still loading */ }
  });
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
  cluesView.webContents.on('before-input-event', (_event, input) => relayKey(input));
  cluesView.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    Menu.buildFromTemplate([
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { type: 'separator' }, { role: 'selectAll' }
    ]).popup({ window: win });
  });
  ipcMain.on('clues:entry', (event, phase, raw) => {
    if (event.sender !== cluesView.webContents || event.sender.isDestroyed() ||
        (event.senderFrame !== event.sender.mainFrame || !allowedPage(event.sender.getURL(), hosts.clues, !app.isPackaged)) || typeof raw !== 'string' || raw.length > 128) return;
    const word = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (phase === 'preview') {
      pages.babble.previewGlow(word).catch(() => {});
      sendResourceInteraction({ type: 'word', phase: 'preview', word });
    } else if (phase === 'submit' && word) {
      const wasRemaining = remainingGlowWords.has(word);
      setTimeout(async () => {
        let colour = 'red';
        try { if (await pages.clues.hasWord(word)) colour = wasRemaining ? 'green' : 'amber'; } catch { /* keep red */ }
        pages.babble.finishGlow(word, colour).catch(() => {});
        sendResourceInteraction({ type: 'word', phase: 'submit', word, color: colour });
        syncGlowHints();
      }, 80);
    }
  });
  let lastBabbleEntry = '', babbleTypingTimer = null;
  babbleView.webContents.on('before-input-event', (_event, input) => {
    if (!engine?.state.ready) { lastBabbleEntry = ''; return; }
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
  engine = new Engine({ pages, getAddOptions: () => settings.data.add, observeProgress: () => journal.enabled && !journal.blocked, pace: opts.pace === undefined ? 100 : opts.pace });
  const journalActive = () => {
    if (opts.journalActive) return opts.journalActive();
    try { const focused = BrowserWindow.getFocusedWindow();
      return !win.isMinimized() && (focused === win || focused === addWin) && powerMonitor.getSystemIdleTime() < 300;
    } catch { return false; }
  };
  engine.on('puzzle-progress', value => { journalAvailable = journal.observe(value, { active: journalActive() }); journalSeenAt = journal.clock(); });
  journalHeartbeat = setInterval(() => journal.activity(journalAvailable && journal.clock() - journalSeenAt <= 15000 && paneHealth.babble === 'ready' && journalActive()), 1000);
  let resourceSubmitQueue = Promise.resolve();
  resView.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (!isMainFrame || !currentRes || !currentRes.submitWords) return;
    let page, expected;
    try { page = new URL(url); expected = new URL(currentRes.url); } catch { return; }
    if (page.origin !== expected.origin || page.pathname !== expected.pathname) return;
    if (currentRes.wordLength && page.search !== expected.search) return;
    const params = new URLSearchParams(page.hash.slice(1));
    if (params.get('next') === 'clue' && currentRes.wordLength) { advanceClue(); return; }
    if (params.get('previous') === 'clue' && currentRes.wordLength) { advanceClue(-1); return; }
    const word = params.get('submit');
    if (!word || !/^[a-z]{4,12}$/.test(word)) return;
    if (currentRes.wordLength) {
      if (word.length !== currentRes.wordLength || page.search !== expected.search) return;
      lastClickedResourceWord = word;
      clipboard.writeText(word);
    }
    const puzzle = wordListResults.key;
    resourceSubmitQueue = resourceSubmitQueue.then(async () => {
      if (puzzle !== wordListResults.key) return;
      const result = await engine.submit(word);
      if (puzzle !== wordListResults.key) return;
      if (result && result.color) pages.babble.finishGlow(word, result.color).catch(() => {});
      sendResourceInteraction({ type: 'word', phase: 'submit', word, color: result && result.color, message: result && result.message });
      if (addWin && !addWin.isDestroyed() && addWin.isVisible()) addWin.webContents.send('resource-submit', { word, result });
    }).catch(e => engine.status('Could not submit resource word: ' + e.message));
  });
  const poll = singleFlight(async () => { await engine.tick(); await engine.syncNativeWords(); await advanceCompletedClue(); });
  const timer = setInterval(() => poll().catch(() => {}), opts.tickMs || 1000);
  const hintTimer = setInterval(() => { syncGlowHints(); syncCluePuzzle(); }, 3000);
  poll().catch(() => {});

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
    if (wordListResults.setPuzzle(state)) {
      activeClue = null;
      lastClickedResourceWord = '';
      if (currentRes?.wordLength) sendResourceInteraction({ type: 'word-results', results: [], reset: true });
    }
    send('state', fullState());
    if (!restoredAdd && engine.state.ready && settings.data.add.visible) { restoredAdd = true; setAddVisible(true); }   // like fShowAdd in the Delphi code
    if (state.puzzleId !== completionPuzzle) { completionPuzzle = state.puzzleId; previousRemaining = null; }
    const remaining = state.ready && /^\d+$/.test(String(state.remaining)) ? Number(state.remaining) : null;
    if (remaining === 0 && previousRemaining !== null && previousRemaining > 0) openResource(experiments.fireworks);
    if (remaining !== null) previousRemaining = remaining;
  });
  engine.on('accepted-words', ({ puzzleId, gridLetters, words }) => {
    if (puzzleId + ':' + gridLetters !== wordListResults.key) return;
    const changed = wordListResults.found(words).filter(result => result.word.length === currentRes?.wordLength);
    if (changed.length) sendResourceInteraction({ type: 'word-results', results: changed });
  });
  engine.on('status', t => { lastStatus = t; send('status', t); });
  engine.on('history', history => send('history', history));
  engine.on('progress', p => send('progress', p));
  const publicSettings = () => JSON.parse(JSON.stringify({ ...settings.data, window: undefined }));
  const patch = p => {
    const previousZoom = settings.data.zoom;
    const previousHighlight = settings.data.highlightEntry;
    const previousCreateClues = settings.data.createClues;
    const previousResourcesLeft = settings.data.resourcesLeft;
    const previousJournalEnabled = settings.data.journalEnabled;
    if (!settings.patch(p)) return;
    if (Object.hasOwn(p, 'journalEnabled')) { journalAvailable = false; journal.setEnabled(settings.data.journalEnabled); publishJournal(); }
    if (!previousResourcesLeft && settings.data.resourcesLeft) void telemetry.send('option', 'Resources moved to the left');
    if (!previousJournalEnabled && settings.data.journalEnabled) void telemetry.send('option', 'Personal progress journal enabled');
    if (Object.hasOwn(p, 'hideHints')) hints.hide();
    if (Object.hasOwn(p, 'usageSharing')) {
      settings.flush();
      opts.diagnostics?.preferenceChanged();
      void opts.diagnostics?.flush();
      if (settings.data.usageSharing === true) void telemetry.send('startup');
    }
    if (settings.data.zoom !== previousZoom) applyZoom();
    send('settings', publicSettings());
    if (zoomWin && !zoomWin.isDestroyed()) zoomWin.webContents.send('zoom:state', settings.data.zoom);
    if (settings.data.highlightEntry !== previousHighlight) pages.babble.setGlowEnabled(settings.data.highlightEntry).catch(() => {});
    if (settings.data.createClues !== previousCreateClues) {
      babbleView.webContents.send('create-clues:enabled', settings.data.createClues);
      cluesView.webContents.send('create-clues:enabled', settings.data.createClues);
      if (!settings.data.createClues) closeCreatedClue();
    }
  };
  async function maybePromptTelemetry() {
    if (!telemetryEndpoint || opts.telemetryPrompt === false) return;
    if (settings.data.usageSharing === null || (settings.data.usageSharing === true && settings.data.usageConsentVersion < TELEMETRY_CONSENT_VERSION)) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['Allow', 'No thanks'], defaultId: 0, cancelId: 1,
        title: 'Anonymous usage notifications',
        message: 'Help improve Babble Expert?',
        detail: `With your permission, Babble Expert will notify lickety when the app starts, is installed or upgraded, when a Resources or Options menu item is used, when fireworks start automatically, are manually started or replayed, when Grab Grid is clicked in Self Serve or the clue source is switched, and how long the app was open. It also sends technical diagnostics if startup, page loading or updates fail or become unusually slow, including error codes, timings, OS build and total memory. A random ID (${settings.data.anonymousId}) lets those messages be recognised as coming from the same installation. It sends the app version, operating system, selected menu item, session length and approximate country and city (when available, based on the network connection). It never sends entered words, puzzle identifiers or counts, journal records, precise location or your IP address. Usernames are sent only if you separately choose to link one on Send lickety a message. Diagnostics contain no page contents, URLs or local file paths and do not include location enrichment.`
      });
      patch({ usageSharing: response === 0, usageConsentVersion: TELEMETRY_CONSENT_VERSION });
    }
    if (settings.data.usageSharing === true) void telemetry.send('startup');
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
      parent: opts.recordingSession ? undefined : win, width: 604, height: 150, minWidth: 260, minHeight: 70, show: false, frame: false, resizable: true,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: !opts.recordingSession, title: 'Lickety Add', backgroundColor: '#f0f0f0',
      webPreferences: { preload: path.join(__dirname, 'preload-add.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
    });
    addWin.setAlwaysOnTop(true, 'floating');
    addWin.webContents.on('before-input-event', (_event, input) => relayKey(input));
    addWin.webContents.on('before-input-event', helpKey);
    addWin.setMenuBarVisibility(false);
    loadLocal(addWin, 'add.html', 'Lickety Add', { show: false });
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
    historyWin.on('closed', () => { historyWin = null; });
    loadLocal(historyWin, 'history.html', 'Recent entries');
  }

  function showMessage() {
    if (messageWin && !messageWin.isDestroyed()) { messageWin.show(); messageWin.focus(); return; }
    messageWin = new BrowserWindow({ parent: win, width: 640, height: 650, minWidth: 440, minHeight: 360,
      title: 'Send lickety a message', show: false, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload-message.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
    messageWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    messageWin.webContents.on('will-navigate', event => event.preventDefault());
    messageWin.on('closed', () => { messageWin = null; });
    loadLocal(messageWin, 'message.html', 'Send lickety a message');
  }

  let helpReturnTo = null;
  function restoreAppFocus(target = win) {
    if (quitting || finalizingClose || win.isDestroyed()) return;
    revealWindow(win);
    if (target && target !== win && !target.isDestroyed()) revealWindow(target);
  }
  function showHelp(topic, opener = win) {
    helpReturnTo = opener;
    if (helpWin && !helpWin.isDestroyed()) {
      if (topic === 'release-notes') helpWin.webContents.send('help:topic', topic);
      helpWin.show(); helpWin.focus(); return;
    }
    helpWin = new BrowserWindow({
      parent: win, width: 650, height: 620, minWidth: 440, minHeight: 360,
      title: 'Babble Expert Help', show: false, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload-help.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
    });
    helpWin.webContents.setWindowOpenHandler(({ url }) => {
      if (isHttp(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    helpWin.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (isHttp(url)) shell.openExternal(url);
    });
    helpWin.on('closed', () => {
      const opener = helpReturnTo;
      helpWin = null; helpReturnTo = null;
      // Let native window destruction finish before restoring the app's
      // foreground window; otherwise Windows can activate the previous app.
      setImmediate(() => restoreAppFocus(opener));
    });
    loadLocal(helpWin, 'help.html', 'Help', { query: topic === 'release-notes' ? { topic } : undefined });
    helpWin.webContents.setWindowOpenHandler(({ url }) => { if (isHttp(url)) shell.openExternal(url); return { action: 'deny' }; });
  }

  function showHighlights() {
    highlightsConsidered = true;
    if (highlightsWin && !highlightsWin.isDestroyed()) { highlightsWin.show(); highlightsWin.focus(); return; }
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    highlightsWin = new BrowserWindow({ parent: win, title: "What's new in Babble Expert", show: false, autoHideMenuBar: true,
      width: Math.min(650, area.width), height: Math.min(720, area.height), minWidth: Math.min(390, area.width), minHeight: 360,
      backgroundColor: '#f8f8f1',
      webPreferences: { preload: path.join(__dirname, 'preload-highlights.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
    highlightsWin.on('closed', () => {
      highlightsWin = null;
      setImmediate(() => restoreAppFocus());
    });
    loadLocal(highlightsWin, 'highlights.html', "What's new");
  }
  ipcMain.handle('highlights:get', event => trustedLocal(event, highlightsWin) ? highlights.view() : null);
  ipcMain.handle('highlights:acknowledge', event => {
    if (!trustedLocal(event, highlightsWin)) return false;
    return !highlights.pending() || highlights.acknowledge();
  });
  ipcMain.handle('highlights:release-notes', event => {
    if (!trustedLocal(event, highlightsWin)) return false;
    showHelp('release-notes', highlightsWin); return true;
  });

  /* ---------- Create Clues: only completed Babble words, with explicit chat send ---------- */
  function clueWindowSender(event) {
    return trustedLocal(event, cluePopup);
  }
  function createdClueState() {
    if (!createdClue) return null;
    const { word, label, clue, loading, sending, sent, message } = createdClue;
    return { word, label, clue, loading, sending, sent, message };
  }
  function publishCreatedClue() {
    if (cluePopup && !cluePopup.isDestroyed()) cluePopup.webContents.send('create-clues:state', createdClueState());
  }
  function closeCreatedClue() {
    clueRequest++;
    createdClue = null;
    if (cluePopup && !cluePopup.isDestroyed()) cluePopup.close();
  }
  function showCreatedClueWindow(point, sourceView) {
    if (!cluePopup || cluePopup.isDestroyed()) {
      const popup = new BrowserWindow({ parent: opts.recordingSession ? undefined : win, width: 600, height: 440, minWidth: 470, minHeight: 340, show: false, resizable: true,
        minimizable: false, maximizable: false, skipTaskbar: !opts.recordingSession, autoHideMenuBar: true, title: 'Create Clues',
        webPreferences: { preload: path.join(__dirname, 'preload-clue.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
      cluePopup = popup;
      popup.setAlwaysOnTop(true, 'floating');
      popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      popup.webContents.on('will-navigate', event => event.preventDefault());
      popup.on('closed', () => { if (cluePopup === popup) { cluePopup = null; createdClue = null; clueRequest++; } });
      loadLocal(popup, 'clue.html', 'Create Clues', { show: false });
    }
    const origin = win.getContentBounds(), view = sourceView.getBounds();
    const x = origin.x + view.x + (Number.isFinite(point.x) ? point.x : 20);
    const y = origin.y + view.y + (Number.isFinite(point.y) ? point.y : 20);
    const area = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
    const [width, height] = cluePopup.getSize();
    cluePopup.setPosition(Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
      Math.round(Math.max(area.y, Math.min(y + 12, area.y + area.height - height))));
    if (!cluePopup.webContents.isLoading()) { cluePopup.show(); cluePopup.focus(); }
  }
  async function loadCreatedClue(refresh = false) {
    const state = createdClue, request = ++clueRequest;
    if (!state) return;
    Object.assign(state, { loading: true, sending: false, sent: false, message: 'Looking up a definition…' });
    publishCreatedClue();
    try {
      const definitions = await definitionLookup.lookup(state.word, { refresh });
      if (createdClue !== state || request !== clueRequest || !settings.data.createClues) return;
      Object.assign(state, { definitions, index: 0, clue: definitions[0] || '', loading: false,
        message: definitions.length > 1 ? `Definition 1 of ${definitions.length}. Try again for another clue.`
          : definitions.length === 1 ? (refresh ? 'Only one definition is available. You can edit the clue below.' : 'Edit this clue or send it when you are happy with it.')
          : 'No definition found for this word. Try again or write your own clue.' });
    } catch (error) {
      if (createdClue !== state || request !== clueRequest) return;
      Object.assign(state, { loading: false, message: error.message });
    }
    publishCreatedClue();
  }
  const clueSourceFor = sender => sender === babbleView.webContents ? { view: babbleView, hosts: hosts.babble, name: 'babble' }
    : sender === cluesView.webContents ? { view: cluesView, hosts: hosts.clues, name: 'clues' } : null;
  ipcMain.handle('create-clues:enabled', event => {
    const source = clueSourceFor(event.sender);
    return !!source && event.senderFrame === event.sender.mainFrame && allowedPage(event.sender.getURL(), source.hosts, !app.isPackaged) && settings.data.createClues === true;
  });
  ipcMain.on('create-clues:word', async (event, point) => {
    const source = clueSourceFor(event.sender);
    if (!settings.data.createClues || !source || event.sender.isDestroyed() ||
        (event.senderFrame !== event.sender.mainFrame || !allowedPage(event.sender.getURL(), source.hosts, !app.isPackaged)) || !point || typeof point.word !== 'string' || !/^[a-z]{4,25}$/.test(point.word)) return;
    const request = ++clueRequest;
    const revision = engine._clueRevision;
    try {
      if (source.name === 'clues' && engine.state.puzzleMatch !== true) return;
      const words = await (source.name === 'clues' ? pages.clues.getAllWords() : pages.babble.words());
      if (request !== clueRequest || !settings.data.createClues || !words.some(word => word.trim().toLowerCase() === point.word)) return;
      if (source.name === 'clues' && (revision !== engine._clueRevision || engine.state.puzzleMatch !== true)) return;
      createdClue = { word: point.word, label: clueLabel(point.word), clue: '', loading: true, sending: false, sent: false,
        message: 'Looking up a definition…', definitions: [], index: 0, source: source.name, clueRevision: revision,
        puzzleId: engine.state.puzzleId, gridLetters: engine.state.gridLetters };
      showCreatedClueWindow(point, source.view);
      await loadCreatedClue();
    } catch { /* Navigation or closing the app cancels the popup request. */ }
  });
  ipcMain.handle('create-clues:get', event => clueWindowSender(event) ? createdClueState() : null);
  ipcMain.on('create-clues:close', event => { if (clueWindowSender(event)) closeCreatedClue(); });
  ipcMain.handle('create-clues:retry', async event => {
    if (!clueWindowSender(event) || !settings.data.createClues || !createdClue || createdClue.loading || createdClue.sending) return;
    if (createdClue.definitions.length > 1) {
      createdClue.index = (createdClue.index + 1) % createdClue.definitions.length;
      Object.assign(createdClue, { clue: createdClue.definitions[createdClue.index], sent: false,
        message: `Definition ${createdClue.index + 1} of ${createdClue.definitions.length}. You can edit this clue.` });
      publishCreatedClue();
    } else await loadCreatedClue(true);
  });
  ipcMain.handle('create-clues:send', async (event, text) => {
    if (!clueWindowSender(event) || !settings.data.createClues || !createdClue || createdClue.loading || createdClue.sending || createdClue.sent || typeof text !== 'string') return;
    const clue = text.replace(/\s+/g, ' ').trim();
    if (!clue) return;
    const state = createdClue;
    Object.assign(state, { clue, sending: true, message: 'Sending clue to Babble chat…' });
    publishCreatedClue();
    try {
      await engine.tick();
      if (createdClue !== state) return;
      const words = await (state.source === 'clues' ? pages.clues.getAllWords() : pages.babble.words());
      if (!engine.state.ready || engine.state.puzzleId !== state.puzzleId || engine.state.gridLetters !== state.gridLetters ||
          (state.source === 'clues' && (state.clueRevision !== engine._clueRevision || engine.state.puzzleMatch !== true)) ||
          !words.some(word => word.trim().toLowerCase() === state.word)) {
        throw new Error('The puzzle changed or Babble is unavailable. Close this popup and choose a completed word again.');
      }
      if (createdClue !== state) return;
      const result = await engine.submit(`${state.label} ${clue}`, true, { maxLength: 20000 });
      if (createdClue !== state) return;
      Object.assign(state, { sending: false, sent: result.sent === true, message: result.sent ? 'Clue submitted. Check the Babble chat pane.' : result.message });
    } catch (error) {
      if (createdClue !== state) return;
      Object.assign(state, { sending: false, message: error.message });
    }
    publishCreatedClue();
  });

  /* ---------- resources pane ---------- */
  let resourceAnchor = '', wordLengthChanging = false, wordListNotified = false, lastClickedResourceWord = '';
  let clueLookupSequence = 0;
  async function centreResource(wc, anchor) {
    const method = typeof anchor === 'object' ? 'centreClue' : 'centrePrefix';
    const match = await wc.mainFrame.executeJavaScript(`(async()=>{const match=window.__babbleExpertWordList?.${method}(${JSON.stringify(anchor)});await new Promise(resolve=>setTimeout(resolve,0));return match;})()`, false);
    if (method === 'centreClue' && match === '') engine.status(`No word-list match for ${anchor.prefix}${anchor.length} between the solved clues.`);
  }
  const trustedClues = event => event.sender === cluesView.webContents && !event.sender.isDestroyed() &&
    event.senderFrame === event.sender.mainFrame && allowedPage(event.sender.getURL(), hosts.clues, !app.isPackaged);
  ipcMain.on('clues:lookup', (event, identity) => { if (trustedClues(event)) lookupClue(identity); });
  ipcMain.on('clues:next', event => { if (trustedClues(event)) advanceClue(); });
  ipcMain.on('clues:previous', event => { if (trustedClues(event)) advanceClue(-1); });
  function publishClueNavigation() {
    if (!cluesView.webContents.isDestroyed()) cluesView.webContents.send('clues:navigation-enabled', !!currentRes?.wordLength && wordListReady && !resourceLoading);
  }
  cluesView.webContents.on('dom-ready', publishClueNavigation);
  cluesView.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) activeClue = null; });
  async function lookupClue(identity, knownContext) {
    if (!currentRes?.wordLength || !identity || typeof identity !== 'object') return;
    const name = typeof identity.name === 'string' && /^edt\d+$/.test(identity.name) ? identity.name : '';
    const answerKey = typeof identity.answerKey === 'string' && /^[a-z]{4,25}$/i.test(identity.answerKey) ? identity.answerKey : '';
    if (!name && !answerKey) return;
    activeClue = { name, answerKey };
    const resource = currentRes, sequence = ++clueLookupSequence;
    resourceState(true, 'Finding matching word…');
    try {
      const context = knownContext || await pages.clues.entryContext({ name, answerKey });
      if (sequence !== clueLookupSequence || currentRes !== resource) return;
      if (!context) { resourceState(); return; }
      const next = RESOURCES.find(item => item.wordLength === context.length);
      if (!next) { resourceState(); return; }
      if (resource.wordLength !== context.length) {
        const url = new URL(resource.sourceUrl);
        url.pathname = url.pathname.replace(/words-\d+\.html$/, `words-${context.length}.html`);
        openResource({ ...next, url: url.href }, context);
      } else {
        resourceAnchor = context;
        if (!wordListReady) return;
        await centreResource(resView.webContents, context);
        if (currentRes === resource && resourceAnchor === context) { resourceAnchor = ''; resourceState(); }
      }
    } catch { if (currentRes === resource && sequence === clueLookupSequence) resourceState(); }
  }
  async function advanceCompletedClue() {
    if (!activeClue || !currentRes?.wordLength || !wordListReady || resourceLoading || nextClueBusy ||
        !engine.state.ready || !engine.state.cluesOk || engine.state.puzzleMatch !== true) return;
    const identity = activeClue, resource = currentRes, revision = engine._clueRevision, puzzle = wordListResults.key;
    try {
      const completed = await pages.clues.completedEntry(identity);
      if (completed && activeClue === identity && currentRes === resource && revision === engine._clueRevision && puzzle === wordListResults.key)
        await advanceClue(1, identity);
    } catch { /* A loading or unavailable clue page can be checked on the next poll. */ }
  }
  async function advanceClue(direction = 1, completedIdentity = null) {
    if (completedIdentity && activeClue !== completedIdentity) return;
    if (!currentRes?.wordLength || !wordListReady || resourceLoading || nextClueBusy) return;
    nextClueBusy = true;
    const resource = currentRes, sequence = ++clueLookupSequence;
    const step = direction === -1 ? 'previous' : 'next';
    resourceState(true, `Finding ${step} clue…`);
    try {
      const next = await pages.clues.nextEntry(activeClue, direction);
      if (currentRes !== resource || sequence !== clueLookupSequence) return;
      if (!next) {
        if (completedIdentity) activeClue = null;
        resourceState(); engine.status('No unfinished 4–12-letter clues are available.'); return;
      }
      if (next.wrapped) engine.status(direction === -1 ? 'Back to the last unfinished clue.' : 'Back to the first unfinished clue.');
      await lookupClue(next.identity, next.context);
    } catch {
      if (currentRes === resource && sequence === clueLookupSequence) { resourceState(); engine.status(`Could not move to the ${step} clue. Wait for Clues to finish loading, then try again.`); }
    } finally { nextClueBusy = false; }
  }
  function resourceState(loading = false, loadingText = '') {
    if (!currentRes) return;
    resourceLoading = !!currentRes.wordLength && loading;
    publishClueNavigation();
    // Native web views sit above the app UI. Hide only the resource view so
    // the centred indicator remains responsive throughout navigation/setup.
    if (resourceLoading) resView.setVisible(false);
    else if (rectOk(lastRects?.res)) resView.setVisible(true);
    send('resources', { open: true, title: currentRes.title || currentRes.label, external: currentRes.external !== false,
      showTitle: currentRes.showTitle !== false, wordLength: currentRes.wordLength, loading: resourceLoading,
      loadingText: loadingText || `${resourceAnchor ? 'Finding' : 'Opening'} ${currentRes.wordLength}-letter ${resourceAnchor ? 'word' : 'words'}…` });
  }
  resView.webContents.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
    if (inPlace || !mainFrame || !currentRes?.wordLength || url.startsWith('data:')) return;
    resourceNavigation++;
    wordListReady = false;
    resourceState(true);
  });
  const finishResourceFailure = () => {
    if (currentRes?.wordLength) { wordListReady = false; resourceState(); }
  };
  resView.webContents.on('did-fail-load', (_event, code, _desc, _url, mainFrame) => { if (mainFrame && code !== -3) finishResourceFailure(); });
  resView.webContents.on('render-process-gone', finishResourceFailure);
  resView.webContents.on('dom-ready', async () => {
    const resource = currentRes, wc = resView.webContents, navigation = resourceNavigation;
    if (!resource?.wordLength || wc.isDestroyed()) return;
    let actual, expected;
    try { actual = new URL(wc.getURL()); expected = new URL(resource.url); } catch { return; }
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) { finishResourceFailure(); return; }
    try {
      const data = await wordData.load(resource.sourceUrl, resource.wordLength, { refresh: resource.refreshWordList === true });
      if (currentRes !== resource || navigation !== resourceNavigation || wc.isDestroyed()) return;
      resource.refreshWordList = false;
      const anchor = resourceAnchor;
      const method = typeof anchor === 'object' ? 'centreClue' : 'centrePrefix';
      const restored = wordListResults.forLength(resource.wordLength);
      // A packaged, network-free document creates only the visible rows. The
      // full dictionary stays in an indexed array, never a full DOM tree.
      const result = await wc.mainFrame.executeJavaScript(`(async()=>{
        if(location.href.split('#')[0]!==${JSON.stringify(resource.url)}||!window.BabbleWordList)return null;
        window.BabbleWordList.start(${JSON.stringify({ words: data.words, length: resource.wordLength, stale: data.stale })});
        const list=window.__babbleExpertWordList;
        list.restoreResults(${JSON.stringify(restored)},true);
        const match=${anchor ? `list.${method}(${JSON.stringify(anchor)})` : 'null'};
        await new Promise(resolve=>setTimeout(resolve,0));
        return {match};
      })()`, false);
      if (currentRes !== resource || navigation !== resourceNavigation) return;
      if (!result) throw new Error('Word list unavailable');
      if (method === 'centreClue' && result.match === '') engine.status(`No word-list match for ${anchor.prefix}${anchor.length} between the solved clues.`);
      // A newer clue click may arrive while the document is being prepared.
      let positioned = anchor;
      while (currentRes === resource && navigation === resourceNavigation && resourceAnchor && resourceAnchor !== positioned) {
        positioned = resourceAnchor;
        await centreResource(wc, positioned);
      }
      if (currentRes !== resource || navigation !== resourceNavigation) return;
      wordListReady = true;
      const latest = wordListResults.forLength(resource.wordLength);
      if (latest.length !== restored.length || latest.some((result, index) => result !== restored[index])) {
        await sendResourceInteraction({ type: 'word-results', results: latest, reset: true });
      }
      if (currentRes !== resource || navigation !== resourceNavigation) return;
      resourceAnchor = ''; resourceState();
    } catch {
      if (currentRes === resource && navigation === resourceNavigation) {
        wc.mainFrame.executeJavaScript('window.BabbleWordList?.fail()', false).catch(() => {});
        setPaneHealth('resources', 'failed'); finishResourceFailure();
      }
    }
  });
  function openResource(r, anchor = '') {
    if (currentRes === experiments.fireworks) stopCelebrationOverlays();
    currentRes = r.wordLength ? { ...r, sourceUrl: r.sourceUrl || r.url, externalUrl: r.sourceUrl || r.url,
      url: wordListViewer + `?length=${r.wordLength}&request=${++wordListGeneration}` }
      : r.local ? { ...r, externalUrl: r.url, url: pathToFileURL(path.join(__dirname, r.local)).href } : r;
    resourceAnchor = anchor;
    wordListReady = false;
    patch({ resW: currentRes.width || Math.max(settings.data.resW, currentRes.minWidth || 380) });
    resourceState(!!currentRes.wordLength);
    loadPage(resView.webContents, currentRes.url);
    if ((!currentRes.wordLength || !wordListNotified) && currentRes.telemetryEvent !== false) {
      if (currentRes.wordLength && settings.data.usageSharing === true) wordListNotified = true;
      telemetry.send(currentRes.telemetryEvent || 'resource', String(currentRes.title || currentRes.label || '').trim());
    }
  }
  async function changeWordLength(delta) {
    const resource = currentRes, wc = resView.webContents;
    const next = RESOURCES.find(item => item.wordLength === resource?.wordLength + delta);
    if (!resource?.wordLength || !next || wordLengthChanging || wc.isDestroyed() || !wordListReady || resourceLoading) return;
    wordLengthChanging = true;
    resourceState(true, `Finding ${next.wordLength}-letter word…`);
    try {
      const anchor = lastClickedResourceWord || await wc.mainFrame.executeJavaScript(`window.__babbleExpertWordList?.middleWord() || ''`, false);
      if (currentRes !== resource || !/^[a-z]{4,12}$/.test(anchor)) return;
      // Keep the same word-list host (also permits local integration fixtures).
      const url = new URL(resource.sourceUrl);
      url.pathname = url.pathname.replace(/words-\d+\.html$/, `words-${next.wordLength}.html`);
      openResource({ ...next, url: url.href }, anchor);
    } finally { wordLengthChanging = false; if (currentRes === resource) resourceState(); }
  }
  function hideResources() {
    stopCelebrationOverlays();
    resourceLoading = false; wordListReady = false;
    currentRes = null; resView.webContents.loadURL('about:blank'); resView.setVisible(false);
    publishClueNavigation();
    send('resources', { open: false });
  }
  function reloadResource(refresh = false) {
    if (!currentRes) return;
    if (currentRes.wordLength) currentRes.refreshWordList = refresh;
    return loadPage(resView.webContents, currentRes.url);
  }

  /* ---------- private device journal ---------- */
  function publishJournal() {
    if (journalWin && !journalWin.isDestroyed()) journalWin.webContents.send('journal:changed', journal.view());
  }
  function showJournal() {
    if (journalWin && !journalWin.isDestroyed()) { journalWin.show(); journalWin.focus(); return; }
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    journalWin = new BrowserWindow({ parent: win, title: 'Personal progress journal', width: Math.min(900, area.width), height: Math.min(760, area.height),
      minWidth: Math.min(460, area.width), minHeight: 400, show: false, backgroundColor: '#f7f6f0',
      webPreferences: { preload: path.join(__dirname, 'preload-journal.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
    journalWin.on('closed', () => { journalWin = null; });
    loadLocal(journalWin, 'journal.html', 'Personal progress journal');
  }
  journalTimer = setInterval(() => { if (journalWin?.isVisible()) publishJournal(); }, 5000);
  ipcMain.handle('journal:get', event => trustedLocal(event, journalWin) ? journal.view() : null);
  ipcMain.handle('journal:enabled', (event, enabled) => {
    if (!trustedLocal(event, journalWin) || typeof enabled !== 'boolean') return null;
    patch({ journalEnabled: enabled }); return journal.view();
  });
  ipcMain.handle('journal:clear', async event => {
    if (!trustedLocal(event, journalWin)) return null;
    const owner = journalWin;
    const answer = await dialog.showMessageBox(owner, { type: 'warning', title: 'Clear personal progress', message: 'Delete all saved progress journal records on this device?',
      detail: 'Your Babble words, clues and settings will stay as they are. Export your journal first if you want to keep a copy.', buttons: ['Cancel', 'Delete journal'], defaultId: 0, cancelId: 0 });
    if (answer.response === 1 && !owner.isDestroyed()) journal.clear();
    return journal.view();
  });
  ipcMain.handle('journal:export', async event => {
    if (!trustedLocal(event, journalWin) || journal.blocked) return null;
    const owner = journalWin;
    const target = await dialog.showSaveDialog(owner, { title: 'Export personal progress', defaultPath: 'babble-progress.csv', filters: [{ name: 'CSV spreadsheet', extensions: ['csv'] }] });
    if (target.canceled || !target.filePath || owner.isDestroyed()) return { message: 'Export cancelled.' };
    try { await fs.promises.writeFile(target.filePath, journal.csv(), { mode: 0o600 }); return { message: 'Journal exported. The copy is saved where you chose.' }; }
    catch { return { error: 'The export could not be saved. Try another folder or check the device’s free space.' }; }
  });

  /* ---------- IPC (only our own two windows may call in) ---------- */
  const trusted = e => trustedLocal(e, win) || trustedLocal(e, addWin) || trustedLocal(e, historyWin);
  ipcMain.on('clues:grab-grid', e => {
    if (e.sender !== cluesView.webContents || e.sender.isDestroyed() || settings.data.clueSource !== 'selfServe') return;
    let actual, expected;
    try { actual = new URL(e.sender.getURL()); expected = new URL(urls.selfServeClues); } catch { return; }
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) return;
    telemetry.send('option', 'Self Serve: Grab Grid');
  });
  ipcMain.on('celebration:preview', e => {
    if (e.sender !== cluesView.webContents || e.sender.isDestroyed() || (e.senderFrame !== e.sender.mainFrame || !allowedPage(e.sender.getURL(), hosts.clues, !app.isPackaged))) return;
    openResource(experiments.fireworks);
  });
  ipcMain.handle('settings:get', e => (trusted(e) ? publicSettings() : null));
  ipcMain.handle('lickety-message:send', async (e, text) => {
    if (!trustedLocal(e, messageWin)) return null;
    if (messageSending) return { ok: false, message: 'Your message is already being sent.' };
    messageSending = true;
    try {
      const since = new Date().toISOString();
      const result = await messenger.send(text);
      if (result.ok && result.usernameLinked === true && text?.rememberUsername === true) {
        const previous = settings.data.usernameLink;
        settings.patch({ usernameLink: { username: text.babbleUsername.trim().normalize('NFC'), since, consentVersion: 1 } });
        if (!settings.flush()) {
          settings.patch({ usernameLink: previous }); settings.flush();
          return { ok: true, usernameLinked: false, message: 'Your message was sent, but Expert could not save the username link on this device. Your previous choice has been kept.' };
        }
        return { ...result, message: `${result.message} Your Babble username is linked for future reports when usage sharing is enabled.` };
      }
      return result;
    } finally { messageSending = false; }
  });
  ipcMain.handle('lickety-message:identity', e => trustedLocal(e, messageWin) ? { username: settings.data.usernameLink?.username || '', usageSharing: settings.data.usageSharing === true } : null);
  ipcMain.handle('lickety-message:unlink', e => {
    if (!trustedLocal(e, messageWin) || messageSending) return null;
    settings.patch({ usernameLink: null });
    if (!settings.flush()) return { ok: false, message: 'Your username is omitted for this session, but Expert could not save the removal. The link may return after restarting; please try again.' };
    return { ok: true, message: 'Username link removed. Future reports will use your generated alias. Already delivered messages are unchanged.' };
  });
  ipcMain.handle('help:release-notes', (e, request) => {
    if (!trustedLocal(e, helpWin)) return null;
    return releaseNotes.get({ online: request?.online === true, refresh: request?.refresh === true });
  });
  ipcMain.handle('help:copy-support', e => {
    if (!trustedLocal(e, helpWin)) return false;
    clipboard.writeText(supportSummary({ version, anonymousId: settings.data.anonymousId, paneHealth, update: updateState, diagnostics: opts.diagnostics?.recent() || [] }));
    return true;
  });
  const trustedZoom = e => trustedLocal(e, zoomWin);
  ipcMain.handle('zoom:get', e => trustedZoom(e) ? { zoom: settings.data.zoom, levels: ZOOM_LEVELS } : null);
  ipcMain.handle('zoom:change', (e, direction) => {
    if (!trustedZoom(e)) return;
    if (direction === 'close') { zoomWin.close(); return; }
    const index = ZOOM_LEVELS.indexOf(settings.data.zoom);
    const zoom = direction === 'in' ? ZOOM_LEVELS[Math.min(index + 1, ZOOM_LEVELS.length - 1)]
      : direction === 'out' ? ZOOM_LEVELS[Math.max(index - 1, 0)] : direction === 'reset' ? 100 : null;
    if (zoom === null) return;
    patch({ zoom });
    telemetry.send('option', `Zoom ${zoom}%`);
  });
  ipcMain.handle('settings:set', (e, p) => { if (trusted(e) && p && typeof p === 'object') patch(p); });
  ipcMain.handle('state:get', e => (trusted(e) ? fullState() : null));
  ipcMain.handle('history:get', e => (trusted(e) ? engine.history : []));
  ipcMain.handle('action', async (e, name, id) => {
    if (!trusted(e)) return;
    switch (name) {
      case 'focusResizeBar':
        if (trustedLocal(e, win) && ['spl1', 'spl2'].includes(id)) mainWc.focus();
        return;
      case 'send': return engine.sendToBabble();
      case 'get': { const r = await engine.getFromBabble(); focusAdd(); return r; }
      case 'refreshBabble': return refreshBabble();
      case 'reloadClues': return reloadClues();
      case 'showHistory': return showHistory();
      case 'showHelp': return showHelp();
      case 'messageLickety': return showMessage();
      case 'openBabble': return shell.openExternal(urls.babble);
      case 'openClues': return shell.openExternal(currentClueSource().url);
      case 'retryResource': return reloadResource(true);
      case 'showJournal': return showJournal();
      case 'showHighlights': return showHighlights();
      case 'checkUpdates': return updateActions.check?.({ manual: true });
      case 'installUpdate': if (updateState.phase === 'ready') return updateActions.install?.(); return;
      case 'downloadUpdate': if (updateState.phase === 'available') return updateActions.download?.(); return;
      case 'releaseNotes': return showHelp('release-notes');
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
      case 'shorterWords': return changeWordLength(-1);
      case 'longerWords': return changeWordLength(1);
      case 'nextClue': return advanceClue();
      case 'previousClue': return advanceClue(-1);
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
  ipcMain.on('add:classify', (e, { text, ctrl } = {}) => { e.returnValue = trusted(e) ? classify(String(text || ''), { ctrl: !!ctrl, ...settings.data.add, gridLetters: engine.state.ready ? engine.state.gridLetters : '' }) : { kind: 'none' }; });
  ipcMain.on('menu', (e, { name, x, y } = {}) => {
    if (!trustedLocal(e, win)) return;
    const tpl = name === 'resources'
      ? resourcesTemplate({ resources: RESOURCES, cheat, open: openResource, hide: hideResources })
      : name === 'clues'
        ? cluesTemplate(settings.data.clueSource, selectClueSource)
        : optionsTemplate(settings.data, patch, { browserTools: browserToolsMenu(), watchTour: () => tour.open(), messageLickety: showMessage, showJournal, showHighlights, open: openResource, experiments, track: item => telemetry.send('option', item), checkUpdates: app.isPackaged ? () => updateActions.check?.({ manual: true }) : null });
    let showZoom = false;
    if (name === 'options') {
      const zoom = tpl.findIndex(item => item.label?.startsWith('Zoom ('));
      if (zoom >= 0) tpl[zoom] = { label: tpl[zoom].label, click: () => { showZoom = true; } };
    }
    const anchorX = Math.round(x) || 0, anchorY = Math.round(y) || 0;
    Menu.buildFromTemplate(tpl).popup({ window: win, x: anchorX, y: anchorY,
      callback: () => { if (showZoom && !win.isDestroyed()) openZoomMenu(anchorX, anchorY); } });
  });
  ipcMain.on('layout', (e, r) => {
    if (!trustedLocal(e, win) || !r) return;
    lastRects = r;
    const place = (v, rect) => {
      if (!rectOk(rect)) { if (v.getVisible()) v.setVisible(false); return; }
      const bounds = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
      const previous = v.getBounds();
      if (Object.keys(bounds).some(key => bounds[key] !== previous[key])) v.setBounds(bounds);
      const visible = v !== resView || !resourceLoading;
      if (v.getVisible() !== visible) v.setVisible(visible);
    };
    place(cluesView, r.clues); place(babbleView, r.babble); place(resView, r.res);
  });

  return { win, tour, hints, engine, settings, telemetry, journal, showJournal, getJournalWindow: () => journalWin, getHighlightsWindow: () => highlightsWin, views: { clues: cluesView, babble: babbleView, res: resView }, experiments, openZoomMenu, sendResourceInteraction, getAddWindow: () => addWin, setAddVisible, selectClueSource, refreshBabble, openResource, hideResources, prepareForUpdate, setUpdateState, setUpdateActions, patch, urls };
}

module.exports = { createApp, DEFAULTS };
