'use strict';
// Development-only recorder. Captures real application pixels; never sends input.
const {app,BrowserWindow,desktopCapturer,ipcMain,screen}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
app.disableHardwareAcceleration();
const output=path.resolve(__dirname,'raw');fs.mkdirSync(output,{recursive:true});
let recorder, status={ready:false}, server;
app.whenReady().then(async()=>{
 const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0}});
 const displays=screen.getAllDisplays().map(d=>({id:d.id,bounds:d.bounds,scaleFactor:d.scaleFactor}));
 fs.writeFileSync(path.join(output,'capture-sources.json'),JSON.stringify({sources:sources.map(({id,name,display_id})=>({id,name,display_id})),displays},null,2));
 recorder=new BrowserWindow({show:false,width:400,height:200,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 ipcMain.handle('capture:write',(_event,{name,data})=>{if(!/^[a-z0-9-]+\.webm$/.test(name))throw Error('Invalid clip name');fs.writeFileSync(path.join(output,name),Buffer.from(data));return fs.statSync(path.join(output,name)).size;});
 ipcMain.on('capture:status',(_event,value)=>{status={...status,...value};});
 let pending=new Map(),next=0;
 ipcMain.on('capture:result',(_event,{id,value,error})=>{const request=pending.get(id);if(!request)return;pending.delete(id);if(error)request.reject(Error(error));else request.resolve(value);});
 const command=payload=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});recorder.webContents.send('capture:command',{id,...payload});setTimeout(()=>{if(pending.delete(id))reject(Error('Recorder timed out'));},20000).unref();});
 server=http.createServer(async(req,res)=>{try{let body='';for await(const part of req)body+=part;const data=body?JSON.parse(body):{};const result=req.url==='/status'?status:req.url==='/sources'?{sources:sources.map(({id,name,display_id})=>({id,name,display_id})),displays}:await command({action:req.url.slice(1),...data});res.setHeader('content-type','application/json');res.end(JSON.stringify(result));}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}});
 server.listen(47831,'127.0.0.1');
 await recorder.loadFile(path.join(__dirname,'recorder.html'));
 console.log('Tour recording API: http://127.0.0.1:47831; output '+output);
});
app.on('window-all-closed',()=>app.quit());
