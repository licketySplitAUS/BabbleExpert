import media from './media/manifest.mjs';
import { mediaTime } from './timeline.mjs';

// Media adapter: the player owns time; this module owns decoding and held frames.
// Two local video elements keep the previous frame visible while a seek loads.
export function createFootageRenderer({ onLoading, onError }) {
 const videos=[document.getElementById('footage-a'),document.getElementById('footage-b')];
 let active=null,current='',pending='',serial=0,waiting=Promise.resolve(),lastFrame=null;
 let loading=false,error=null,failed='';
 const report=value=>{loading=value;onLoading(value);};
 function waitFor(video,event){return new Promise((resolve,reject)=>{
  const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(Error('The recorded clip could not be loaded.'));};
  const timer=setTimeout(fail,12000);
  function cleanup(){clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',fail);}
  video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});
 });}
 async function select(frame){
  const token=++serial,id=frame.step.clip,item=media[id];pending=id;error=null;report(true);
  try{
   if(!item)throw Error('This recorded chapter is missing.');
   const video=videos.find(v=>v!==active)||videos[0];video.pause();
   if(video.dataset.clip!==id){video.dataset.clip=id;video.src=new URL(item.src,import.meta.url).href;const loaded=waitFor(video,'loadeddata');video.load();await loaded;}
   else if(video.readyState<2)await waitFor(video,'loadeddata');
   if(token!==serial)return;
   const position=mediaTime(frame,item.duration);
   if(Math.abs(video.currentTime-position)>.04){const sought=waitFor(video,'seeked');video.currentTime=position;await sought;}
   if(token!==serial)return;
   active?.pause();videos.forEach(v=>v.classList.toggle('active',v===video));
   active=video;current=id;pending='';report(false);
  }catch(reason){if(token!==serial)return;pending='';error=reason;failed=id;report(false);onError(reason);}
 }
 function render(frame,playing,speed){
  lastFrame=frame;
  if(error&&failed!==frame.step.clip){error=null;failed='';}
  if(pending&&current===frame.step.clip){++serial;pending='';report(false);}
  if(current!==frame.step.clip){if(pending!==frame.step.clip&&!error)waiting=select(frame);return;}
  if(!active)return;
  const item=media[current],target=mediaTime(frame,item.duration);
  if(!active.seeking&&Math.abs(active.currentTime-target)>.22)active.currentTime=target;
  const end=Math.min(frame.step.to??item.duration,item.duration-.08);
  const moving=playing&&!loading&&target<end-.04&&mediaTime({...frame,elapsed:frame.elapsed+.05},item.duration)>target+.01;
  if(moving){active.playbackRate=speed;if(active.paused)active.play().catch(reason=>{if(reason.name!=='AbortError'){error=reason;onError(reason);}});}
  else active.pause();
 }
 return {render,pause(){videos.forEach(v=>v.pause());},async ready(){await waiting;if(active?.seeking)await waitFor(active,'seeked');},
  retry(){error=null;current='';pending='';if(lastFrame)waiting=select(lastFrame);},
  get loading(){return loading;},get error(){return error;},get video(){return active;},media};
}
