'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Small, local-only diagnostics. Never record launch arguments, page contents or URLs.
function createStartupLog(userDataDir) {
  const file = path.join(userDataDir, 'startup.log');
  const write = (event, detail = '') => {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > 128 * 1024) {
        fs.copyFileSync(file, file + '.previous');
        fs.truncateSync(file, 0);
      }
      fs.appendFileSync(file, `${new Date().toISOString()} ${event} ${String(detail).replace(/[\r\n]/g, ' ').slice(0, 1000)}\n`);
    } catch { /* An unwritable log must never prevent launch. */ }
  };
  return { file, write };
}

function revealWindow(win) {
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  // A modal child may be the reason the main window cannot accept input.
  for (const child of win.getChildWindows()) {
    if (!child.isDestroyed() && child.isVisible() && child.isModal()) child.focus();
  }
  return true;
}

// Install before whenReady: several shortcut clicks during boot become one
// pending activation, never another createApp(), reload or duplicated prompt.
function handleLaunches(app, log = () => {}) {
  let win = null, pending = false, stopping = false;
  const activate = () => {
    if (stopping) return;
    log('activation');
    if (!revealWindow(win)) pending = true;
  };
  app.on('second-instance', activate);
  app.on('activate', activate);
  app.on('before-quit', () => { stopping = true; pending = false; });
  return {
    attach(window) {
      win = window;
      if (pending && !stopping) { pending = false; revealWindow(win); }
    }
  };
}

function guardStartupWindow(win, { log = () => {}, onFailure, timeoutMs = 60000 }) {
  const wc = win.webContents;
  let finished = false, failed = false, closed = false;
  const fail = reason => {
    if (failed || closed || win.isDestroyed()) return;
    failed = true;
    clearTimeout(timer);
    log('window-failed', reason);
    onFailure(new Error(reason));
  };
  const timer = setTimeout(() => fail('The main window did not finish loading within 60 seconds.'), timeoutMs);
  timer.unref?.();
  wc.once('did-finish-load', () => {
    finished = true;
    clearTimeout(timer);
    log('window-loaded');
  });
  wc.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) fail(`The main window could not load (code ${code}).`);
  });
  wc.on('render-process-gone', (_event, details) => fail(`The main window stopped (${details.reason}, code ${details.exitCode}).`));
  wc.on('unresponsive', () => log('window-unresponsive', finished ? 'after loading' : 'during startup'));
  wc.on('responsive', () => log('window-responsive'));
  win.once('closed', () => { closed = true; clearTimeout(timer); });
  // Do not wait for ready-to-show: a slow or failed first paint must not leave
  // an invisible process holding the single-instance lock.
  revealWindow(win);
  log('window-shown');
  return { fail };
}

module.exports = { createStartupLog, revealWindow, handleLaunches, guardStartupWindow };
