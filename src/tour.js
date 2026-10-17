'use strict';
const path = require('node:path');
const TOUR_VERSION = 2;
function createTourController({ BrowserWindow, ipcMain, parent, settings, enabled = true, canOpen = () => false }) {
  let window = null, launch = { offer: false };
  const trusted = event => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  function open({ offer = false } = {}) {
    if (parent.isDestroyed()) return;
    if (window && !window.isDestroyed()) { window.show(); window.focus(); return window; }
    launch = { offer };
    settings.patch({ tourPromptVersion: TOUR_VERSION }); settings.flush();
    window = new BrowserWindow({ parent, width: 1320, height: 920, minWidth: 960, minHeight: 680, show: false,
      title: 'A day in Babble Expert', backgroundColor: '#101b20', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload-tour.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
    const current = window;
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    current.webContents.on('will-navigate', event => event.preventDefault());
    current.once('ready-to-show', () => { if (!current.isDestroyed()) { current.maximize?.(); current.show(); current.focus(); } });
    current.on('closed', () => { if (window === current) window = null; });
    current.loadFile(path.join(__dirname, 'tour', 'index.html'));
    return current;
  }
  ipcMain.handle('tour:launch', event => trusted(event) ? launch : null);
  ipcMain.on('tour:action', (event, action) => {
    if (!trusted(event)) return;
    if (action === 'close') window.close();
    if (action === 'completed') { settings.patch({ tourCompletedVersion: TOUR_VERSION }); settings.flush(); }
  });
  ipcMain.on('tour:open', event => { if (canOpen(event)) open(); });
  return { open, getWindow: () => window, consider(state) {
    if (enabled && state?.ready && state.puzzleId && settings.data.tourPromptVersion < TOUR_VERSION) open({ offer: true });
  } };
}
module.exports = { createTourController, TOUR_VERSION };
