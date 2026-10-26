'use strict';

// Retry only GET navigations explicitly opened by Expert. Never replay a form,
// word submission or chat message, and never reload a merely slow/frozen page.
const TRANSIENT = new Set([-7, -21, -100, -101, -102, -104, -105, -106, -109, -118, -324]);
function createPageRecovery(wc, { onState = () => {}, retryDelays = [2000, 6000] } = {}) {
  let target = '', expected = '', attempts = 0, timer = null, failed = false, disposed = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const show = retrying => {
    const text = retrying ? 'Reconnecting…' : 'This page could not load';
    const detail = retrying ? 'Please wait a moment while Expert tries again.' : 'Check your connection, then use Refresh or Retry above to try again.';
    void wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="font:14px sans-serif;padding:24px;color:#333"><h3>${text}</h3><p>${detail}</p></body>`)).catch(() => {});
  };
  const navigate = () => {
    expected = target;
    return wc.loadURL(target).catch(() => {}); // did-fail-load owns recovery
  };
  wc.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
    if (!mainFrame || inPlace || url.startsWith('data:')) return;
    cancel(); failed = false;
    if (url !== expected) { target = ''; attempts = 0; }
    expected = '';
    onState('loading');
  });
  wc.on('did-fail-load', (_event, code, _description, url, mainFrame) => {
    if (!mainFrame || code === -3 || url.startsWith('data:') || disposed || wc.isDestroyed()) return;
    // Ignore late failures from a navigation that has already been replaced.
    if (target && url !== target) return;
    cancel(); failed = true;
    const retry = target && TRANSIENT.has(code) && attempts < retryDelays.length;
    onState(retry ? 'loading' : 'failed');
    show(retry);
    if (retry) {
      timer = setTimeout(() => {
        timer = null;
        if (!disposed && !wc.isDestroyed()) void navigate();
      }, retryDelays[attempts++]);
      timer.unref?.();
    }
  });
  // Redirects may change the request method. Let their failures offer a manual
  // refresh rather than replaying the original request automatically.
  wc.on('did-redirect-navigation', (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) { cancel(); target = ''; expected = ''; }
  });
  wc.on('did-finish-load', () => {
    if (wc.getURL().startsWith('data:') || failed) return;
    cancel(); target = ''; attempts = 0;
    if (/^(https?:|file:)/.test(wc.getURL())) onState('ready');
  });
  wc.on('render-process-gone', () => { cancel(); target = ''; failed = true; onState('crashed'); });
  const dispose = () => { disposed = true; cancel(); target = ''; };
  wc.once('destroyed', dispose);
  return {
    load(url) {
      cancel(); target = /^https?:/.test(url) ? url : ''; attempts = 0; failed = false;
      expected = url;
      return wc.loadURL(url).catch(() => {});
    },
    dispose
  };
}
module.exports = { createPageRecovery };
