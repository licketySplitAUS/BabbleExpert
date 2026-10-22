'use strict';
const path = require('node:path');
const { trustedLocal } = require('./local-window');

// One reusable, click-through caption above native embedded browser views.
function createHints({ BrowserWindow, ipcMain, screen, parent, getOwners, enabled }) {
  let popup = null, owner = null, ownerContents = null, pending = null, ready = false, loadTimer = null, stopped = false;
  const watched = new WeakSet();
  const hide = () => { pending = null; if (popup && !popup.isDestroyed()) popup.hide(); };
  const dismiss = () => {
    hide();
    // BrowserWindow.webContents can become null before isDestroyed() turns true.
    // Keep the original WebContents reference and never send into its teardown.
    if (ownerContents && !ownerContents.isDestroyed()) ownerContents.send('hint-dismiss');
  };
  function watch(win) {
    if (watched.has(win)) return;
    watched.add(win);
    const contents = win.webContents;
    for (const event of ['blur', 'move', 'resize', 'minimize', 'hide']) win.on(event, dismiss);
    const forget = () => {
      if (owner === win) { owner = null; ownerContents = null; hide(); }
    };
    win.once('closed', forget);
    contents.once('destroyed', forget);
    contents.on('blur', dismiss);
    contents.on('before-input-event', (_event, input) => { if (input.type === 'keyDown') dismiss(); });
  }
  function display() {
    if (stopped || !pending || !ready || !popup || popup.isDestroyed() || !owner || owner.isDestroyed() || !ownerContents || ownerContents.isDestroyed() || !owner.isVisible() || !owner.isFocused() || !enabled()) return hide();
    const { text, rect, large } = pending;
    const bounds = owner.getContentBounds();
    const area = screen.getDisplayMatching(owner.getBounds()).workArea;
    const width = Math.min(large ? 380 : 340, area.width - 16);
    const characters = Math.max(1, Math.floor((width - 50) / (large ? 12 : 10)));
    const lines = text.split('\n').reduce((total, line) => total + Math.ceil(line.length / characters), 0) + 1;
    const height = Math.min(area.height - 16, 48 + lines * (large ? 27 : 23));
    const centre = bounds.x + rect.x + rect.width / 2;
    const x = Math.round(Math.max(area.x + 8, Math.min(centre - width / 2, area.x + area.width - width - 8)));
    const below = bounds.y + rect.y + rect.height + 5;
    const above = below + height > area.y + area.height - 8;
    const y = Math.round(above ? Math.max(area.y + 8, bounds.y + rect.y - height - 5) : below);
    popup.setParentWindow(owner);
    popup.setBounds({ x, y, width, height });
    popup.webContents.send('hint:content', { text, large, above, arrow: Math.max(22, Math.min(width - 22, centre - x)) });
    popup.showInactive();
  }
  function ensure() {
    if (stopped) return;
    if (popup && !popup.isDestroyed()) return;
    ready = false;
    popup = new BrowserWindow({ parent, title: 'Helpful hint', width: 340, height: 112,
      type: 'tooltip', frame: false, transparent: true, hasShadow: false, show: false,
      focusable: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
      webPreferences: { preload: path.join(__dirname, 'preload-hint.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
    });
    const current = popup;
    current.setIgnoreMouseEvents(true, { forward: true });
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    current.webContents.on('will-navigate', event => event.preventDefault());
    const destroy = () => { if (!current.isDestroyed()) current.destroy(); };
    loadTimer = setTimeout(destroy, 5000); loadTimer.unref?.();
    current.webContents.once('did-finish-load', () => { clearTimeout(loadTimer); ready = true; display(); });
    current.webContents.on('render-process-gone', destroy);
    current.webContents.on('did-fail-load', (_event, code, _description, _url, main) => { if (main && code !== -3) destroy(); });
    current.once('closed', () => { clearTimeout(loadTimer); if (popup === current) { popup = null; ready = false; pending = null; } });
    current.loadFile(path.join(__dirname, 'ui', 'hint.html')).catch(destroy);
  }
  function receive(event, data) {
    if (stopped) return;
    const win = getOwners().find(candidate => trustedLocal(event, candidate));
    if (!win) return;
    if (!data) { if (owner === win) hide(); return; }
    const rect = data.rect;
    const bounds = win.getContentBounds();
    if (!enabled() || !win.isFocused() || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 400
      || !rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]))
      || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > bounds.width + 2 || rect.y + rect.height > bounds.height + 2) return;
    owner = win; ownerContents = event.sender; watch(win);
    pending = { text: data.text, rect, large: data.large === true };
    ensure(); if (ready) display();
  }
  ipcMain.on('hint', receive);
  parent.once('closed', () => {
    stopped = true; owner = null; ownerContents = null;
    ipcMain.removeListener('hint', receive); hide();
    if (popup && !popup.isDestroyed()) popup.destroy();
  });
  return { hide: dismiss, getWindow: () => popup };
}
module.exports = { createHints };
