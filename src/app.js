'use strict';
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, shell, screen } = require('electron');
const { Engine, classify } = require('./engine');
const { makePages } = require('./pages');
const { Settings } = require('./settings');
const { resourcesTemplate, cluesTemplate, optionsTemplate } = require('./menus');
const RESOURCES = require('./resources');

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
  const clueSources = {
    lickety: { label: "Lickety's Clues", url: urls.clues },
    selfServe: { label: 'Self Serve Clues', url: urls.selfServeClues }
  };
  const currentClueSource = () => clueSources[settings.data.clueSource] || clueSources.lickety;
  let quitting = false, lastRects = null, addWin = null, restoredAdd = false, currentRes = null;
  app.on('before-quit', () => { quitting = true; });

  /* ---------- main window ---------- */
  const saved = settings.data.window;
  const visibleSaved = saved && screen.getAllDisplays().some(d => {
    const b = d.workArea; return saved.x != null && saved.x + 50 < b.x + b.width && saved.x + saved.width - 50 > b.x && saved.y >= b.y - 10 && saved.y < b.y + b.height - 50;
  });
  const win = new BrowserWindow({
    title, width: (saved && saved.width) || 1280, height: (saved && saved.height) || 800,
    ...(visibleSaved ? { x: saved.x, y: saved.y } : {}),
    minWidth: 760, minHeight: 420, show: false, backgroundColor: '#f0f0f0',
    webPreferences: { preload: path.join(__dirname, 'preload-main.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  // Keep the WebContents reference: reading win.webContents after the BrowserWindow has
  // been destroyed throws, while late renderer IPC can still be delivered during teardown.
  const mainWc = win.webContents;
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', e => e.preventDefault());
  if (!saved || saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => {
    const b = win.getNormalBounds();
    settings.setWindow({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() });
    settings.flush();
  });
  win.on('closed', () => { clearInterval(timer); app.quit(); });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWc.setVisualZoomLevelLimits(1, 1);

  /* ---------- the two web pages (+ optional resources pane) ---------- */
  const mkView = partition => new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
  const cluesView = mkView('persist:babble');          // same cookie jar as Babble: logins stick
  const babbleView = mkView('persist:babble');
  const resView = mkView('persist:resources');
  for (const v of [cluesView, babbleView, resView]) { win.contentView.addChildView(v); v.setVisible(false); }

  function guard(wc, sameSiteHosts) {
    wc.setWindowOpenHandler(({ url }) => {
      if (isHttp(url)) { if (sameSiteHosts && sameSiteHosts.includes(hostOf(url))) wc.loadURL(url); else shell.openExternal(url); }
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => { if (!isHttp(url)) e.preventDefault(); });
    wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 || wc.isDestroyed()) return;       // -3 = cancelled by a newer navigation
      const msg = `<body style="font:14px sans-serif;padding:24px"><h3>Couldn't load this page</h3><p>${desc.replace(/[<&]/g, '')}</p><p>Check your connection, then press Refresh.</p></body>`;
      wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(msg));
    });
  }
  guard(babbleView.webContents, hosts.babble); guard(cluesView.webContents, hosts.clues); guard(resView.webContents, null);

  const refreshBabble = () => babbleView.webContents.loadURL(urls.babble);   // Delphi recreated the browser; reloading is equivalent
  async function reloadClues() {
    const { response } = await dialog.showMessageBox(win, { type: 'question', buttons: ['Reload', 'Cancel'], defaultId: 1, cancelId: 1, message: 'Reload the Clues page?', detail: 'Words you have ticked on it may be lost.' });
    if (response === 0) cluesView.webContents.loadURL(currentClueSource().url);
  }
  function selectClueSource(source) {
    if (!clueSources[source] || source === settings.data.clueSource) return;
    patch({ clueSource: source });
    cluesView.webContents.loadURL(clueSources[source].url);
    engine.status(`Switched to ${clueSources[source].label}`);
  }
  // F5 / Ctrl+R / Cmd+R: Babble reloads the way the Delphi OnRefresh hook did; Clues asks first
  babbleView.webContents.on('before-input-event', (e, i) => { if (isReloadKey(i)) { e.preventDefault(); refreshBabble(); } });
  cluesView.webContents.on('before-input-event', (e, i) => { if (isReloadKey(i)) { e.preventDefault(); reloadClues(); } });
  refreshBabble(); cluesView.webContents.loadURL(currentClueSource().url);

  /* ---------- the brain ---------- */
  const pages = makePages({ getBabble: () => babbleView.webContents, getClues: () => cluesView.webContents, babbleHosts: hosts.babble, cluesHosts: hosts.clues });
  const engine = new Engine({ pages, getAddOptions: () => settings.data.add, pace: opts.pace === undefined ? 100 : opts.pace });
  const timer = setInterval(() => engine.tick().catch(() => {}), opts.tickMs || 1000);
  engine.tick().catch(() => {});

  const uis = () => {
    const list = [];
    if (!mainWc.isDestroyed()) list.push(mainWc);
    if (addWin && !addWin.isDestroyed()) {
      const addWc = addWin.webContents;
      if (!addWc.isDestroyed()) list.push(addWc);
    }
    return list;
  };
  const send = (ch, payload) => uis().forEach(wc => { if (!wc.isDestroyed()) wc.send(ch, payload); });
  const fullState = () => ({ ...engine.state, canSend: engine.canSend });
  engine.on('state', () => {
    send('state', fullState());
    if (!restoredAdd && engine.state.ready && settings.data.add.visible) { restoredAdd = true; setAddVisible(true); }   // like fShowAdd in the Delphi code
  });
  engine.on('status', t => send('status', t));
  engine.on('progress', p => send('progress', p));
  const publicSettings = () => JSON.parse(JSON.stringify({ ...settings.data, window: undefined }));
  const patch = p => { if (settings.patch(p)) send('settings', publicSettings()); };

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
      webPreferences: { preload: path.join(__dirname, 'preload-add.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
    });
    addWin.setAlwaysOnTop(true, 'floating');
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

  /* ---------- resources pane ---------- */
  function openResource(r) {
    currentRes = r.url;
    patch({ resW: r.width || Math.max(settings.data.resW, r.minWidth || 380) });
    resView.webContents.loadURL(r.url);
    send('resources', { open: true, title: r.label });
  }
  function hideResources() {
    currentRes = null; resView.webContents.loadURL('about:blank'); resView.setVisible(false);
    send('resources', { open: false });
  }

  /* ---------- IPC (only our own two windows may call in) ---------- */
  const trusted = e => e.sender === mainWc || (addWin && !addWin.isDestroyed() && e.sender === addWin.webContents);
  ipcMain.handle('settings:get', e => (trusted(e) ? publicSettings() : null));
  ipcMain.handle('settings:set', (e, p) => { if (trusted(e) && p && typeof p === 'object') patch(p); });
  ipcMain.handle('state:get', e => (trusted(e) ? fullState() : null));
  ipcMain.handle('action', async (e, name) => {
    if (!trusted(e)) return;
    switch (name) {
      case 'send': return engine.sendToBabble();
      case 'get': { const r = await engine.getFromBabble(); focusAdd(); return r; }
      case 'refreshBabble': return refreshBabble();
      case 'reloadClues': return reloadClues();
      case 'toggleAdd': return setAddVisible(!(addWin && !addWin.isDestroyed() && addWin.isVisible()));
      case 'closeAdd': return setAddVisible(false);
      case 'hideResources': return hideResources();
      case 'openResourceExternal': if (currentRes) shell.openExternal(currentRes); return;
    }
  });
  ipcMain.handle('add:submit', (e, { text, ctrl } = {}) => (trusted(e) ? engine.submit(String(text || ''), !!ctrl) : null));
  ipcMain.on('add:classify', (e, { text, ctrl } = {}) => { e.returnValue = trusted(e) ? classify(String(text || ''), { ctrl: !!ctrl, ...settings.data.add }) : { kind: 'none' }; });
  ipcMain.on('menu', (e, { name, x, y } = {}) => {
    if (e.sender !== mainWc || mainWc.isDestroyed() || win.isDestroyed()) return;
    const tpl = name === 'resources'
      ? resourcesTemplate({ resources: RESOURCES, cheat, open: openResource, hide: hideResources })
      : name === 'clues'
        ? cluesTemplate(settings.data.clueSource, selectClueSource)
        : optionsTemplate(settings.data, patch);
    Menu.buildFromTemplate(tpl).popup({ window: win, x: Math.round(x) || 0, y: Math.round(y) || 0 });
  });
  ipcMain.on('layout', (e, r) => {
    if (e.sender !== mainWc || mainWc.isDestroyed() || win.isDestroyed() || !r) return;
    lastRects = r;
    const place = (v, rect) => { if (!rectOk(rect)) { v.setVisible(false); return; } v.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }); v.setVisible(true); };
    place(cluesView, r.clues); place(babbleView, r.babble); place(resView, r.res);
  });

  return { win, engine, settings, views: { clues: cluesView, babble: babbleView, res: resView }, getAddWindow: () => addWin, setAddVisible, refreshBabble, openResource, hideResources, patch, urls };
}

module.exports = { createApp, DEFAULTS };
