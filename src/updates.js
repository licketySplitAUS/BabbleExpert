'use strict';
const { withDeadline } = require('./async');
const { updateErrorCode, updateNetworkDetails, offlineFailure } = require('./diagnostics');
const { updatePrompt } = require('./update-prompt');

const RELEASE_API = 'https://api.github.com/repos/licketySplitAUS/BabbleExpert/releases/latest';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const retryableUpdateError = code => /^(?:ERR_HTTP_(?:408|429|5\d\d)|ERR_(?:UPDATER_INVALID_RELEASE_FEED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_TIMED_OUT|CONNECTION_RESET|CONNECTION_REFUSED|CONNECTION_CLOSED|SOCKET_NOT_CONNECTED|NETWORK_CHANGED|UPDATE_ABORTED)|ERR_UPDATE_UNKNOWN|EPERM|EACCES|EBUSY|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ENETUNREACH)$/.test(code);

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

async function checkMacForUpdate({ app, dialog, shell, win, fetchImpl = globalThis.fetch, promptedVersions = new Set(), onAvailable = () => {}, journey = () => {}, signal, timeoutMs }) {
  const release = await latestRelease(fetchImpl, { signal, timeoutMs });
  if (signal?.aborted || win?.isDestroyed?.()) return { available: false };
  if (!isNewerVersion(release.tag_name, app.getVersion())) return { available: false };
  const version = String(release.tag_name).replace(/^v/i, '');
  onAvailable({ version, url: macDownloadUrl(release) });
  if (promptedVersions.has(version)) return { available: true, opened: false, version };
  promptedVersions.add(version);
  const { response } = await dialog.showMessageBox(win, updatePrompt({ platform: 'darwin', version, releaseNotes: release.body }));
  const url = macDownloadUrl(release);
  if (response === 0 && url) await shell.openExternal(url);
  journey(response === 0 && url ? 'download-opened' : 'later', version);
  return { available: true, opened: response === 0 && !!url, version };
}

function configureWindowsUpdater({ updater, dialog, win, beforeInstall = async () => {}, status = () => {}, onState = () => {}, diagnostic = () => {}, journey = () => {}, isOnline = () => undefined, log = console }) {
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
    journey('download-ready', info.version);
    onState({ phase: 'ready', version: info.version });
    status(`Update ${info.version} ready: install and restart now, or install silently when you close Expert.`);
    if (!dialog || disposed || win?.isDestroyed() || promptedVersions.has(info.version)) return;
    promptedVersions.add(info.version);
    try {
      const { response } = await dialog.showMessageBox(win, updatePrompt({ version: info.version, releaseNotes: info.releaseNotes }));
      if (response === 0 && !disposed && !win?.isDestroyed()) {
        await install();
      } else if (!disposed) journey('later', info.version);
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
    const details = { component: 'updater', reason: installing ? 'install' : downloading ? 'download' : 'check', code: updateErrorCode(error), targetVersion: readyVersion || availableVersion, ...updateNetworkDetails(error, isOnline) };
    const offline = offlineFailure('update-failed', details, isOnline);
    if (!offline) diagnostic('update-failed', details);
    failures++;
    downloading = false;
    installing = false;
    onState({ phase: ready ? 'ready' : 'error', version: readyVersion, offline, retryable: !ready && retryableUpdateError(updateErrorCode(error)), message: error?.code === 'ERR_ENTRIES_BUSY' ? error.message : ready ? 'Installation could not start. Try Install and restart again.' : 'Could not check or download updates. Try Check for updates again.' });
    if (!offline) log.warn('Babble Expert update failed:', details);
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
      if (!disposed) { journey('install-requested', readyVersion); updater.quitAndInstall(false, true); }
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

function startUpdates({ app, dialog, shell, win, status, beforeInstall, onState = () => {}, diagnostic = () => {}, journey = () => {}, isOnline = () => undefined, platform = process.platform, fetchImpl = globalThis.fetch, delayMs = 4000, intervalMs = CHECK_INTERVAL_MS, updater, log = console, timeoutMs = 7000, retryDelays = [30000, 120000] }) {
  if (!app.isPackaged || !['win32', 'darwin'].includes(platform)) return null;
  let windows, checking = false, stopped = false, lastCheck = null, macUrl = '', manualFeedback = false, lastState = { phase: 'idle' };
  const promptedVersions = new Set();
  const shutdown = new AbortController();
  let retryTimer = null, retryCount = 0;
  let pendingFailure = null;
  const reportFailure = (event, data) => {
    if (stopped) return;
    if (offlineFailure(event, data, isOnline)) { pendingFailure = null; return; }
    if (!manualFeedback && data.reason === 'check' && retryableUpdateError(data.code)) pendingFailure = { event, data };
    else { pendingFailure = null; diagnostic(event, data); }
  };
  const publish = state => {
    if (stopped) return;
    lastState = state;
    if (state.offline) pendingFailure = null;
    onState({ ...state, phase: state.offline ? 'idle' : state.phase, manual: manualFeedback, currentVersion: app.getVersion?.() });
    if (state.phase === 'error' && state.retryable && !retryTimer && retryCount < retryDelays.length) {
      retryTimer = setTimeout(() => { retryTimer = null; void check({ retry: true }); }, retryDelays[retryCount++]);
      retryTimer.unref?.();
    } else if (state.phase === 'error' && pendingFailure) {
      diagnostic(pendingFailure.event, pendingFailure.data); pendingFailure = null;
    } else if (['current', 'ready', 'available'].includes(state.phase)) {
      clearTimeout(retryTimer); retryTimer = null; retryCount = 0;
      pendingFailure = null;
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
        if (!windows) windows = configureWindowsUpdater({ updater: updater || require('electron-updater').autoUpdater, dialog, win, status, beforeInstall, onState: publish, diagnostic: reportFailure, journey, isOnline, log });
        await windows.check();
      } else {
        publish({ phase: 'checking' });
        const result = await checkMacForUpdate({ app, dialog, shell, win, fetchImpl, promptedVersions, journey, timeoutMs, signal: shutdown.signal, onAvailable: release => { macUrl = release.url; } });
        publish({ phase: result.available ? 'available' : 'current', version: result.version });
      }
    } catch (error) {
      if (stopped) return;
      const details = { component: 'updater', reason: 'check', code: updateErrorCode(error), ...updateNetworkDetails(error, isOnline), service: 'github-api' };
      reportFailure('update-failed', details);
      publish({ phase: 'error', offline: offlineFailure('update-failed', details, isOnline), retryable: retryableUpdateError(details.code), message: 'Could not check for updates. Try again later.' });
      if (!offlineFailure('update-failed', details, isOnline)) log.warn('Babble Expert update failed:', details);
    }
    finally { checking = false; manualFeedback = false; }
  }
  let timer = null;
  const begin = () => { if (!stopped) { timer = setTimeout(check, delayMs); timer.unref?.(); } };
  if (win?.webContents?.isLoadingMainFrame()) win.webContents.once('did-finish-load', begin);
  else begin();
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
    pendingFailure = null;
    win?.webContents?.removeListener('did-finish-load', begin);
    win?.removeListener('focus', focus);
    win?.removeListener('closed', stop);
    win?.removeListener('close', stop);
    app.removeListener('before-quit', stop);
    windows?.dispose();
  }
  win?.on('focus', focus);
  win?.once('closed', stop);
  win?.once('close', stop);
  app.once('before-quit', stop);
  interval.unref?.();
  return { check, stop, install: () => windows?.install(), download: async () => {
    if (!stopped && macUrl) { await shell.openExternal(macUrl); if (lastState.version) journey('download-opened', lastState.version); }
  } };
}

module.exports = { RELEASE_API, CHECK_INTERVAL_MS, isNewerVersion, recordLaunchVersion, macDownloadUrl, checkMacForUpdate, configureWindowsUpdater, startUpdates };
