'use strict';
// Local integration check for the login boundary; never show desktop windows.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
for(const method of ['show','showInactive','focus','maximize'])BrowserWindow.prototype[method]=function(){};
app.disableHardwareAcceleration();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'be-input-relay-'));app.setPath('userData',dir);
app.on('web-contents-created',(_event,wc)=>wc.setBackgroundThrottling(false));
const {createApp}=require('../../src/app');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<200;i++){try{if(await fn())return;}catch{}await sleep(50);}throw Error('Timed out waiting for input relay');}
setTimeout(()=>{console.error('Input-relay test timed out');app.exit(1);},30000).unref();
app.whenReady().then(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');
  if(req.url==='/interactive')return res.end('<script>window.events=[];window.BabbleExpertInteract=event=>events.push(event);</script>');
  res.end(fs.readFileSync(path.join(__dirname,'fixtures',req.url.startsWith('/babble')?'babble.html':'clues.html')));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://localhost:${server.address().port}`;
 const ctx=createApp({userDataDir:dir,tourPrompt:false,telemetryPrompt:false,telemetryEndpoint:null,urls:{babble:base+'/babble',clues:base+'/clues'},hosts:{babble:['localhost'],clues:['localhost']},pace:0});
 try{
  await until(()=>ctx.engine.state.ready);
  ctx.openResource({label:'Local interaction test',url:base+'/interactive',interactive:true,minWidth:300});
  const resource=code=>ctx.views.res.webContents.executeJavaScript(code);
  await until(()=>resource(`typeof window.BabbleExpertInteract==='function'`));
  ctx.engine._set({ready:false});ctx.views.babble.webContents.emit('before-input-event',{}, {type:'keyDown',key:'F8',code:'F8'});await sleep(80);
  assert.equal(await resource('events.length'),0,'Logged-out/not-ready input must not reach resources');
  ctx.engine._set({ready:true});ctx.views.babble.webContents.emit('before-input-event',{}, {type:'keyDown',key:'F8',code:'F8'});
  await until(()=>resource(`events.some(event=>event.type==='key'&&event.key==='F8')`));
  console.log('PASS: real app blocks not-ready Babble input and relays ready puzzle input to resources');app.exit(0);
 }catch(error){console.error(error);app.exit(1);}finally{server.close();}
});
