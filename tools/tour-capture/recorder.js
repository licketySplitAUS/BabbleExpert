'use strict';
const source=document.getElementById('source'),canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d',{alpha:false});
let stream,recording,chunks=[],name,start=0,region,drawId;
window.capture.onCommand(async command=>{
 try{
  let value;
  if(command.action==='init'){
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:command.sourceId,maxFrameRate:30}}});
   source.srcObject=stream;await source.play();region=command.region||{x:0,y:0,width:source.videoWidth,height:source.videoHeight};
   canvas.width=command.width||1920;canvas.height=Math.round(canvas.width*region.height/region.width/2)*2;
   function draw(){ctx.drawImage(source,region.x,region.y,region.width,region.height,0,0,canvas.width,canvas.height);drawId=requestAnimationFrame(draw);}draw();
   value={width:source.videoWidth,height:source.videoHeight,output:[canvas.width,canvas.height],tracks:stream.getVideoTracks().map(t=>t.getSettings())};
  }else if(command.action==='start'){
   if(recording?.state==='recording')throw Error('Already recording');
   name=command.name;chunks=[];
   recording=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6000000});
   recording.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recording.start(1000);start=performance.now();value={name,start};
  }else if(command.action==='stop'){
   if(recording?.state!=='recording')throw Error('Not recording');
   const duration=(performance.now()-start)/1000;
   await new Promise(resolve=>{recording.onstop=resolve;recording.stop();});
   const bytes=await window.capture.write({name:name+'.webm',data:Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))});value={name,duration,bytes};
  }else if(command.action==='quit'){
   cancelAnimationFrame(drawId);stream?.getTracks().forEach(t=>t.stop());window.close();value=true;
  }else throw Error('Unknown command');
  window.capture.result({id:command.id,value});
 }catch(error){window.capture.result({id:command.id,error:error.message});}
});
window.capture.status({ready:true});
