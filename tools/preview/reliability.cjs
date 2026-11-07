'use strict';
// Historical development-only label, retained with its isolated preview profile.
const { app, Menu } = require('electron');
const path = require('node:path'), os = require('node:os'), fs = require('node:fs');
const profile = path.join(os.tmpdir(), 'babble-expert-reliability-3.5.0.1');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let ctx;
  app.on('second-instance', () => { if (ctx && !ctx.win.isDestroyed()) { ctx.win.restore(); ctx.win.show(); ctx.win.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    ctx = require('../../src/app').createApp({ userDataDir: profile,
      title: 'Babble Expert — LOCAL TEST V3.5.0.1', version: '3.5.0.1',
      telemetryEndpoint: null, telemetryPrompt: false });
  }).catch(error => { console.error(error.message); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
}
