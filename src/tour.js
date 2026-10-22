'use strict';
const path = require('node:path');
const { revealWindow } = require('./startup');
const { watchPageDiagnostics } = require('./diagnostics');
const TOUR_VERSION = 2;
function createTourController({ BrowserWindow, ipcMain, parent, settings, canOpen = () => false,
  diagnostic = () => {}, onError = () => {}, getWorkArea = () => null, timeoutMs = 60000 }) {
  let window = null, launch = { offer: false };
  const trusted = event => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  function open({ offer = false } = {}) {
    if (parent.isDestroyed()) return;
    if (window && !window.isDestroyed()) { revealWindow(window); return window; }
    launch = { offer };
    settings.patch({ tourPromptVersion: TOUR_VERSION }); settings.flush();
    try {
      const area = getWorkArea();
      const width = area ? Math.min(1320, area.width) : 1320;
      const height = area ? Math.min(920, area.height) : 920;
      window = new BrowserWindow({ parent, width, height, minWidth: Math.min(960, width), minHeight: Math.min(680, height), show: false,
      ...(area ? { x: area.x + Math.floor((area.width - width) / 2), y: area.y + Math.floor((area.height - height) / 2) } : {}),
      title: 'A day in Babble Expert', backgroundColor: '#101b20', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload-tour.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
    } catch {
      diagnostic('load-failed', { component: 'tour', reason: 'exception' });
      if (!parent.isDestroyed()) revealWindow(parent);
      void Promise.resolve().then(() => onError()).catch(() => {});
      return;
    }
    const current = window;
    let failed = false;
    const timer = setTimeout(() => {
      if (current.isDestroyed() || window !== current) return;
      diagnostic('load-failed', { component: 'tour', reason: 'timeout', elapsedMs: timeoutMs });
      fail();
    }, timeoutMs);
    timer.unref?.();
    const fail = () => {
      if (failed || current.isDestroyed() || window !== current) return;
      failed = true;
      clearTimeout(timer);
      current.destroy();
      if (!parent.isDestroyed()) {
        revealWindow(parent);
        void Promise.resolve().then(() => onError()).catch(() => {});
      }
    };
    watchPageDiagnostics(current.webContents, 'tour', diagnostic, { slowMs: 10000 });
    current.webContents.once('did-finish-load', () => clearTimeout(timer));
    current.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) fail(); });
    current.webContents.on('render-process-gone', fail);
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    current.webContents.on('will-navigate', event => event.preventDefault());
    current.on('closed', () => { clearTimeout(timer); if (window === current) window = null; });
    revealWindow(current);
    try {
      Promise.resolve(current.loadFile(path.join(__dirname, 'tour', 'index.html'))).catch(() => {
        if (window !== current || current.isDestroyed()) return;
        diagnostic('load-failed', { component: 'tour' });
        fail();
      });
    } catch {
      diagnostic('load-failed', { component: 'tour', reason: 'exception' });
      fail();
    }
    return current;
  }
  ipcMain.handle('tour:launch', event => trusted(event) ? launch : null);
  ipcMain.on('tour:action', (event, action) => {
    if (!trusted(event)) return;
    if (action === 'close') window.close();
    if (action === 'completed') { settings.patch({ tourCompletedVersion: TOUR_VERSION }); settings.flush(); }
  });
  ipcMain.on('tour:open', event => { if (canOpen(event)) open(); });
  // Manual entry points only. Loading a puzzle or upgrading must never open it.
  return { open, getWindow: () => window };
}
module.exports = { createTourController, TOUR_VERSION };
