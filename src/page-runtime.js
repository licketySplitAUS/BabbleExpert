'use strict';
function allowedPage(url, hosts, allowLocal = false) {
  try {
    const u = new URL(url);
    if (!hosts.includes(u.hostname) || u.username || u.password) return false;
    if (allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return /^https?:$/.test(u.protocol);
    return u.protocol === 'https:' && !u.port;
  } catch { return false; }
}

function executeBounded(wc, code, { timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const initialURL = wc.getURL();
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      for (const [event, handler] of listeners) wc.removeListener?.(event, handler);
      error ? reject(error) : resolve(value);
    };
    const failure = (message, code) => finish(Object.assign(new Error(message), { code }));
    const listeners = [
      ['destroyed', () => failure('Page closed before the operation could be confirmed.', 'ERR_PAGE_CHANGED')],
      ['render-process-gone', () => failure('Page stopped before the operation could be confirmed.', 'ERR_PAGE_CHANGED')],
      ['did-start-navigation', (_e, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) failure('Page changed before the operation could be confirmed.', 'ERR_PAGE_CHANGED'); }]
    ];
    const timer = setTimeout(() => failure('Page operation timed out. Check the page before retrying.', 'ERR_PAGE_TIMEOUT'), timeoutMs);
    for (const [event, handler] of listeners) wc.on?.(event, handler);
    try {
      Promise.resolve(wc.executeJavaScript(code, false)).then(value => {
        if (wc.isDestroyed() || wc.getURL().split('#')[0] !== initialURL.split('#')[0]) failure('Page changed before the operation could be confirmed.', 'ERR_PAGE_CHANGED');
        else finish(null, value);
      }, error => finish(error));
    } catch (error) { finish(error); }
  });
}
module.exports = { allowedPage, executeBounded };
