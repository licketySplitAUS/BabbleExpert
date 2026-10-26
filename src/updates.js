'use strict';
const { withDeadline } = require('./async');
const { updateErrorCode } = require('./diagnostics');

const RELEASE_API = 'https://api.github.com/repos/licketySplitAUS/BabbleExpert/releases/latest';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const retryableUpdateError = code => /^(?:ERR_HTTP_(?:408|429|5\d\d)|ERR_(?:NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_TIMED_OUT|CONNECTION_RESET|CONNECTION_REFUSED|NETWORK_CHANGED|UPDATE_ABORTED)|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ENETUNREACH)$/.test(code);

function versionNumbers(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:\.\d+)?$/i);
  return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(candidate, current) {
  const next = versionNumbers(candidate), installed = versionNumbers(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== installed[i]) return next[i] > installed[i];
  }
  return false;
}

// Local launch tracking is independent of optional usage sharing. Old installs
// with no recorded version get a truthful "running" notice, not a false upgrade.
function recordLaunchVersion(settings, version) {
  if (!versionNumbers(version)) return null;
  const previous = settings.data.lastRunVersion || settings.data.telemetryVersion;
  const sameVersion = previous && !isNewerVersion(version, previous) && !isNewerVersion(previous, version);
  settings.patch({ lastRunVersion: version });
  settings.flush();
  if (sameVersion) return null;
  return { version, updated: !!previous && isNewerVersion(version, previous) };
}

async function latestRelease(fetchImpl, { signal, timeoutMs = 7000 } = {}) {
  return withDeadline(async requestSignal => {
  const response = await fetchImpl(RELEASE_API, {
    signal: requestSignal,
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Babble-Expert-Updater' },
    cache: 'no-store'
  });
  if (!response.ok) throw Object.assign(new Error(`GitHub returned ${response.status}`), { statusCode: response.status });
  return response.json();
  }, timeoutMs, signal);
}

function macDownloadUrl(release) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  const dmg = assets.find(asset => asset && asset.name === 'BabbleExpert-macOS.dmg')
    || assets.find(asset => asset && /\.dmg$/i.test(asset.name || ''));
  return (dmg && dmg.browser_download_url) || (release && release.html_url) || '';
}

async function checkMacForUpdate({ app, dialog, shell, win, fetchImpl = globalThis.fetch, promptedVersions = new Set(), onAvailable = () => {}, signal, timeoutMs }) {
  const release = await latestRelease(fetchImpl, { signal, timeoutMs });
  if (signal?.aborted || win?.isDestroyed?.()) return { available: false };
  if (!isNewerVersion(release.tag_name, app.getVersion())) return { available: false };
  const version = String(release.tag_name).replace(/^v/i, '');
  onAvailable({ version, url: macDownloadUrl(release) });
  if (promptedVersions.has(version)) return { available: true, opened: false, version };
  promptedVersions.add(version);
  const notes = String(release.body || '').trim().slice(0, 700);
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Babble Expert Update',
    message: `Babble Expert ${version} is available`,
    detail: `${notes ? `${notes}\n\n` : ''}Download the new DMG, open it, then replace Babble Expert in Applications.`,
    buttons: ['Download DMG', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  const url = macDownloadUrl(release);
  if (response === 0 && url) await shell.openExternal(url);
  return { available: true, opened: response === 0 && !!url, version };
}

function configureWindowsUpdater({ updater, dialog, win, beforeInstall = async () => {}, status = () => {}, onState = () => {}, diagnostic = () => {}, log = console }) {
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.autoRunAppAfterInstall = true;
  updater.allowDowngrade = false;
  let checking = false, downloading = false, ready = false, disposed = false, installing = false, readyVersion = '', availableVersion = '', failures = 0;
  const promptedVersions = new Set();
  let handledErrors = new WeakSet();
  const available = info => {
    downloading = true;
    availableVersion = info.version;
    onState({ phase: 'downloading', version: info.version });
    status(`Downloading Babble Expert ${info.version} update...`);
  };
  const downloaded = async info => {
    downloading = false;
    ready = true;
    readyVersion = info.version;
    onState({ phase: 'ready', version: info.version });
    status(`Update ${info.version} ready: install and restart now, or install silently when you close Expert.`);
    if (!dialog || disposed || win?.isDestroyed() || promptedVersions.has(info.version)) return;
    promptedVersions.add(info.version);
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info', title: 'Babble Expert Update',
        message: `Babble Expert ${info.version} is ready to install`,
        detail: 'Update now: Expert will save its settings and close. An installer will show progress, then reopen Expert automatically. Please wait for it to reopen rather than using the shortcut.\n\nLater: keep playing. When you close Expert, the update will install silently without reopening. Allow installation to finish before opening Expert again.\n\nYour desktop shortcut stays in place during the update. On the next launch, the top bar will confirm the running version.',
        buttons: ['Update now', 'Later'], defaultId: 1, cancelId: 1, noLink: true
      });
      if (response === 0 && !disposed && !win?.isDestroyed()) {
        await install();
      }
    } catch (error) { log.warn('Babble Expert update install failed:', error.message); }
  };
  const failed = error => {
    if (disposed) return;
    // electron-updater emits 'error' and rejects with the same Error. Handle
    // that failure once, preserving the phase before its state is reset.
    if (error && typeof error === 'object') {
      if (handledErrors.has(error)) return;
      handledErrors.add(error);
    }
    diagnostic('update-failed', { component: 'updater', reason: installing ? 'install' : downloading ? 'download' : 'check', code: updateErrorCode(error), targetVersion: readyVersion || availableVersion });
    failures++;
    downloading = false;
    installing = false;
    onState({ phase: ready ? 'ready' : 'error', version: readyVersion, retryable: !ready && retryableUpdateError(updateErrorCode(error)), message: error?.code === 'ERR_ENTRIES_BUSY' ? error.message : ready ? 'Installation could not start. Try Install and restart again.' : 'Could not check or download updates. Try Check for updates again.' });
    log.warn('Babble Expert update check failed:', error.message);
  };
  updater.on('update-available', available);
  updater.on('update-downloaded', downloaded);
  updater.on('error', failed);
  const progress = info => {
    if (!downloading || disposed) return;
    const percent = Number.isFinite(info.percent) ? Math.max(0, Math.min(100, Math.floor(info.percent))) : undefined;
    onState({ phase: 'downloading', version: availableVersion, percent });
  };
  updater.on('download-progress', progress);
  async function check() {
    if (disposed) return;
    if (installing) { onState({ phase: 'installing', version: readyVersion }); return; }
    if (ready) { onState({ phase: 'ready', version: readyVersion }); return; }
    if (downloading) { onState({ phase: 'downloading', version: availableVersion }); return; }
    if (checking) { onState({ phase: 'checking' }); return; }
    checking = true;
    handledErrors = new WeakSet();
    const failuresBeforeCheck = failures;
    onState({ phase: 'checking' });
    try {
      const result = await updater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
      if (!ready && !downloading && failures === failuresBeforeCheck) onState({ phase: 'current' });
    } catch (error) { failed(error); }
    finally { checking = false; }
  }
  async function install() {
    if (!ready || installing || disposed || win?.isDestroyed()) return;
    installing = true;
    handledErrors = new WeakSet();
    onState({ phase: 'installing', version: readyVersion });
    try {
      await beforeInstall();
      if (!disposed) updater.quitAndInstall(false, true);
    } catch (error) { failed(error); }
  }
  return {
    check, install,
    dispose() {
      disposed = true;
      updater.removeListener('update-available', available);
      updater.removeListener('update-downloaded', downloaded);
      updater.removeListener('download-progress', progress);
      // A background download can still emit an error during shutdown.
    }
  };
}

function startUpdates({ app, dialog, shell, win, status, beforeInstall, onState = () => {}, diagnostic = () => {}, platform = process.platform, fetchImpl = globalThis.fetch, delayMs = 4000, intervalMs = CHECK_INTERVAL_MS, updater, log = console, timeoutMs = 7000, retryDelays = [30000, 120000] }) {
  if (!app.isPackaged || !['win32', 'darwin'].includes(platform)) return null;
  let windows, checking = false, stopped = false, lastCheck = null, macUrl = '', manualFeedback = false, lastState = { phase: 'idle' };
  const promptedVersions = new Set();
  const shutdown = new AbortController();
  let retryTimer = null, retryCount = 0;
  const publish = state => {
    if (stopped) return;
    lastState = state;
    onState({ ...state, manual: manualFeedback, currentVersion: app.getVersion?.() });
    if (state.phase === 'error' && state.retryable && !retryTimer && retryCount < retryDelays.length) {
      retryTimer = setTimeout(() => { retryTimer = null; void check({ retry: true }); }, retryDelays[retryCount++]);
      retryTimer.unref?.();
    } else if (['current', 'ready', 'available'].includes(state.phase)) {
      clearTimeout(retryTimer); retryTimer = null; retryCount = 0;
    }
  };
  async function check({ manual = false, retry = false } = {}) {
    if (stopped) return;
    if (checking) {
      if (manual) { manualFeedback = true; publish(lastState); }
      return;
    }
    clearTimeout(retryTimer); retryTimer = null;
    if (!retry) retryCount = 0;
    manualFeedback = manual;
    checking = true;
    lastCheck = Date.now();
    try {
      if (platform === 'win32') {
        if (!windows) windows = configureWindowsUpdater({ updater: updater || require('electron-updater').autoUpdater, dialog, win, status, beforeInstall, onState: publish, diagnostic, log });
        await windows.check();
      } else {
        publish({ phase: 'checking' });
        const result = await checkMacForUpdate({ app, dialog, shell, win, fetchImpl, promptedVersions, timeoutMs, signal: shutdown.signal, onAvailable: release => { macUrl = release.url; } });
        publish({ phase: result.available ? 'available' : 'current', version: result.version });
      }
    } catch (error) { if (stopped) return; diagnostic('update-failed', { component: 'updater', reason: 'check', code: updateErrorCode(error) }); publish({ phase: 'error', retryable: retryableUpdateError(updateErrorCode(error)), message: 'Could not check for updates. Try again later.' }); log.warn('Babble Expert update check failed:', error.message); }
    finally { checking = false; manualFeedback = false; }
  }
  const timer = setTimeout(check, delayMs);
  const interval = setInterval(check, intervalMs);
  const focus = () => {
    if (lastCheck !== null && Date.now() - lastCheck >= intervalMs) void check();
  };
  function stop() {
    if (stopped) return;
    stopped = true;
    shutdown.abort();
    clearTimeout(timer);
    clearInterval(interval);
    clearTimeout(retryTimer);
    win?.removeListener('focus', focus);
    win?.removeListener('closed', stop);
    app.removeListener('before-quit', stop);
    windows?.dispose();
  }
  win?.on('focus', focus);
  win?.once('closed', stop);
  app.once('before-quit', stop);
  timer.unref?.();
  interval.unref?.();
  return { check, stop, install: () => windows?.install(), download: () => { if (!stopped && macUrl) return shell.openExternal(macUrl); } };
}

module.exports = { RELEASE_API, CHECK_INTERVAL_MS, isNewerVersion, recordLaunchVersion, macDownloadUrl, checkMacForUpdate, configureWindowsUpdater, startUpdates };
