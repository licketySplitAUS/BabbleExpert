'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { makeFireworksOverlayScript, stopFireworksOverlayScript } = require('../../src/fireworks-overlay');

app.commandLine.appendSwitch('no-sandbox');
app.disableHardwareAcceleration();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({
    width: 520, height: 800, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  win.webContents.on('console-message', details => {
    if (details.level === 'error') errors.push(details.message);
  });
  const source = fs.readFileSync(path.join(__dirname, '../../src/experiments/fireworks.html'), 'utf8');
  const engine = fs.readFileSync(path.join(__dirname, '../../src/experiments/fireworks.js'), 'utf8');
  const instrumented = engine.replace('return {start,destroy};', `
    window.__preview = {
      clear: () => {particles=[];rockets=[];embers=[];fountains=[];cues=[];nextLaunch=nextFountain=Infinity;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#02030a';ctx.fillRect(0,0,width,height)},
      shells: () => {shell(width*.35,height*.24,1,[195],'ring');shell(width*.65,height*.32,1.1,[45],'willow');boom(1.2,0,true)},
      fountain: mode => {fountainPattern(performance.now());for(const f of fountains)f.mode=mode},
      audio: () => ({state:audio?.state, sources:sounds.size})
    };return {start,destroy};`);
  const html = source.replace('<script src="fireworks.js"></script>', '<script>' + instrumented + '</script>');
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await sleep(250);
  const run = code => win.webContents.executeJavaScript(code, true);
  assert.equal(await run(`document.getElementById('sky').dataset.running`), 'true');
  await run(`window.__preview.clear();window.__preview.shells()`);
  await sleep(850);
  const audio = await run(`window.__preview.audio()`);
  assert.equal(audio.state, 'running');
  assert.ok(audio.sources > 0, 'real Web Audio nodes are playing');
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'babble-fireworks-preview-'));
  const capture = async name => {
    const image = await win.webContents.capturePage(), pixels = image.toBitmap();
    let bright = 0;
    for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>50)bright++;
    assert.ok(bright>100, `${name}: visible firework particles are rendered`);
    fs.writeFileSync(path.join(shots, name+'.png'), image.toPNG());
  };
  await capture('shells');
  await run(`window.__preview.clear();window.__preview.fountain('fan')`);
  await sleep(1800);
  await capture('fountains');
  await run(`document.getElementById('sky').click()`);
  assert.equal(await run(`document.getElementById('sky').dataset.running`), 'true');
  await run(`fireworks.destroy();document.body.innerHTML='<button id="underneath" style="position:absolute;left:10px;top:10px;width:200px;height:60px">Original page still here</button>';document.body.style.background='white';document.documentElement.style.background='white';document.getElementById('underneath').onclick=()=>document.body.dataset.clicked='yes';window.overlayAudioCreations=0;window.AudioContext=class{constructor(){window.overlayAudioCreations++}};void 0;`);
  await run(makeFireworksOverlayScript([''])); // This test document has a data URL, hence no hostname.
  await sleep(1800);
  assert.equal(await run(`document.elementFromPoint(50,40).id`), 'underneath');
  win.webContents.sendInputEvent({type:'mouseDown',x:50,y:40,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseUp',x:50,y:40,button:'left',clickCount:1});
  await sleep(100);
  assert.equal(await run(`document.body.dataset.clicked`), 'yes');
  assert.equal(await run(`window.overlayAudioCreations`), 0, 'overlays create no duplicate sound');
  await capture('overlay');
  await run(stopFireworksOverlayScript);
  assert.equal(await run(`!!document.getElementById('babble-expert-fireworks')`), false);
  assert.deepEqual(errors, []);
  console.log('PASS real canvas rendering, deep boom audio nodes, fountains, replay and silent overlays with real click-through');
  console.log(`Screenshots: ${shots}`);
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
