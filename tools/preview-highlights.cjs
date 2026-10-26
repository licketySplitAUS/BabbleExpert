'use strict';
// Run with Electron to preview the real window without changing player data.
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-highlights-preview-'));
app.setPath('userData', profile);
process.chdir(profile);
app.whenReady().then(() => {
  const { createApp } = require('../src/app');
  const ctx = createApp({ userDataDir: profile, title: 'Babble Expert preview',
    telemetryPrompt: false, telemetryEndpoint: null, tourPrompt: false,
    recordingSession: true, urls: { babble: 'about:blank', clues: 'about:blank' } });
  ctx.win.webContents.once('did-finish-load', async () => {
    await ctx.win.webContents.executeJavaScript("be.action('showHighlights')");
    const timer = setInterval(() => {
      const preview = ctx.getHighlightsWindow();
      if (!preview) return;
      clearInterval(timer);
      preview.setParentWindow(null);
      ctx.win.hide();
      preview.show(); preview.focus();
      preview.once('closed', () => app.exit(0));
    }, 30);
    timer.unref();
  });
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
