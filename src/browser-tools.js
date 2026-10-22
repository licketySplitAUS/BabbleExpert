'use strict';

function canonicalBabbleUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) ||
        !['playbabble.com', 'www.playbabble.com'].includes(url.hostname) || url.port || url.username || url.password) return value;
    url.protocol = 'https:';
    url.hostname = 'playbabble.com';
    return url.href;
  } catch { return value; }
}

function httpOrigin(value) {
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.origin : null; }
  catch { return null; }
}

// Remove cookies individually: Electron's origin-filtered cookie clearing also
// deletes sibling subdomains (e.g. both clue sources under r46.me).
async function resetSiteData(wc, origin) {
  const hostname = new URL(origin).hostname;
  const cookies = await wc.session.cookies.get({});
  await wc.session.clearData({ origins: [origin], originMatchingMode: 'origin-in-all-contexts',
    dataTypes: ['backgroundFetch', 'cache', 'fileSystems', 'indexedDB', 'localStorage', 'serviceWorkers', 'webSQL'] });
  for (const cookie of cookies) {
    const domain = cookie.domain.replace(/^\./, '');
    if (hostname !== domain && (cookie.hostOnly || !hostname.endsWith('.' + domain))) continue;
    await wc.session.cookies.remove(`${cookie.secure ? 'https' : 'http'}://${hostname}${cookie.path || '/'}`, cookie.name);
  }
  if (!wc.isDestroyed() && httpOrigin(wc.getURL()) === origin) {
    await wc.executeJavaScript('sessionStorage.clear()', false);
  }
  await wc.session.cookies.flushStore();
}

function browserToolsTemplate({ panes, dialog, win, status }) {
  return panes.map(pane => {
    const wc = pane.wc;
    const origin = httpOrigin(wc.getURL());
    const run = action => () => Promise.resolve().then(action).catch(() => status(`${pane.label}: browser action failed. Please try again.`));
    const reload = ignoreCache => pane.reload ? pane.reload(ignoreCache) : ignoreCache ? wc.reloadIgnoringCache() : wc.reload();
    return { label: pane.label, submenu: [
      { label: `Return to ${pane.label}`, enabled: !!pane.home, click: run(() => pane.home()) },
      { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: run(() => { if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); }) },
      { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: run(() => { if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); }) },
      { type: 'separator' },
      { label: 'Reload current page', click: run(() => reload(false)) },
      { label: 'Reload current page ignoring cache', click: run(() => reload(true)) },
      { label: 'Clear cached files (keep logins)', click: run(async () => {
        await wc.session.clearCache();
        status(`${pane.label}: cached files cleared for ${pane.sessionLabel}. Login cookies kept.`);
      }) },
      { label: 'Reset this site’s login and data…', enabled: !!origin, click: run(async () => {
        const { response } = await dialog.showMessageBox(win, { type: 'warning', title: 'Reset site data',
          message: `Reset login and saved data for ${origin}?`,
          detail: 'This signs you out and removes this site’s saved browser data, including locally saved clue progress. Cookies shared with subdomains may also be removed. Expert settings and other sites’ separate data are kept.',
          buttons: ['Cancel', 'Reset site data'], defaultId: 0, cancelId: 0, noLink: true });
        if (response !== 1) return;
        if (wc.isDestroyed() || httpOrigin(wc.getURL()) !== origin) { status('The page changed. Reopen Browser tools to reset the current site.'); return; }
        wc.stop();
        await resetSiteData(wc, origin);
        wc.reloadIgnoringCache();
        status(`${pane.label}: site data reset. Sign in again if needed.`);
      }) },
      { type: 'separator' },
      { label: 'Page and session information', click: run(() => dialog.showMessageBox(win, { type: 'info', title: `${pane.label} page information`,
        message: pane.label,
        detail: `Address: ${wc.getURL()}\n\nSession: ${pane.sessionLabel}\nPersistent storage: ${wc.session.isPersistent() ? 'Yes' : 'No'}\n\nExpert’s logins are separate from Chrome, Edge and other browsers. Websites control login expiry. Expert does not save passwords. Clearing cached files keeps login cookies; resetting site data removes them.`,
        buttons: ['OK'] })) }
    ] };
  });
}

module.exports = { canonicalBabbleUrl, httpOrigin, resetSiteData, browserToolsTemplate };
