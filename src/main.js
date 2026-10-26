'use strict';
const { app, Menu, dialog, shell } = require('electron');
const { displayVersion } = require('./version');
const pkg = require('../package.json');
const { createStartupLog, handleLaunches } = require('./startup');
const { createDiagnostics, exceptionDetails } = require('./diagnostics');
const smoke = process.argv.includes('--smoke-test') ? require('./packaged-smoke').prepare(app) : null;

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  const startup = createStartupLog(app.getPath('userData'));
  const diagnostics = createDiagnostics({ userDataDir: app.getPath('userData'), version: displayVersion(pkg),
    ...(!app.isPackaged || smoke || process.argv.includes('--record-tour') ? { endpoint: null } : {}) });
  startup.write('launch', `version=${displayVersion(pkg)} platform=${process.platform}`);
  const launches = handleLaunches(app, startup.write);
  let failed = false;
  const startupFailure = error => {
    if (smoke) { smoke.fail(); return; }
    if (failed) return;
    failed = true;
    const afterStartup = error?.afterStartup === true;
    startup.write(afterStartup ? 'window-failed' : 'startup-failed', error?.stack || error);
    // Runtime renderer/load failures are already reported by watchPageDiagnostics.
    // Keep the recovery dialog, without adding a misleading failed-launch report.
    if (!afterStartup) diagnostics.report('startup-failed', { component: 'main', reason: error?.diagnosticReason || 'exception', ...exceptionDetails(error) });
    try {
      dialog.showErrorBox(afterStartup ? 'Babble Expert window stopped' : 'Babble Expert could not start',
        (afterStartup ? 'Babble Expert’s main window stopped working.' : 'Babble Expert could not open its main window.') +
        ' Close this message, then try opening Babble Expert again from the Start menu (Windows) or Applications (Mac). You do not need to run Setup again.\n\nIf this keeps happening, send lickety this diagnostic file:\n' + startup.file);
    } finally {
      // Startup can fail before normal close handlers have been initialized.
      // Exit releases the instance lock without running those partial handlers.
      void diagnostics.flushWithin().finally(() => app.exit(1));
    }
  };
  process.on?.('uncaughtExceptionMonitor', error => {
    startup.write('process-failed', error?.stack || error);
    diagnostics.report('process-failed', { component: 'main', reason: 'exception', ...exceptionDetails(error) });
  });
  app.whenReady().then(() => {
    void diagnostics.flush();
    const { createApp } = require('./app');
    const { startUpdates } = require('./updates');
    const cheat = process.argv.some(a => a.replace(/^--/, '') === 'code=MrPIsALittleCheater;GoHome');   // same secret switch as the Delphi build
    if (process.platform === 'darwin') {
      // macOS needs an app menu or Cmd+C / Cmd+V / Cmd+Q don't work in text boxes
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
    } else {
      Menu.setApplicationMenu(null);
    }
    const version = displayVersion(pkg);
    const recordingSession = !!smoke || process.argv.includes('--record-tour');
    const ctx = createApp({ userDataDir: app.getPath('userData'), cheat, version, title: `Babble Expert from licketySplitAUS : V${version}`,
      startupLog: startup.write, onStartupFailure: startupFailure, diagnostics,
      recordingSession, ...(recordingSession ? { telemetryPrompt: false, telemetryEndpoint: null } : {}), ...(smoke?.options || {}) });
    smoke?.attach(ctx, version);
    launches.attach(ctx.win);
    const updates = recordingSession ? {} : startUpdates({ app, dialog, shell, win: ctx.win, beforeInstall: ctx.prepareForUpdate, onState: ctx.setUpdateState, diagnostic: diagnostics.report });
    ctx.setUpdateActions(updates);
    if (process.argv.includes('--dev')) ctx.win.webContents.openDevTools({ mode: 'detach' });
  }).catch(startupFailure);
  app.on('window-all-closed', () => app.quit());
}
