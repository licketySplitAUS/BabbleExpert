'use strict';
// Opt-in test mode: a fresh, isolated temporary profile and no online services.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withDeadline } = require('./async');
function prepare(app) {
  const argument = process.argv.find(arg => arg.startsWith('--smoke-profile='));
  const profile = argument && path.resolve(argument.slice('--smoke-profile='.length));
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!profile || normalize(path.dirname(profile)) !== normalize(path.resolve(os.tmpdir())) || !path.basename(profile).startsWith('be-smoke-') || fs.lstatSync(profile).isSymbolicLink()) throw Error('Smoke tests require an isolated temporary profile.');
  app.setPath('userData', profile);
  let activations = 0;
  app.on('second-instance', () => activations++);
  const expected = Number(process.argv.find(arg => arg.startsWith('--smoke-expect='))?.split('=')[1] || 0);
  const file = path.join(profile, 'smoke-result.json');
  const fail = () => { fs.writeFileSync(file, JSON.stringify({ ok: false, pid: process.pid })); app.exit(1); };
  const deadline = setTimeout(fail, 30000);
  return {
    fail,
    attach(ctx, version) {
      ctx.win.webContents.once('did-finish-load', async () => {
        try {
          const shellReady = await withDeadline(() => ctx.win.webContents.executeJavaScript('!!document.getElementById("btnOpt") && !!window.be'), 5000);
          const cookies = ctx.views.babble.webContents.session.cookies;
          const recovered = (await cookies.get({ url: 'https://smoke.invalid' })).some(cookie => cookie.name === 'smoke-persist' && cookie.value === 'yes');
          await cookies.set({ url: 'https://smoke.invalid', name: 'smoke-persist', value: 'yes', expirationDate: Date.now() / 1000 + 3600 });
          await cookies.flushStore();
          const finish = () => {
            if (activations < expected) { setTimeout(finish, 100); return; }
            clearTimeout(deadline);
            const ok = shellReady && ctx.win.isVisible() && !ctx.tour.getWindow();
            fs.writeFileSync(file, JSON.stringify({ ok, version, pid: process.pid, activations, cookieRecovered: recovered, yellow: ctx.settings.data.yellow, tourOpen: !!ctx.tour.getWindow() }));
            app.exit(ok ? 0 : 1);
          };
          finish();
        } catch { fail(); }
      });
    },
    options: { urls: { babble: 'about:blank', clues: 'about:blank', selfServeClues: 'about:blank' }, telemetryPrompt: false, telemetryEndpoint: null }
  };
}
module.exports = { prepare };
