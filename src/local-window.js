'use strict';
const { pathToFileURL } = require('node:url');
const { revealWindow } = require('./startup');
const { watchPageDiagnostics, exceptionDetails } = require('./diagnostics');
const documents = new WeakMap();
const documentURL = value => { try { const u = new URL(value); u.search = ''; u.hash = ''; return u.href; } catch { return ''; } };
function rememberLocalWindow(win, file) { documents.set(win, pathToFileURL(file).href); }
function trustedLocal(event, win) {
  return !!win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame
    && documentURL(win.webContents.getURL()) === documents.get(win);
}
function loadLocalWindow(win, file, { parent, label = 'This window', diagnostic = () => {}, onError = () => {}, show = true, timeoutMs = 60000, query } = {}) {
  rememberLocalWindow(win, file);
  const wc = win.webContents;
  let done = false, failed = false;
  const fail = () => {
    if (failed || win.isDestroyed()) return;
    failed = true; clearTimeout(timer); win.destroy();
    if (parent && !parent.isDestroyed()) revealWindow(parent);
    void Promise.resolve().then(() => onError(label)).catch(() => {});
  };
  const timer = setTimeout(() => { if (!done && !win.isDestroyed()) { diagnostic('load-failed', { component: 'auxiliary', reason: 'timeout', code: 'ERR_AUXILIARY_TIMEOUT' }); fail(); } }, timeoutMs);
  timer.unref?.();
  watchPageDiagnostics(wc, 'auxiliary', diagnostic, { slowMs: 10000 });
  wc.once('did-finish-load', () => { done = true; clearTimeout(timer); });
  wc.on('did-fail-load', (_e, code, _desc, _url, main) => { if (main && code !== -3) fail(); });
  wc.on('render-process-gone', fail);
  wc.on('will-navigate', event => event.preventDefault());
  // All external destinations must be handled explicitly by a feature.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('closed', () => clearTimeout(timer));
  if (show) revealWindow(win);
  try { Promise.resolve(win.loadFile(file, query ? { query } : undefined)).catch(error => { if (!win.isDestroyed()) { diagnostic('load-failed', { component: 'auxiliary', reason: 'exception', ...exceptionDetails(error) }); fail(); } }); }
  catch (error) { diagnostic('load-failed', { component: 'auxiliary', reason: 'exception', ...exceptionDetails(error) }); fail(); }
  return win;
}
module.exports = { loadLocalWindow, trustedLocal, rememberLocalWindow };
