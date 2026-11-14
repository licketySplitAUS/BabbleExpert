'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { makeFireworksOverlayScript, stopFireworksOverlayScript } = require('../../src/fireworks-overlay');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'be-celebration-render-')));

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
  const instrumented = engine.replace('return {start,destroy,setSoundEnabled', `
    window.__preview = {
      clear: () => {particles=[];rockets=[];embers=[];fountains=[];cues=[];nextLaunch=nextFountain=Infinity;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#02030a';ctx.fillRect(0,0,width,height)},
      shells: () => {shell(width*.35,height*.24,1,[195],'ring');shell(width*.65,height*.32,1.1,[45],'willow');boom(1.2,0,true)},
      fountain: mode => {fountainPattern(performance.now());for(const f of fountains)f.mode=mode},
      audio: () => ({state:audio?.state, sources:sounds.size})
    };return {start,destroy,setSoundEnabled`);
  const variations = fs.readFileSync(path.join(__dirname, '../../src/experiments/celebrations.js'), 'utf8');
  const html = source.replace('<script src="fireworks.js"></script>', '<script>' + instrumented + '</script>')
    .replace('<script src="celebrations.js"></script>', '<script>' + variations + '</script>')
    .replace('effect: requestedEffect', "effect: 'fireworks'");
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
  // Exercise the same chooser and transparent rendering used by local previews.
  await win.loadFile(path.join(__dirname, '../../src/experiments/celebration-preview.html'));
  const effects = await run('show.effects');
  assert.equal(effects.length, 42);
  await run(`reduced.checked=true;play()`);
  assert.equal(await run('canvas.dataset.animation'), 'message');
  assert.equal(await run('select.disabled'), true);
  await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))`);
  await capture('reduced-motion-expert');
  await run(`messageView.value='clues';play()`);
  assert.equal(await run(`document.querySelector('#preview-clues-notice span').textContent`), 'All words found — well done!');
  assert.equal(await run('canvas.isConnected'), false, 'standalone reduced motion uses only its real notice');
  await capture('reduced-motion-clues');
  await run(`document.querySelector('#preview-clues-notice button').click()`);
  assert.equal(await run(`!!document.getElementById('preview-clues-notice')`), false);
  await run(`reduced.checked=false;play()`);
  assert.equal(await run('select.disabled'), false);
  assert.notEqual(await run('canvas.dataset.animation'), 'message');
  for (const effect of effects.filter(name => name !== 'fireworks')) {
    await run(`select.value=${JSON.stringify(effect)};play()`);
    await sleep(effect === 'powder' ? 4500 : 1800);
    assert.equal(await run('canvas.dataset.effect'), effect);
    assert.equal(await run('canvas.dataset.running'), 'true');
    assert.ok(await run(`(() => { const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data; let count=0; for(let i=3;i<data.length;i+=4)if(data[i]>30)count++; return count; })()`) > 100, effect + ' paints visible overlay pixels');
    await capture(effect);
  }
  await run(`document.getElementById('stop').click()`);
  assert.equal(await run('canvas.isConnected'), false);
  await run(`select.value='balloons';play()`);
  assert.equal(await run('canvas.isConnected'), true);
  // Freeze the curtain at closed/bounce positions and check the entire canvas,
  // including the bowed inner edges which previously left a visible gap.
  await run(`show.destroy();select.value='curtain';status.textContent='Playing: curtain';document.body.appendChild(canvas);window.__realRAF=requestAnimationFrame;window.__realCAF=cancelAnimationFrame;window.__frame=null;window.requestAnimationFrame=fn=>{window.__frame=fn;return 1};window.cancelAnimationFrame=()=>{window.__frame=null};window.__begin=performance.now();show=createBabbleCelebration(canvas,{effect:'curtain',transparent:true,sound:false,clickReplay:false});void 0;`);
  for (const elapsed of [3200, 3500, 4500, 6500]) {
    await run(`window.__frame(window.__begin+${elapsed})`);
    assert.equal(await run(`(() => {const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=3;i<data.length;i+=4)if(data[i]<250)return false;return true;})()`), true, 'closed curtain covers every pixel at ' + elapsed + 'ms');
    if (elapsed === 4500) {
      await run(`new Promise(resolve => window.__realRAF(() => window.__realRAF(() => resolve(true))))`);
      await capture('curtain-closed');
    }
  }
  await run(`show.destroy();select.value='slime';status.textContent='Playing: slime';document.body.appendChild(canvas);window.__begin=performance.now();show=createBabbleCelebration(canvas,{effect:'slime',transparent:true,sound:false,clickReplay:false,duration:16000});window.__frame(window.__begin+1000);void 0;`);
  const earlySlimeCoverage = await run(`(()=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let covered=0;for(let i=3;i<data.length;i+=4)if(data[i]>30)covered++;return covered/(data.length/4);})()`);
  assert.ok(earlySlimeCoverage > .1 && earlySlimeCoverage < .8, 'large slime drips gradually cover the page');
  await run(`window.__frame(window.__begin+11500);void 0;`);
  assert.equal(await run(`(()=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=3;i<data.length;i+=4)if(data[i]<60||data[i]>230)return false;return true;})()`), true, 'slime eventually covers every pixel and stays translucent');
  await run(`new Promise(resolve=>window.__realRAF(()=>window.__realRAF(()=>resolve(true))))`);
  await capture('slime-full-coverage');
  await run(`show.destroy();window.requestAnimationFrame=window.__realRAF;window.cancelAnimationFrame=window.__realCAF;void 0;`);
  // Render the actual Web Audio graphs offline with a virtual animation clock.
  // This verifies audible, distinct output without depending on a speaker or
  // keeping forty-one real-time audio devices open during the test.
  const soundResults = await run(`(async()=>{
    const originalAudio=window.AudioContext, originalRAF=requestAnimationFrame, originalCAF=cancelAnimationFrame, originalNow=performance.now.bind(performance);
    let clock=0,pending=null,contexts=[];
    window.AudioContext=function(){const context=new OfflineAudioContext(1,22050*6,22050);Object.defineProperty(context,'currentTime',{get:()=>clock/1000});Object.defineProperty(context,'state',{get:()=> 'running'});context.close=async()=>{};contexts.push(context);return context;};
    performance.now=()=>clock;window.requestAnimationFrame=callback=>{pending=callback;return 1};window.cancelAnimationFrame=()=>{pending=null};
    const results=[];
    try{
      for(const effect of show.effects.filter(id=>id!=='fireworks')){
        clock=0;contexts=[];pending=null;
        const target=document.createElement('canvas'),soundShow=createBabbleCelebration(target,{effect,sound:true,clickReplay:false,seed:71,duration:12000});
        for(let i=0;i<240;i++){clock+=1000/60;const callback=pending;pending=null;if(callback)callback(clock);}
        if(contexts.length!==1)throw Error(effect+' did not create exactly one sound context');
        const buffer=await contexts[0].startRendering(),data=buffer.getChannelData(0);let energy=0,peak=0;for(const value of data){energy+=value*value;peak=Math.max(peak,Math.abs(value));}
        results.push({effect,rms:Math.sqrt(energy/data.length),peak,fingerprint:Array.prototype.filter.call(data,(_,i)=>i%4096===0).map(value=>value.toFixed(6)).join(',')});soundShow.destroy();
      }
      clock=0;contexts=[];const muted=createBabbleCelebration(document.createElement('canvas'),{effect:'disco',sound:true,clickReplay:false});clock=100;pending(clock);muted.setSoundEnabled(false);
      const data=(await contexts[0].startRendering()).getChannelData(0);results.push({effect:'muted',peak:data.reduce((peak,value)=>Math.max(peak,Math.abs(value)),0)});muted.destroy();
      const count=contexts.length;
      const quiet=createBabbleCelebration(document.createElement('canvas'),{effect:'slime',sound:true,reducedMotion:true,clickReplay:false});quiet.destroy();
      const silent=createBabbleCelebration(document.createElement('canvas'),{effect:'lasers',sound:false,clickReplay:false});silent.destroy();
      if(contexts.length!==count)throw Error('Reduced motion or muted overlays created audio');
      return results;
    }finally{window.AudioContext=originalAudio;window.requestAnimationFrame=originalRAF;window.cancelAnimationFrame=originalCAF;performance.now=originalNow;}
  })()`);
  const fingerprints = new Set();
  for (const result of soundResults.filter(row => row.effect !== 'muted')) {
    assert.ok(result.rms > .0001, result.effect + ' produces audible samples');
    assert.ok(result.peak < 1, result.effect + ' avoids clipping');
    fingerprints.add(result.fingerprint);
  }
  assert.equal(fingerprints.size, effects.length - 1, 'every celebration has a distinct soundtrack');
  assert.equal(soundResults.find(row => row.effect === 'muted').peak, 0, 'mute cancels playing and queued audio');
  await run(`window.__NativeAudioContext=window.AudioContext;window.__liveAudio=[];window.AudioContext=class extends window.__NativeAudioContext{constructor(){super();window.__liveAudio.push(this);}};sound.checked=true;reduced.checked=false;select.value='lasers';play({type:'click'});`);
  assert.equal(await run('canvas.dataset.sound'), 'playing', 'preview Sound control enables real audio');
  await run(`sound.checked=false;sound.onchange();`);
  assert.equal(await run('canvas.dataset.sound'), 'muted');
  await run(`stop()`);
  assert.equal(await run(`window.__liveAudio[0].state`), 'closed', 'Stop closes the real audio context');
  await run(`window.AudioContext=window.__NativeAudioContext;void 0;`);
  // Export actual canvas frames over the dark Expert background at both pane
  // extremes. A virtual clock makes later choreography visible without sleeps.
  for (const width of [320, 1280]) {
    win.setContentSize(width, 800);
    await run(`new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))`);
    await run(`window.__savedRAF=requestAnimationFrame;window.__savedCAF=cancelAnimationFrame;window.__savedNow=performance.now.bind(performance);window.__sceneClock=0;window.__sceneFrame=null;performance.now=()=>window.__sceneClock;window.requestAnimationFrame=fn=>{window.__sceneFrame=fn;return 1};window.cancelAnimationFrame=()=>{window.__sceneFrame=null};void 0;`);
    for (const effect of effects.slice(12)) {
      const png = await run(`(()=>{
        window.__sceneClock=0;const target=document.createElement('canvas');
        const scene=createBabbleCelebration(target,{effect:${JSON.stringify(effect)},seed:71,sound:false,clickReplay:false,words:['celebration','party','babble','wins','bravo','cheer','stars','sparkle','cloud','light','glow','radiant','shine','twirl','dance','bright','proud','delight','dream','laugh','play','word','grid','found','chime','smile','joyful','clever','wonder','gleam','ripple','magic','colour','drift','flow','bloom']});
        for(const ms of [0,1800,4500]){window.__sceneClock=ms;window.__sceneFrame(ms);}
        const image=target.toDataURL('image/png');scene.destroy();return image;
      })()`);
      fs.writeFileSync(path.join(shots, effect + '-dark-' + width + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    }
    await run(`window.requestAnimationFrame=window.__savedRAF;window.cancelAnimationFrame=window.__savedCAF;performance.now=window.__savedNow;void 0;`);
  }
  for (const renderer of ["function(){throw Error('broken hosted renderer')}", "function(){return {}}" ]) {
    await win.loadFile(path.join(__dirname, '../../src/experiments/fireworks.html'), { query: { pack: '1', animations: '1' } });
    assert.equal(await run("document.getElementById('loading').hidden"), false);
    await run(`window.startExpertCelebration({id:'bad',renderer:${renderer}})`);
    assert.equal(await run("document.getElementById('sky').dataset.running"), 'true', 'a broken or incompatible downloaded renderer uses the bundled show');
    assert.equal(await run("new URLSearchParams(location.hash.slice(1)).get('pack')"), 'bundled');
    assert.equal(await run("document.getElementById('loading').hidden"), true);
  }
  assert.deepEqual(errors, []);
  console.log('PASS real canvas rendering, all 41 distinct soundtracks, mute, reduced motion, replay and silent overlays with real click-through');
  console.log(`Screenshots: ${shots}`);
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
