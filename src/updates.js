'use strict';

const RELEASE_API = 'https://api.github.com/repos/licketySplitAUS/BabbleExpert/releases/latest';

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

async function checkMacForUpdate({ app, dialog, shell, win, fetchImpl = globalThis.fetch }) {
  const release = await latestRelease(fetchImpl);
  if (!isNewerVersion(release.tag_name, app.getVersion())) return { available: false };
  const version = String(release.tag_name).replace(/^v/i, '');
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

function configureWindowsUpdater({ updater, status = () => {}, log = console }) {
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowDowngrade = false;
  updater.on('update-available', info => status(`Downloading Babble Expert ${info.version} update...`));
  updater.on('update-downloaded', info => status(`Babble Expert ${info.version} is ready and will install when you close the app.`));
  updater.on('error', error => log.warn('Babble Expert update check failed:', error.message));
  return Promise.resolve(updater.checkForUpdates()).catch(error => log.warn('Babble Expert update check failed:', error.message));
}

function startUpdates({ app, dialog, shell, win, status, platform = process.platform, fetchImpl = globalThis.fetch, delayMs = 4000, log = console }) {
  if (!app.isPackaged || !['win32', 'darwin'].includes(platform)) return null;
  const timer = setTimeout(() => {
    if (platform === 'win32') {
      const { autoUpdater } = require('electron-updater');
      configureWindowsUpdater({ updater: autoUpdater, status, log });
    } else {
      checkMacForUpdate({ app, dialog, shell, win, fetchImpl }).catch(error => log.warn('Babble Expert update check failed:', error.message));
    }
  }, delayMs);
  timer.unref?.();
  return timer;
}

module.exports = { RELEASE_API, isNewerVersion, macDownloadUrl, checkMacForUpdate, configureWindowsUpdater, startUpdates };
