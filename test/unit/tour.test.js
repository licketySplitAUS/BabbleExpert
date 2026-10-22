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

function fixture(options={}) {
 const {EventEmitter}=require('node:events');const {createTourController}=require('../../src/tour');
 class Window extends EventEmitter {
  constructor(options){super();this.options=options;this.visible=false;this.minimized=false;this.destroyed=false;this.loads=0;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};}
  isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}isMinimized(){return this.minimized;}getChildWindows(){return [];}
  loadFile(){this.loads++;return Promise.resolve();}show(){this.visible=true;}focus(){this.focused=true;}restore(){this.minimized=false;}
  close(){this.destroy();}destroy(){this.destroyed=true;this.webContents.emit('destroyed');this.emit('closed');}
 }
 const ipc=new EventEmitter();ipc.handle=(name,fn)=>ipc.on(name,fn);
 const settings={data:{tourPromptVersion:0,tourCompletedVersion:0},patch(p){Object.assign(this.data,p);},flush(){}};
 const parent=new Window(), errors=[], reports=[];
 const controller=createTourController({BrowserWindow:Window,ipcMain:ipc,parent,settings,onError:()=>errors.push(true),diagnostic:(event,data)=>reports.push({event,...data}),...options});
 return {controller,Window,ipc,settings,parent,errors,reports};
}

test('tour only opens manually; IPC is trusted and repeat clicks reuse the visible window',()=>{
 const {controller,ipc,settings}=fixture();
 assert.equal(controller.getWindow(),null);assert.equal(controller.consider,undefined,'there is no automatic puzzle-ready launch path');
 const first=controller.open();assert.ok(first.visible,'visible without ready-to-show');assert.equal(first.options.modal,undefined);
 assert.equal(first.options.width,1320);assert.equal(first.options.height,920);
 ipc.emit('tour:action',{sender:{},senderFrame:{}},'completed');assert.equal(settings.data.tourCompletedVersion,0);
 first.minimized=true;first.visible=false;
 assert.equal(controller.open(),first);assert.equal(first.visible,true);assert.equal(first.minimized,false);assert.equal(first.loads,1);
 const event={sender:first.webContents,senderFrame:first.webContents.mainFrame};ipc.emit('tour:action',event,'close');assert.equal(controller.getWindow(),null);
 const replay=controller.open();ipc.emit('tour:action',{sender:replay.webContents,senderFrame:replay.webContents.mainFrame},'completed');assert.equal(settings.data.tourCompletedVersion,require('../../src/tour').TOUR_VERSION);
 replay.close();
});

test('tour stays within the available display and has no late maximize or focus jump',()=>{
 const {controller}=fixture({getWorkArea:()=>({x:-1366,y:0,width:1366,height:728})});
 const win=controller.open();assert.equal(win.options.height,728);assert.ok(win.options.x>=-1366);assert.ok(win.options.x+win.options.width<=0);
 win.focused=false;win.emit('ready-to-show');assert.equal(win.focused,false,'a late first paint cannot steal focus');win.close();
});

test('stalled or failed tour closes only itself, restores Expert and can be opened again',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=fixture();const first=f.controller.open();
 t.mock.timers.tick(60000);await Promise.resolve();await Promise.resolve();
 assert.equal(first.isDestroyed(),true);assert.equal(f.parent.isDestroyed(),false);assert.equal(f.parent.visible,true);assert.equal(f.errors.length,1);
 assert.ok(f.reports.some(report=>report.component==='tour'&&report.reason==='timeout'));
 const next=f.controller.open();next.webContents.emit('did-finish-load');t.mock.timers.tick(120000);assert.equal(next.isDestroyed(),false);
 next.webContents.emit('render-process-gone',{}, {reason:'crashed',exitCode:1});await Promise.resolve();await Promise.resolve();
 assert.equal(next.isDestroyed(),true);assert.equal(f.errors.length,2);
 assert.equal(f.reports.at(-1).event,'renderer-crashed');
});

test('tour load rejection reports once; normal close cancels timeouts and ignores late rejection',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=fixture();let reject;
 f.Window.prototype.loadFile=function(){return new Promise((_resolve,no)=>{reject=no;});};
 const first=f.controller.open();reject(Error('private file path'));await Promise.resolve();await Promise.resolve();
 assert.equal(first.isDestroyed(),true);assert.equal(f.errors.length,1);assert.doesNotMatch(JSON.stringify(f.reports),/private/);
 const second=f.controller.open();second.close();reject(Error('closed during load'));t.mock.timers.tick(120000);await Promise.resolve();await Promise.resolve();
 assert.equal(f.errors.length,1);assert.equal(f.controller.getWindow(),null);
});

test('tour ignores cancelled and subframe failures; real failure or construction error leaves Expert usable',async()=>{
 const f=fixture();const win=f.controller.open();
 win.webContents.emit('did-fail-load',{},-3,'cancelled','private',true);
 win.webContents.emit('did-fail-load',{},-6,'missing subframe','private',false);
 assert.equal(win.isDestroyed(),false);
 win.webContents.emit('did-fail-load',{},-6,'missing file','private',true);
 await Promise.resolve();await Promise.resolve();assert.equal(f.controller.getWindow(),null);assert.equal(f.errors.length,1);
 const g=fixture({getWorkArea:()=>{throw Error('display lookup failed');}});
 assert.doesNotThrow(()=>g.controller.open());await Promise.resolve();await Promise.resolve();
 assert.equal(g.controller.getWindow(),null);assert.equal(g.parent.isDestroyed(),false);assert.equal(g.errors.length,1);
});
