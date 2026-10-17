import {chapters} from './content.mjs';
import {frameAt,ranges,totalDuration,formatTime,ease,mediaTime} from './timeline.mjs';
import {createFootageRenderer} from './footage.mjs';
import {motions} from './motions.mjs';
const $=id=>document.getElementById(id),host=window.tourHost;
let time=0,playing=false,speed=1,last=performance.now(),key='',chapter=-1,finished=false,offering=false,initialized=false,loadTimer;
let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const cursor={x:600,y:320,vx:0,vy:0},camera={x:0,y:0,z:1},trail=[];
const footage=createFootageRenderer({onLoading(value){
 clearTimeout(loadTimer);$('viewport').setAttribute('aria-busy',String(value));
 if(value)loadTimer=setTimeout(()=>{$('media-message').textContent='Loading recorded footage…';$('retry-media').hidden=true;$('media-status').hidden=false;},250);
 else $('media-status').hidden=true;
},onError(){play(false);$('media-message').textContent='This clip could not be played. Try again, or choose another chapter.';$('retry-media').hidden=false;$('media-status').hidden=false;}});
const text=(id,value)=>{$(id).textContent=value;};
function close(){footage.pause();if(host)host.action('close');else window.close();}
function play(value=true){playing=value;last=performance.now();$('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'Pause tour':'Play tour');if(!playing)footage.pause();}
function seek(value){time=Math.max(0,Math.min(totalDuration,Number(value)||0));finished=false;$('complete').hidden=true;last=performance.now();draw(1/60);return footage.ready();}
function jump(index){seek(ranges[Math.max(0,Math.min(ranges.length-1,index))].start);play(true);}
function draw(dt){
 const frame=frameAt(time);footage.render(frame,playing&&!offering,speed);
 if(chapter!==frame.chapterIndex){
  chapter=frame.chapterIndex;text('chapter-title',frame.chapter.title);text('chapter-kicker',frame.chapter.subtitle.toUpperCase());text('scene-counter',`${String(chapter+1).padStart(2,'0')} / ${chapters.length}`);
  document.querySelectorAll('.chapter-button').forEach((button,index)=>{button.setAttribute('aria-current',String(index===chapter));if(index===chapter)button.scrollIntoView({block:'nearest'});});
 }
 if(key!==frame.key){
  key=frame.key;trail.length=0;text('caption',frame.step.caption);text('beat-number',`${String(chapter+1).padStart(2,'0')}.${frame.stepIndex+1}`);text('callout-text',frame.step.badge||'');
  if(!reduced){$('caption').animate([{opacity:.3,transform:'translateX(8px)'},{opacity:1,transform:'none'}],{duration:320,easing:'ease-out'});$('callout').animate([{transform:'translateY(9px) scale(.96)'},{transform:'translateY(-2px) scale(1.01)',offset:.75},{transform:'none'}],{duration:620,easing:'cubic-bezier(.2,.8,.2,1)'});}
 }
 const viewport=$('viewport'),width=viewport.clientWidth,height=viewport.clientHeight;
 // Give the video its actual display dimensions. Avoid scaling a 1200px
 // intermediate layer and then enlarging it again for the camera effect.
 const stageWidth=Math.round(Math.min(width-26,(height-24)*1920/1026)),stageHeight=stageWidth*1026/1920;
 Object.assign($('stage-fit').style,{width:`${stageWidth}px`,height:`${stageHeight}px`,transform:'translate(-50%,-50%)'});
 const focus=frame.step.focus,z=focus&&!reduced?1.18:1,fx=focus?focus[0]+focus[2]/2:.5,fy=focus?focus[1]+focus[3]/2:.5,smoothing=reduced?1:1-Math.exp(-dt*5);
 camera.z+=(z-camera.z)*smoothing;camera.x+=((.5-fx)*stageWidth*(z-1)-camera.x)*smoothing;camera.y+=((.5-fy)*stageHeight*(z-1)-camera.y)*smoothing;
 const tilt=reduced?0:Math.max(0,1-frame.local/1.1);
 const pose=tilt>0?` rotateX(${tilt*6}deg) rotateY(${-tilt*5}deg)`:'';
 $('camera').style.transform=`translate(${Math.round(camera.x)}px,${Math.round(camera.y)}px)${pose} scale(${camera.z})`;
 document.querySelector('.floor-shadow').style.transform=`rotate(${-3-tilt*5}deg) scale(${1-tilt*.1})`;
 $('focus-shade').style.opacity=focus?'1':'0';$('focus-ring').style.opacity=focus?'.8':'0';
 if(focus){const [x,y,w,h]=focus,percent=n=>`${(n*100).toFixed(3)}%`;
  const outside=[[0,0,1,y],[0,y+h,1,Math.max(0,1-y-h)],[0,y,x,h],[x+w,y,Math.max(0,1-x-w),h]];
  $('focus-shade').querySelectorAll('.focus-veil').forEach((veil,index)=>{const [left,top,width,height]=outside[index];Object.assign(veil.style,{left:percent(left),top:percent(top),width:percent(width),height:percent(height)});});
  Object.assign($('focus-ring').style,{left:percent(x),top:percent(y),width:percent(w),height:percent(h)});
 }
 const sourceTime=mediaTime(frame,footage.media[frame.step.clip].duration),events=motions[frame.step.clip]||[];
 let marker=events.filter(event=>event.at<=sourceTime+.7).at(-1),point=marker?.point||frame.step.pointer;
 $('cursor').hidden=!point;$('cursor-trail').hidden=!point||reduced;
 if(point){
  const stage=$('camera').getBoundingClientRect(),view=viewport.getBoundingClientRect();
  const target={x:stage.left-view.left+point[0]*stage.width,y:stage.top-view.top+point[1]*stage.height};
  if(reduced){cursor.x=target.x;cursor.y=target.y;}else{const h=Math.min(dt,.025);cursor.vx+=(180*(target.x-cursor.x)-25*cursor.vx)*h;cursor.vy+=(180*(target.y-cursor.y)-25*cursor.vy)*h;cursor.x+=cursor.vx*h;cursor.y+=cursor.vy*h;}
  $('cursor').style.transform=`translate(${cursor.x}px,${cursor.y}px)`;trail.push({x:cursor.x,y:cursor.y});if(trail.length>13)trail.shift();$('trail-path').setAttribute('d',trail.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));
  const click=marker?.click?(sourceTime-marker.at)/.2:-1;$('click-ripple').style.opacity=!reduced&&click>=0&&click<1?String(1-click):'0';$('click-ripple').style.transform=`translate(${target.x-23}px,${target.y-23}px) scale(${.35+Math.min(1,Math.max(0,click))*1.2})`;
 }else $('click-ripple').style.opacity='0';
 const callout=$('callout');callout.hidden=!frame.step.badge;callout.style.opacity=String(ease((frame.elapsed-.7)/.6));callout.style.left=`${Math.max(15,width-callout.offsetWidth-22)}px`;callout.style.top=`${Math.max(12,height-callout.offsetHeight-17)}px`;
 $('seek').value=String(time);$('seek').style.setProperty('--progress',`${time/totalDuration*100}%`);text('timecode',`${formatTime(time)} / ${formatTime(totalDuration)}`);$('settle-indicator').style.opacity=frame.elapsed>1.2?'.85':'.2';
 document.querySelectorAll('.chapter-button').forEach((button,index)=>button.style.setProperty('--chapter-progress',index<chapter?1:index===chapter?frame.chapterProgress:0));
 $('previous').disabled=chapter===0&&time<1;$('next').disabled=chapter===chapters.length-1;
}
ranges.forEach((range,index)=>{const button=document.createElement('button');button.className='chapter-button';button.innerHTML=`<span class="chapter-index">${range.icon}</span><span>${range.title}</span><span class="chapter-time">${formatTime(range.end-range.start)}</span>`;button.onclick=()=>jump(index);$('chapter-list').append(button);const tick=document.createElement('span');tick.style.left=`${range.start/totalDuration*100}%`;$('chapter-ticks').append(tick);});
$('seek').max=String(totalDuration);text('chapter-count',`${chapters.length} chapters`);text('welcome-length',`${formatTime(totalDuration)} · ${chapters.length} chapters · pause whenever you like`);
$('play').onclick=()=>{if(time>=totalDuration)seek(0);play(!playing);};$('previous').onclick=()=>jump(time-ranges[chapter].start>3?chapter:chapter-1);$('next').onclick=()=>jump(chapter+1);$('seek').oninput=event=>seek(event.target.value);$('speed').onchange=event=>{speed=Number(event.target.value);};
$('retry-media').onclick=()=>{footage.retry();play(true);};
$('reduce-motion').checked=reduced;$('reduce-motion').onchange=event=>{reduced=event.target.checked;document.body.classList.toggle('reduced-motion',reduced);};document.body.classList.toggle('reduced-motion',reduced);
$('cinema').onclick=()=>{const on=document.body.classList.toggle('cinema');$('cinema').setAttribute('aria-pressed',String(on));$('cinema').textContent=on?'Show chapters':'Cinema view';};
for(const id of ['close-tour','finish','watch-later'])$(id).onclick=close;
$('watch-now').onclick=()=>{offering=false;$('welcome').hidden=true;host?.action('started');play(true);};$('replay').onclick=()=>{seek(0);play(true);};$('brand').onclick=event=>{event.preventDefault();jump(0);};
document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();return;}if(offering||/INPUT|SELECT|BUTTON/.test(event.target.tagName))return;if(event.code==='Space'||event.key==='k'){event.preventDefault();play(!playing);}if(event.key==='ArrowRight'){event.preventDefault();seek(time+5);}if(event.key==='ArrowLeft'){event.preventDefault();seek(time-5);}if(event.key==='Home')seek(0);if(event.key==='End')seek(totalDuration);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)play(false);});
function launch(options={}){offering=!!options.offer;$('welcome').hidden=!offering;seek(0);play(!offering);initialized=true;if(offering)$('watch-now').focus();}
window.BabbleTour=Object.freeze({seek,play,pause:()=>play(false),chapter:jump,getState:()=>({time,playing,chapter:chapters[chapter]?.id,duration:totalDuration,offering,initialized,loading:footage.loading,mediaError:footage.error?.message||'',clip:frameAt(time).step.clip}),chapters:ranges.map(({id,start,end,title})=>({id,start,end,title}))});
host?.onLaunch(launch);launch(await host?.getLaunch()||{});
function tick(now){const dt=Math.min(.1,(now-last)/1000);last=now;if(playing&&!offering&&!footage.loading){time=Math.min(totalDuration,time+dt*speed);if(time>=totalDuration&&!finished){finished=true;play(false);$('complete').hidden=false;host?.action('completed');}}draw(dt);requestAnimationFrame(tick);}requestAnimationFrame(tick);
