'use strict';
// Exercise the real OS instance lock and window recovery, without live websites.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { handleLaunches, guardStartupWindow } = require('../../src/startup');
const duplicate = process.argv.includes('--duplicate');
const userDataArg = process.argv.find(arg => arg.startsWith('--startup-test-data='));
const dir = userDataArg ? userDataArg.slice('--startup-test-data='.length)
  : fs.mkdtempSync(path.join(process.cwd(), 'be-startup-e2e-'));
app.setPath('userData', dir);

if (!app.requestSingleInstanceLock()) app.quit();
else if (duplicate) {
  console.error('FAIL duplicate process acquired the instance lock');
  app.exit(2);
} else {
  const launches = handleLaunches(app);
  let activations = 0, created = 0, navigations = 0;
  app.on('second-instance', () => activations++);
  const deadline = setTimeout(() => { console.error('FAIL startup E2E timed out'); app.exit(2); }, 45000);
  const secondary = () => new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(process.execPath, [__filename, '--duplicate', '--startup-test-data=' + dir, '--no-sandbox'], {
      env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']
    });
    let error = '';
    child.stderr.on('data', data => { error += data; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Duplicate exited ${code}: ${error}`)));
  });
  const until = async condition => {
    const started = Date.now();
    while (!condition()) {
      if (Date.now() - started > 15000) throw new Error('Timed out waiting for activation');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  // Start a burst before the primary has reached app readiness.
  const earlyClicks = Promise.all([secondary(), secondary(), secondary()]);
  // Attach a rejection handler immediately, including on slow machines.
  earlyClicks.catch(() => {});
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    created++;
    let startupError;
    guardStartupWindow(win, { onFailure: error => { startupError = error; } });
    assert.equal(win.isVisible(), true, 'visible even before loading any HTML');
    console.log('PASS main window is visible before the first page loads');
    launches.attach(win);
    win.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) navigations++; });
    await win.loadURL('data:text/html,<title>Startup test</title><input id="draft">');
    await win.webContents.executeJavaScript('document.getElementById("draft").value="keep my word"');
    await earlyClicks;
    await until(() => activations >= 3);
    win.hide();
    await Promise.all([secondary(), secondary(), secondary()]);
    await until(() => activations >= 6 && win.isVisible());
    assert.equal(created, 1);
    assert.equal(navigations, 1);
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("draft").value'), 'keep my word');
    console.log('PASS repeated real process launches reveal the same window without reloading or losing a draft');
    win.minimize();
    await until(() => win.isMinimized());
    await secondary();
    await until(() => activations >= 7 && !win.isMinimized() && win.isVisible());
    console.log('PASS another launch restores a minimized window');
    assert.equal(startupError, undefined);
    clearTimeout(deadline);
    console.log('ALL STARTUP CHECKS PASSED');
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}
