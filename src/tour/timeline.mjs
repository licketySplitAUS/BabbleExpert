import { chapters } from './content.mjs';
let offset=0;
export const ranges=chapters.map(chapter=>{const start=offset;offset+=chapter.beats.reduce((sum,beat)=>sum+beat.duration,0);return {...chapter,start,end:offset};});
export const totalDuration=offset;
export function frameAt(value){
 const time=Math.max(0,Math.min(totalDuration-.001,Number(value)||0));
 const chapterIndex=ranges.findIndex(chapter=>time<chapter.end),chapter=ranges[chapterIndex],local=time-chapter.start;
 let start=0;
 for(let stepIndex=0;stepIndex<chapter.beats.length;stepIndex++){
  const step=chapter.beats[stepIndex];
  if(local<start+step.duration)return{time,chapter,chapterIndex,step,stepIndex,elapsed:local-start,local,key:`${chapter.id}-${stepIndex}`,chapterProgress:local/(chapter.end-chapter.start)};
  start+=step.duration;
 }
}
export function mediaTime(frame,length){
 const from=Math.min(Math.max(0,frame.step.from||0),Math.max(0,length-.08)),to=Math.min(frame.step.to??length,Math.max(0,length-.08));
 let position=from+frame.elapsed;
 if(frame.step.holdAt!=null&&position>frame.step.holdAt)position=frame.step.holdAt+Math.max(0,position-frame.step.holdAt-(frame.step.holdFor||0));
 return Math.min(Math.max(from,to),position);
}
export const ease=value=>1-Math.pow(1-Math.max(0,Math.min(1,value)),3);
export const formatTime=value=>`${Math.floor(Math.max(0,value)/60)}:${String(Math.floor(Math.max(0,value))%60).padStart(2,'0')}`;
