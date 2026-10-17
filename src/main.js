'use strict';
const { app, Menu, dialog, shell } = require('electron');
const { createApp } = require('./app');
const { startUpdates } = require('./updates');
const { displayVersion } = require('./version');
const pkg = require('../package.json');

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.whenReady().then(() => {
    const cheat = process.argv.some(a => a.replace(/^--/, '') === 'code=MrPIsALittleCheater;GoHome');   // same secret switch as the Delphi build
    if (process.platform === 'darwin') {
      // macOS needs an app menu or Cmd+C / Cmd+V / Cmd+Q don't work in text boxes
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
    } else {
      Menu.setApplicationMenu(null);
    }
    const version = displayVersion(pkg);
    const ctx = createApp({ userDataDir: app.getPath('userData'), cheat, version, title: `Babble Expert from licketySplitAUS : V${version}` });
    startUpdates({ app, dialog, shell, win: ctx.win, status: message => ctx.engine.status(message) });
    if (process.argv.includes('--dev')) ctx.win.webContents.openDevTools({ mode: 'detach' });
    app.on('second-instance', () => { if (ctx.win.isMinimized()) ctx.win.restore(); ctx.win.focus(); });
  });
  app.on('window-all-closed', () => app.quit());
}
