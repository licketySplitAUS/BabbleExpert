'use strict';
const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'be-notes-profile-')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async fn => { for(let i=0;i<150;i++) { try {if(await fn())return;} catch{} await sleep(60); } throw Error('Release notes UI timed out'); };
app.whenReady().then(async () => {
  const server = http.createServer((req,res) => { res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(__dirname,'fixtures',req.url.startsWith('/babble')?'babble.html':'clues.html'))); });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://localhost:${server.address().port}`;let online=false,calls=0;const opened=[];
  shell.openExternal=async url=>opened.push(url);
  const ctx=createApp({version:'3.2.9.0',tourPrompt:false,telemetryPrompt:false,telemetryEndpoint:null,userDataDir:fs.mkdtempSync(path.join(os.tmpdir(),'be-release-notes-')),urls:{babble:base+'/babble',clues:base+'/clues'},hosts:{babble:['localhost'],clues:['localhost']},
    releaseNotesFetch:async()=>{calls++;if(!online)throw Error('offline');return{ok:true,json:async()=>[{tag_name:'v9.9.9',body:'## A future release\n\n- **A readable improvement** and `inline code`.\n\n<img src=x onerror="window.notesInjected=true">\n\n'+('A complete paragraph that can be read by scrolling.\n\n'.repeat(25))}]};}});
  const main=code=>ctx.win.webContents.executeJavaScript(code);
  const help=()=>BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('/help.html'));
  const run=code=>help().webContents.executeJavaScript(code);
  try{
    await until(()=>main(`!!window.be && !!document.getElementById('btnHelp')`));
    await main(`document.getElementById('btnHelp').click()`);await until(()=>help());
    await run(`document.getElementById('releaseNotesTab').click()`);
    await until(()=>run(`document.getElementById('releaseNotesContent').textContent.includes('st6,33') && document.getElementById('releaseNotesStatus').textContent.includes('Could not load online')`));
    assert.ok(await run(`document.getElementById('installedVersion').textContent.includes('3.2.9.0')`));
    if(process.env.SHOT_DIR){fs.mkdirSync(process.env.SHOT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SHOT_DIR,'release-notes-offline.png'),(await help().webContents.capturePage()).toPNG());}
    online=true;await run(`document.getElementById('refreshReleaseNotes').click()`);
    await until(()=>run(`document.getElementById('releaseNotesContent').textContent.includes('9.9.9')`));
    assert.equal(await run(`document.querySelectorAll('#releaseNotesContent img,#releaseNotesContent script').length`),0);
    assert.ok(await run(`!window.notesInjected && !!document.querySelector('#releaseNotesContent strong') && !!document.querySelector('#releaseNotesContent code')`));
    await run(`document.getElementById('guideTab').click()`);
    ctx.setUpdateState({phase:'available',version:'9.9.9'});
    await until(()=>main(`!document.getElementById('btnReleaseNotes').hidden`));
    await main(`document.getElementById('btnReleaseNotes').click()`);
    await until(()=>run(`!document.getElementById('release-notes').hidden`));
    assert.deepEqual(opened,[],'What is new stays inside Expert');
    help().setSize(440,360);await sleep(100);
    const geometry = await run(`({width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,footer:document.querySelector('footer').getBoundingClientRect().bottom,main:document.querySelector('main').clientHeight})`);
    assert.ok(geometry.scroll<=geometry.width && geometry.footer<=geometry.height+1 && geometry.main>0, JSON.stringify(geometry));
    assert.ok(await run(`(()=>{const area=document.querySelector('main');area.scrollTop=area.scrollHeight;return area.scrollTop>0;})()`));
    help().setSize(760,700);await sleep(100);await run(`document.querySelector('main').scrollTop=0`);
    if(process.env.SHOT_DIR){fs.mkdirSync(process.env.SHOT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SHOT_DIR,'release-notes.png'),(await help().webContents.capturePage()).toPNG());}
    help().close();await until(()=>!help());
    await main(`document.getElementById('btnReleaseNotes').click()`);await until(()=>help());
    await until(()=>run(`!document.getElementById('release-notes').hidden && document.getElementById('releaseNotesContent').textContent.includes('9.9.9')`));
    assert.equal(calls,2,'Reopening Help reuses recent release notes');
    assert.ok(!ctx.views.babble.webContents.isDestroyed());
    console.log('PASS: offline installed notes, recent releases, safe formatted text, scrolling/minimum size, Help tab, in-app What is new, new/reused Help windows and cache.');
    server.close();app.exit(0);
  }catch(error){console.error(error);server.close();app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
