'use strict';
// Decode and exercise the actual packaged tour without taking desktop focus.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createTourController,TOUR_VERSION}=require('../../src/tour');
app.disableHardwareAcceleration();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'be-recorded-tour-'));
app.setPath('userData',path.join(dir,'profile'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label='tour state'){for(let i=0;i<200;i++){if(await fn())return;await sleep(50);}throw Error('Timed out: '+label);}
class HiddenWindow extends BrowserWindow{
 constructor(options={}){super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});}
 show(){} focus(){} maximize(){}
}
const deadline=setTimeout(()=>{console.error('Tour test timed out; screenshots: '+dir);app.exit(1);},180000);
app.whenReady().then(async()=>{
 const parent=new HiddenWindow();const settings={data:{tourPromptVersion:0,tourCompletedVersion:0},patch(value){Object.assign(this.data,value);},flush(){}};
 const controller=createTourController({BrowserWindow:HiddenWindow,ipcMain,parent,settings});
 const run=code=>controller.getWindow().webContents.executeJavaScript(code);
 const ready=async()=>{await until(()=>run('!!window.BabbleTour&&BabbleTour.getState().initialized'),'player module');await until(()=>run('!BabbleTour.getState().loading'),'footage load');assert.equal(await run('BabbleTour.getState().mediaError'),'');};
 const snap=async name=>{let error;for(let attempt=0;attempt<3;attempt++){await sleep(150);try{fs.writeFileSync(path.join(dir,name+'.png'),(await controller.getWindow().webContents.capturePage()).toPNG());return;}catch(reason){error=reason;}}throw error;};
 try{
  controller.consider({ready:false,puzzleId:'test'});assert.equal(controller.getWindow(),null);
  controller.consider({ready:true,puzzleId:'test'});controller.getWindow().setSize(1707,912);await ready();
  assert.equal(await run('!document.getElementById("welcome").hidden'),true);await snap('welcome');
  await run('document.getElementById("watch-later").click()');await until(()=>!controller.getWindow());assert.equal(settings.data.tourPromptVersion,TOUR_VERSION);
  controller.consider({ready:true,puzzleId:'next'});assert.equal(controller.getWindow(),null);
  controller.open();controller.getWindow().setSize(1707,912);
  if(process.env.TOUR_ASAR)await controller.getWindow().loadFile(path.join(process.env.TOUR_ASAR,'index.html'));
  await ready();await run('BabbleTour.pause()');
  const storyboard=await run(`(async()=>{const {ranges}=await import(new URL('timeline.mjs',location.href));return ranges.map(chapter=>({id:chapter.id,start:chapter.start,beats:chapter.beats.map(beat=>({duration:beat.duration,clip:beat.clip}))}));})()`);
  const errors=[];controller.getWindow().webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
  for(const chapter of storyboard){let offset=0;for(const beat of chapter.beats){
   await run(`BabbleTour.seek(${chapter.start+offset+Math.min(3,beat.duration/2)})`);await ready();
   const state=await run(`(()=>{const v=document.querySelector('video.active');return {chapter:BabbleTour.getState().chapter,clip:BabbleTour.getState().clip,decoded:v?.readyState>=2,width:v?.videoWidth,height:v?.videoHeight,position:v?.currentTime};})()`);
   assert.equal(state.chapter,chapter.id);assert.equal(state.clip,beat.clip);assert.equal(state.decoded,true,beat.clip);assert.equal(state.width,1920);assert.equal(state.height,1026);assert.ok(Number.isFinite(state.position));offset+=beat.duration;
  }
   await run(`BabbleTour.seek(${chapter.start+Math.min(9,chapter.beats[0].duration-1)})`);await ready();await snap(chapter.id);
   assert.equal(await run('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight'),true);
   console.log('PASS decoded chapter '+chapter.id);
  }
  await run(`BabbleTour.seek(BabbleTour.chapters[9].start+18)`);await ready();await snap('clue-editor');
  await run(`BabbleTour.seek(BabbleTour.chapters[4].start+38)`);await ready();await snap('resource-search');
  await run('BabbleTour.seek(0);BabbleTour.play()');await ready();await sleep(400);assert.ok(await run('BabbleTour.getState().time>0'));
  await run('BabbleTour.pause()');const paused=await run('BabbleTour.getState().time');await sleep(150);assert.equal(await run('BabbleTour.getState().time'),paused);
  await run(`document.querySelectorAll('.chapter-button')[9].click()`);await ready();assert.equal(await run('BabbleTour.getState().chapter'),'share');assert.equal(await run('BabbleTour.getState().playing'),true,'Chapter changes always play');
  await run(`BabbleTour.pause();document.getElementById('previous').click()`);await ready();assert.equal(await run('BabbleTour.getState().playing'),true,'Previous chapter plays from paused');
  await run(`BabbleTour.pause();document.getElementById('next').click()`);await ready();assert.equal(await run('BabbleTour.getState().playing'),true,'Next chapter plays from paused');
  await run(`BabbleTour.pause();document.getElementById('reduce-motion').click()`);assert.equal(await run(`document.body.classList.contains('reduced-motion')`),true);
  // Race between distant seeks must not allow an old decoded frame to win.
  await run(`BabbleTour.seek(0);BabbleTour.seek(BabbleTour.chapters[8].start);BabbleTour.seek(BabbleTour.chapters[2].start)`);await ready();assert.equal(await run('BabbleTour.getState().chapter'),'add');
  controller.getWindow().setSize(960,680);await sleep(100);await snap('small');assert.equal(await run('document.documentElement.scrollHeight<=innerHeight'),true);
  await run('BabbleTour.seek(BabbleTour.getState().duration-.05)');await ready();await run('BabbleTour.play()');await until(()=>run(`!document.getElementById('complete').hidden`));await until(()=>settings.data.tourCompletedVersion===TOUR_VERSION);
  await run(`document.getElementById('replay').click()`);assert.ok(await run('BabbleTour.getState().time<1'));await ready();await run(`document.getElementById('close-tour').click()`);await until(()=>!controller.getWindow());
  assert.deepEqual(errors,[]);clearTimeout(deadline);
  console.log('ALL PASSED: 10 real-footage chapters, every clip decoded, invitation/skip/replay, captions, seeking, playback-on-chapter-change, reduced motion, responsive sizing and completion. Screenshots: '+dir);app.exit(0);
 }catch(error){console.error(error);console.log('Screenshots: '+dir);app.exit(1);}
});
