'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const load=name=>import(pathToFileURL(path.join(__dirname,'../../src/tour',name)).href);
test('recorded tour chapters are independently seekable and reference packaged footage',async()=>{
 const fs=require('node:fs');const {ranges,frameAt,totalDuration,mediaTime}=await load('timeline.mjs');
 const {TOUR_VERSION,chapters}=await load('content.mjs');const media=(await load('media/manifest.mjs')).default;
 assert.equal(TOUR_VERSION,require('../../src/tour').TOUR_VERSION);assert.equal(ranges.length,10);assert.ok(totalDuration>360&&totalDuration<450);
 for(const range of ranges){assert.equal(frameAt(range.start).chapter.id,range.id);assert.deepEqual(frameAt(range.start),frameAt(range.start));let offset=0;
  for(const beat of range.beats){assert.ok(beat.duration>=8);assert.ok(beat.caption.split(/\s+/).length/beat.duration<4.2,'Captions allow reading time');
   assert.ok(media[beat.clip],beat.clip);assert.ok(fs.statSync(path.join(__dirname,'../../src/tour',media[beat.clip].src)).size>0);
   const frame=frameAt(range.start+offset+beat.duration-.1);assert.ok(mediaTime(frame,media[beat.clip].duration)<media[beat.clip].duration);offset+=beat.duration;
  }
 }
 assert.equal(frameAt(totalDuration).chapter.id,'share');assert.equal(frameAt(-50).chapter.id,'fresh');
 assert.doesNotMatch(JSON.stringify(chapters),/fireworks|Entries|sign in to/i);
 assert.equal(mediaTime({step:{from:4},elapsed:100},6),5.92,'Reading holds on a real final frame');
 assert.ok(fs.readFileSync(path.join(__dirname,'../../src/ui/help.html'),'utf8').includes('watch-tour'));
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../../src/tour/index.html'),'utf8'),/mock-toolbar|demo-grid|Today?s Puzzle/);
});

test('tour offer waits for login, remembers skip, restricts IPC and allows manual replay',()=>{
 const {EventEmitter}=require('node:events');const {createTourController}=require('../../src/tour');
 class Window extends EventEmitter{constructor(){super();this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};}isDestroyed(){return false;}loadFile(){}show(){}focus(){}close(){this.emit('closed');}}
 const ipc=new EventEmitter();ipc.handle=(name,fn)=>ipc.on(name,fn);const settings={data:{tourPromptVersion:0,tourCompletedVersion:0},patch(p){Object.assign(this.data,p);},flush(){}};
 const controller=createTourController({BrowserWindow:Window,ipcMain:ipc,parent:{isDestroyed:()=>false},settings});
 controller.consider({ready:false,puzzleId:'test'});assert.equal(controller.getWindow(),null);
 controller.consider({ready:true,puzzleId:'test'});const first=controller.getWindow();assert.ok(first);assert.equal(settings.data.tourPromptVersion,require('../../src/tour').TOUR_VERSION);
 ipc.emit('tour:action',{sender:{},senderFrame:{}},'completed');assert.equal(settings.data.tourCompletedVersion,0);
 const event={sender:first.webContents,senderFrame:first.webContents.mainFrame};ipc.emit('tour:action',event,'close');assert.equal(controller.getWindow(),null);
 controller.consider({ready:true,puzzleId:'another'});assert.equal(controller.getWindow(),null);
 const replay=controller.open();assert.ok(replay);ipc.emit('tour:action',{sender:replay.webContents,senderFrame:replay.webContents.mainFrame},'completed');assert.equal(settings.data.tourCompletedVersion,require('../../src/tour').TOUR_VERSION);
});
