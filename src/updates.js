'use strict';

const RELEASE_API = 'https://api.github.com/repos/licketySplitAUS/BabbleExpert/releases/latest';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

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

async function latestRelease(fetchImpl) {
  const response = await fetchImpl(RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Babble-Expert-Updater' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
}

function macDownloadUrl(release) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  const dmg = assets.find(asset => asset && asset.name === 'BabbleExpert-macOS.dmg')
    || assets.find(asset => asset && /\.dmg$/i.test(asset.name || ''));
  return (dmg && dmg.browser_download_url) || (release && release.html_url) || '';
}

async function checkMacForUpdate({ app, dialog, shell, win, fetchImpl = globalThis.fetch, promptedVersions = new Set(), onAvailable = () => {} }) {
  const release = await latestRelease(fetchImpl);
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

function configureWindowsUpdater({ updater, dialog, win, beforeInstall = async () => {}, status = () => {}, onState = () => {}, log = console }) {
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.autoRunAppAfterInstall = true;
  updater.allowDowngrade = false;
  let checking = false, downloading = false, ready = false, disposed = false, installing = false, readyVersion = '';
  const promptedVersions = new Set();
  const available = info => {
    downloading = true;
    onState({ phase: 'downloading', version: info.version });
    status(`Downloading Babble Expert ${info.version} update...`);
  };
  const downloaded = async info => {
    downloading = false;
    ready = true;
    readyVersion = info.version;
    onState({ phase: 'ready', version: info.version });
    status(`Babble Expert ${info.version} is ready and will install when you close the app.`);
    if (!dialog || disposed || win?.isDestroyed() || promptedVersions.has(info.version)) return;
    promptedVersions.add(info.version);
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info', title: 'Babble Expert Update',
        message: `Babble Expert ${info.version} is ready to install`,
        detail: 'Update now to close Babble Expert, install the new version and reopen it automatically. Choose Later to keep playing; the update will install when you close the app.',
        buttons: ['Update now', 'Later'], defaultId: 1, cancelId: 1, noLink: true
      });
      if (response === 0 && !disposed && !win?.isDestroyed()) {
        await install();
      }
    } catch (error) { log.warn('Babble Expert update install failed:', error.message); }
  };
  const failed = error => {
    downloading = false;
    installing = false;
    onState({ phase: ready ? 'ready' : 'error', version: readyVersion, message: 'Update could not complete. You can try again.' });
    log.warn('Babble Expert update check failed:', error.message);
  };
  updater.on('update-available', available);
  updater.on('update-downloaded', downloaded);
  updater.on('error', failed);
  async function check() {
    if (checking || downloading || ready || disposed) return;
    checking = true;
    onState({ phase: 'checking' });
    try {
      const result = await updater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
      if (!ready && !downloading) onState({ phase: 'current' });
    } catch (error) { failed(error); }
    finally { checking = false; }
  }
  async function install() {
    if (!ready || installing || disposed || win?.isDestroyed()) return;
    installing = true;
    onState({ phase: 'installing', version: readyVersion });
    try {
      await beforeInstall();
      if (!disposed) updater.quitAndInstall(true, true);
    } catch (error) { failed(error); }
  }
  return {
    check, install,
    dispose() {
      disposed = true;
      updater.removeListener('update-available', available);
      updater.removeListener('update-downloaded', downloaded);
      // A background download can still emit an error during shutdown.
    }
  };
}

function startUpdates({ app, dialog, shell, win, status, beforeInstall, onState = () => {}, platform = process.platform, fetchImpl = globalThis.fetch, delayMs = 4000, intervalMs = CHECK_INTERVAL_MS, updater, log = console }) {
  if (!app.isPackaged || !['win32', 'darwin'].includes(platform)) return null;
  let windows, checking = false, stopped = false, lastCheck = null, macUrl = '';
  const promptedVersions = new Set();
  async function check() {
    if (checking || stopped) return;
    checking = true;
    lastCheck = Date.now();
    try {
      if (platform === 'win32') {
        if (!windows) windows = configureWindowsUpdater({ updater: updater || require('electron-updater').autoUpdater, dialog, win, status, beforeInstall, onState, log });
        await windows.check();
      } else {
        onState({ phase: 'checking' });
        const result = await checkMacForUpdate({ app, dialog, shell, win, fetchImpl, promptedVersions, onAvailable: release => { macUrl = release.url; } });
        onState({ phase: result.available ? 'available' : 'current', version: result.version });
      }
    } catch (error) { onState({ phase: 'error', message: 'Could not check for updates. Try again later.' }); log.warn('Babble Expert update check failed:', error.message); }
    finally { checking = false; }
  }
  const timer = setTimeout(check, delayMs);
  const interval = setInterval(check, intervalMs);
  const focus = () => {
    if (lastCheck !== null && Date.now() - lastCheck >= intervalMs) void check();
  };
  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    clearInterval(interval);
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

module.exports = { RELEASE_API, CHECK_INTERVAL_MS, isNewerVersion, macDownloadUrl, checkMacForUpdate, configureWindowsUpdater, startUpdates };
