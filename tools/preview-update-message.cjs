'use strict';
// A standalone native prompt. No updater, installed profile or live pages load.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-update-message-preview-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  console.log('Opening the update-message preview. Neither button installs anything.');
  // This GUI is deliberately visible. Hiding the process can hide its first
  // parentless native dialog on Windows, leaving only a running process.
  const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], { cwd: profile, env, windowsHide: false, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow, dialog } = require('electron');
  app.setPath('userData', process.cwd());
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const { updatePrompt } = require('../src/update-prompt');
    const releaseNotes = fs.readFileSync(path.join(__dirname, '../docs/NEXT_RELEASE_UPDATE_PROMPT_DRAFT.md'), 'utf8');
    const prompt = updatePrompt({ releaseNotes, platform: process.argv.includes('--mac') ? 'darwin' : 'win32' });
    const owner = new BrowserWindow({ title: 'Update message preview', width: 480, height: 190, show: false, autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
    await owner.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><head><meta charset="utf-8"><title>Update message preview</title></head><body style="font:16px/1.5 system-ui;padding:18px;background:#f8f8f1;color:#29382e"><strong>Update message preview</strong><p>The sample message opens in front of this window. Neither button downloads or installs anything.</p></body></html>'));
    owner.show(); owner.focus();
    owner.on('closed', () => app.quit());
    console.log('Preview window opened. Close the sample message when you have finished reviewing it.');
    await dialog.showMessageBox(owner, { ...prompt, title: 'PREVIEW — Babble Expert Update' });
    if (!owner.isDestroyed()) owner.destroy();
    app.quit();
  }).catch(error => { console.error(error.message); app.exit(1); });
}
