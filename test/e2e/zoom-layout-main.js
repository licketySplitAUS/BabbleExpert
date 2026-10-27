'use strict';
// Exercise native pane zoom and renderer layout without showing desktop windows.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), assert = require('node:assert/strict');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-zoom-'));
app.setPath('userData', dir);
app.on('web-contents-created', (_event, wc) => wc.setBackgroundThrottling(false));
const { createApp } = require('../../src/app');
const { optionsTemplate } = require('../../src/menus');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 200; i++) { if (await fn()) return; await sleep(50); }
  throw Error('Timed out waiting for zoom/layout');
}
setTimeout(() => { console.error('Zoom/layout test timed out'); app.exit(1); }, 45000).unref();
app.whenReady().then(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url.startsWith('/words')) {
      return res.end('<style>body{margin:0;font:16px monospace;overflow-x:hidden}.w{white-space:nowrap;text-align:center}</style><div class="w">abcdefghijkl</div>');
    }
    const fixture = req.url.startsWith('/babble') ? 'babble.html' : req.url.startsWith('/clues') ? 'clues.html' : 'resource.html';
    res.end(fs.readFileSync(path.join(__dirname, 'fixtures', fixture)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  const ctx = createApp({ userDataDir: dir, tourPrompt: false, telemetryPrompt: false, telemetryEndpoint: null,
    urls: { babble: base + '/babble', clues: base + '/clues' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, pace: 0 });
  const run = code => ctx.win.webContents.executeJavaScript(code);
  try {
    await until(() => ctx.engine.state.ready);
    await until(() => run(`!!document.querySelector('#btnOpt').onclick`));
    const zoomMenu = () => optionsTemplate(ctx.settings.data, ctx.patch).find(item => item.label?.startsWith('Zoom (')).submenu;
    zoomMenu()[0].click();
    assert.equal(ctx.settings.data.zoom, 110);
    ctx.openResource({ label: 'Word list', url: base + '/resource', width: 90, external: false, showTitle: false });
    await until(() => ctx.views.res.getVisible() && !ctx.views.res.webContents.isLoading());
    async function checkLayout() {
      await sleep(100);
      await until(() => run(`(() => {
        const rect = id => document.querySelector(id).getBoundingClientRect();
        const r = rect('#resPane'), b = rect('#slotBabble'), c = rect('#slotClues');
        return r.right <= innerWidth && r.width >= 110 && b.width >= 219 && c.width >= 149 && r.height > 0;
      })()`));
      await until(async () => {
        const rects = await run(`(() => {const r=id=>{const b=document.querySelector(id).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};return {clues:r('#slotClues'),babble:r('#slotBabble'),res:r('#slotRes')};})()`);
        return Object.entries(ctx.views).every(([name, view]) => {
          const bounds = view.getBounds(), rect = rects[name];
          return bounds.x >= 0 && bounds.x + bounds.width <= ctx.win.getContentBounds().width &&
            Object.keys(rect).every(key => Math.abs(bounds[key] - rect[key]) <= 1);
        });
      });
      const order = await run(`([...document.querySelectorAll('#slotClues,#slotBabble,#resPane')].sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left).map(el=>el.id))`);
      const pair = ctx.settings.data.switchSides ? ['slotBabble', 'slotClues'] : ['slotClues', 'slotBabble'];
      assert.deepEqual(order, ctx.settings.data.resourcesLeft ? ['resPane', ...pair] : [...pair, 'resPane']);
      assert.ok(await run(`(() => {const r=document.querySelector('#resClose').getBoundingClientRect();return r.right<=innerWidth && r.bottom<innerHeight;})()`), 'Resource controls stay reachable');
      for (const view of Object.values(ctx.views)) assert.ok(Math.abs(view.webContents.getZoomFactor() - ctx.settings.data.zoom / 100) < 0.001);
      assert.equal(ctx.win.webContents.getZoomFactor(), 1, 'Toolbar stays at normal size');
    }
    await checkLayout();
    // Babble's public puzzle preview has a Log In link but no password field.
    await ctx.views.babble.webContents.executeJavaScript(`
      window.savedLeft=document.getElementById('total_words_left'); savedLeft.remove();
      document.body.insertAdjacentHTML('beforeend','<div id="log_in"><a href="/log_in">Log In</a></div>');
    `);
    await ctx.engine.tick();
    assert.equal(ctx.engine.state.babbleConnection, 'login');
    await until(() => run(`document.querySelector('#chip').textContent==='Log in to Babble'`));
    assert.ok(await run(`document.querySelector('#retryBabble').hidden && document.querySelector('#recoveryMessage').textContent.includes('Log In link')`));
    await ctx.views.babble.webContents.executeJavaScript(`document.getElementById('log_in').remove();document.body.appendChild(savedLeft);`);
    await ctx.engine.tick();
    await until(() => ctx.engine.state.ready);
    console.log('PASS: public Babble preview is detected as logged out and shows login guidance instead of disconnected/retry');
    // Hiding removes the native view without reloading its page or losing width.
    ctx.patch({ zoom: 100, cluesW: 260 });
    await ctx.views.clues.webContents.executeJavaScript('window.hideMarker="retained"');
    for (const switchSides of [false, true]) {
      ctx.patch({ switchSides });
      await until(() => run(`document.querySelector('#app').classList.contains('switched') === ${switchSides}`));
      assert.equal(await run(`document.querySelector('#btnGet .rail-arrow').textContent`), switchSides ? '→' : '←');
      assert.equal(await run(`document.querySelector('#btnSend .rail-arrow').textContent`), switchSides ? '←' : '→');
      assert.ok(await run(`['btnGet','btnSend','btnToggleClues','spl1'].every(id => {
        const el=document.getElementById(id), r=el.getBoundingClientRect(), rail=document.getElementById('cluesRail').getBoundingClientRect();
        return el.parentElement.id==='cluesRail' && r.width>0 && r.left>=rail.left && r.right<=rail.right && r.bottom<=innerHeight;
      })`), 'All controls fit in the same narrow strip');
      await run(`document.querySelector('#btnToggleClues').click()`);
      await until(() => !ctx.views.clues.getVisible());
      assert.equal(ctx.settings.data.cluesHidden, true);
      assert.equal(ctx.settings.data.cluesW, 260);
      assert.ok(await run(`(() => {
        const rail=document.querySelector('#cluesRail').getBoundingClientRect();
        const babble=document.querySelector('#slotBabble').getBoundingClientRect();
        return document.querySelector('#btnToggleClues .rail-label').textContent==='Show Clues' &&
          document.querySelector('#slotClues').getBoundingClientRect().width===0 &&
          (${switchSides} ? rail.left>=babble.right : rail.right<=babble.left);
      })()`));
      ctx.settings.flush();
      assert.equal(new (require('../../src/settings').Settings)(path.join(dir,'settings.json')).data.cluesHidden, true);
      await run(`document.querySelector('#btnToggleClues').click()`);
      await until(() => ctx.views.clues.getVisible());
      assert.equal(await ctx.views.clues.webContents.executeJavaScript('window.hideMarker'), 'retained');
      await checkLayout();
      const start = await run(`(() => {const r=document.getElementById('spl1').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+12),width:document.getElementById('slotClues').offsetWidth};})()`);
      ctx.win.webContents.sendInputEvent({ type:'mouseDown', x:start.x, y:start.y, button:'left', clickCount:1 });
      await until(() => run(`document.body.classList.contains('resizing-panes')`));
      for (const width of [180, 320, 220, 400, 260]) {
        ctx.win.webContents.sendInputEvent({ type:'mouseMove', x:start.x+(switchSides ? -1 : 1)*(width-start.width), y:start.y, button:'left', modifiers:['leftButtonDown'] });
        try { await until(() => run(`document.getElementById('slotClues').offsetWidth===${width}`)); }
        catch (error) { throw Error(`Drag to ${width} on side ${switchSides}: `+JSON.stringify(await run(`({width:document.getElementById('slotClues').offsetWidth, dragging:document.body.classList.contains('resizing-panes')})`)),{cause:error}); }
        await checkLayout();
        const rail = await run(`(() => {
          const rail=document.getElementById('cluesRail');
          return {scrollWidth:rail.scrollWidth,clientWidth:rail.clientWidth,labels:[...rail.querySelectorAll('.rail-label')].every(el=>{
            const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
            return r.left>=p.left && r.right<=p.right && r.top>=p.top && r.bottom<=p.bottom;
          })};
        })()`);
        assert.equal(rail.scrollWidth,rail.clientWidth,'Dragging never introduces horizontal scrolling/clipping in the strip');
        assert.equal(rail.labels,true,'Every vertical label stays within its control while dragging');
      }
      ctx.win.webContents.sendInputEvent({ type:'mouseUp', x:start.x, y:start.y, button:'left', clickCount:1 });
      await until(() => run(`!document.body.classList.contains('resizing-panes')`));
      await until(() => Object.values(ctx.views).every(view => view.getVisible()));
      await checkLayout();
    }
    await run(`document.querySelector('#btnToggleClues').click()`);
    await until(() => !ctx.views.clues.getVisible());
    await run(`document.querySelector('#btnClues').click()`);
    await until(() => ctx.views.clues.getVisible() && !ctx.settings.data.cluesHidden);
    console.log('PASS: Clues hide/show and repeated drag reversals on both sides, unclipped controls, live views, page preservation, saved preference and Reload Clues reveal');
    for (const zoom of [200, 75, 150]) {
      ctx.patch({ zoom });
      for (const resourcesLeft of [false, true]) {
        for (const switchSides of [false, true]) {
          ctx.patch({ switchSides, resourcesLeft, cluesW: 2800 });
          ctx.win.setSize(760, 600);
          await checkLayout();
          ctx.win.setSize(1280, 800);
          await checkLayout();
        }
      }
    }
    // Side changes reposition the same live page; neither its document nor its
    // browser state is recreated. Test both resize directions on each side.
    ctx.patch({ cluesW: 260, resW: 380, zoom: 100 });
    await ctx.views.res.webContents.executeJavaScript('window.layoutMarker="same live page"');
    const resourceURL = ctx.views.res.webContents.getURL();
    for (const resourcesLeft of [false, true]) {
      if (ctx.settings.data.resourcesLeft !== resourcesLeft) optionsTemplate(ctx.settings.data, ctx.patch).find(item => item.label?.startsWith('Move Resources to ')).click();
      await checkLayout();
      assert.equal(ctx.views.res.webContents.getURL(), resourceURL);
      assert.equal(await ctx.views.res.webContents.executeJavaScript('window.layoutMarker'), 'same live page');
      let before = await run("document.getElementById('resPane').offsetWidth");
      const growKey = resourcesLeft ? 'ArrowRight' : 'ArrowLeft';
      await run(`document.getElementById('spl2').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(growKey)},bubbles:true}))`);
      await until(async () => await run("document.getElementById('resPane').offsetWidth") > before);
      before = await run("document.getElementById('resPane').offsetWidth");
      await run(`document.getElementById('spl2').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(resourcesLeft ? 'ArrowLeft' : 'ArrowRight')},bubbles:true}))`);
      await until(async () => await run("document.getElementById('resPane').offsetWidth") < before);
      const start = await run("(()=>{const r=document.getElementById('spl2').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+100)};})()");
      before = await run("document.getElementById('resPane').offsetWidth");
      ctx.win.webContents.sendInputEvent({ type: 'mouseDown', ...start, button: 'left', clickCount: 1 });
      ctx.win.webContents.sendInputEvent({ type: 'mouseMove', x: start.x + (resourcesLeft ? 30 : -30), y: start.y, button: 'left' });
      ctx.win.webContents.sendInputEvent({ type: 'mouseUp', x: start.x + (resourcesLeft ? 30 : -30), y: start.y, button: 'left', clickCount: 1 });
      await until(async () => await run("document.getElementById('resPane').offsetWidth") > before + 20);
      await checkLayout();
      await run("document.getElementById('spl2').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))");
      await until(async () => await run("document.getElementById('resPane').offsetWidth") === 110);
    }
    ctx.hideResources();
    await until(() => run("document.getElementById('resPane').hidden && document.getElementById('spl2').hidden"));
    assert.equal(ctx.views.res.getVisible(), false);
    ctx.openResource({ label: 'Wide resource', url: base + '/other', minWidth: 2800 });
    await until(() => !ctx.views.res.webContents.isLoading());
    await checkLayout();
    ctx.patch({ zoom: 200 });
    ctx.win.setSize(760, 600);
    ctx.openResource({ label: '12 letter words', url: base + '/words', width: 154, external: false, showTitle: false });
    await until(() => !ctx.views.res.webContents.isLoading());
    await checkLayout();
    assert.ok(await ctx.views.res.webContents.executeJavaScript(`(() => {
      const range = document.createRange();range.selectNodeContents(document.querySelector('.w'));
      const r = range.getBoundingClientRect();return r.left >= 0 && r.right <= innerWidth;
    })()`), 'Long words remain fully visible at maximum zoom in the narrowest window');
    ctx.views.clues.webContents.reload();
    await until(() => !ctx.views.clues.webContents.isLoading());
    await checkLayout();
    zoomMenu()[2].click();
    await checkLayout();
    assert.equal(ctx.settings.data.zoom, 100);
    ctx.openZoomMenu(20, 40);
    const popup = BrowserWindow.getAllWindows().find(window => window !== ctx.win && window.getTitle() === 'Zoom');
    assert.ok(popup, 'Options can open a persistent Zoom menu');
    const zoomUi = code => popup.webContents.executeJavaScript(code);
    await until(async () => {
      if (popup.webContents.isLoading()) return false;
      return zoomUi(`!!document.querySelector('#zoomIn')?.onclick`);
    });
    for (const expected of [110, 125, 150]) {
      await zoomUi(`document.querySelector('#zoomIn').click()`);
      await until(() => ctx.settings.data.zoom === expected);
      await until(() => zoomUi(`document.querySelector('#level').textContent === '${expected}%'`));
      assert.equal(popup.isDestroyed(), false, 'Zoom menu remains open after each click');
    }
    await zoomUi(`document.querySelector('#zoomOut').click()`);
    await until(() => ctx.settings.data.zoom === 125);
    await zoomUi(`document.querySelector('#zoomReset').click()`);
    await until(() => ctx.settings.data.zoom === 100);
    assert.equal(popup.isDestroyed(), false, 'Reset also leaves the menu open');
    ctx.patch({ zoom: 200 });
    await until(() => zoomUi(`document.querySelector('#zoomIn').disabled`));
    ctx.settings.flush();
    const { Settings } = require('../../src/settings');
    assert.equal(new Settings(path.join(dir, 'settings.json')).data.zoom, 200, 'Popup changes persist across restarts');
    assert.equal(new Settings(path.join(dir, 'settings.json')).data.resourcesLeft, true, 'Resource side survives restart');
    popup.emit('blur');
    await until(() => popup.isDestroyed());
    ctx.openZoomMenu();
    const reopened = BrowserWindow.getAllWindows().find(window => window !== ctx.win && window.getTitle() === 'Zoom');
    await until(async () => !reopened.webContents.isLoading() && reopened.webContents.executeJavaScript(`!!document.querySelector('#zoomIn')?.onclick`));
    await reopened.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    await until(() => reopened.isDestroyed());
    console.log('PASS: persistent Zoom menu handles repeated clicks, live percentage, limits, reset, restart persistence, outside focus and Escape');
    console.log('PASS: zoom, all native bounds, both resource sides and clue orders, mouse/keyboard resizing, hide/reopen, state preservation, narrow windows and resource controls');
    server.close(); app.exit(0);
  } catch (error) { console.error(error); server.close(); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
