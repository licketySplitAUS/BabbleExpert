'use strict';
// Local preview only: a separate profile, no update checks or notifications.
const { app, Menu } = require('electron');
const path = require('node:path'), os = require('node:os'), fs = require('node:fs');
const profile = path.join(os.tmpdir(), 'babble-expert-helpful-hints-preview');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let ctx;
  app.on('second-instance', () => { if (ctx && !ctx.win.isDestroyed()) { if (ctx.win.isMinimized()) ctx.win.restore(); ctx.win.show(); ctx.win.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    ctx = require('../../src/app').createApp({ userDataDir: app.getPath('userData'),
      title: 'Babble Expert — TEST PREVIEW: Helpful hints', version: require('../../package.json').build.buildVersion,
      telemetryEndpoint: null, telemetryPrompt: false });
  }).catch(error => { console.error(error.message); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
}
