/* Shared by the standalone celebration and the transparent page overlays. */
function createBabbleFireworks(canvas, options) {
'use strict';
options=options||{};
const transparent=!!options.transparent,ctx=canvas.getContext('2d',{alpha:transparent});
if(!ctx)return {start(){},destroy(){}};
let width=0,height=0,dpr=1,particles=[],rockets=[],embers=[],fountains=[],cues=[],running=false,endAt=0,nextLaunch=0,nextFountain=0,last=performance.now(),launches=0,audio=null,master=null,noiseBuffer=null;
let frameId=null,destroyed=false;
let lastBoom=-10,lastDeepBoom=-10;
const sounds=new Set(),MAX_PARTICLES=1000,MAX_EMBERS=700;
const TAU=Math.PI*2,rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.random()*a.length|0];
const palettes=[[5,28,48],[42,52,62],[115,135,155],[185,205,225],[265,285,305],[320,340,355],[15,190,275],[45,160,300]];

function resize(){dpr=Math.min(devicePixelRatio||1,2);width=Math.max(1,innerWidth);height=Math.max(1,innerHeight);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize);resize();

function ensureAudio(){
  if(options.sound===false)return;
  try{
  if(!audio){
    audio=new (window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=.38;
    const compressor=audio.createDynamicsCompressor();compressor.threshold.value=-13;compressor.knee.value=18;compressor.ratio.value=7;compressor.attack.value=.004;compressor.release.value=.35;master.connect(compressor).connect(audio.destination);
    noiseBuffer=audio.createBuffer(1,audio.sampleRate*1.5,audio.sampleRate);const data=noiseBuffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,1.6);
  }
  if(audio.state==='suspended')audio.resume().catch(()=>{});
  }catch{/* Visuals still run when audio is unavailable. */}
}
function trackSound(source,...nodes){sounds.add(source);source.onended=()=>{sounds.delete(source);source.disconnect();for(const node of nodes)node.disconnect()}}
function silence(){for(const source of sounds){try{source.stop()}catch{}}sounds.clear()}
function boom(size,delay=0,deep=Math.random()<.2){
  if(!audio||audio.state!=='running')return;const t=audio.currentTime+delay;
  deep=deep&&t-lastDeepBoom>2.2;if(deep)lastDeepBoom=t;
  size=Math.min(size,1.3)*(t-lastBoom<.2?.52:1);lastBoom=t;
  const low=audio.createOscillator(),lg=audio.createGain();low.type='sine';low.frequency.setValueAtTime(deep?rnd(42,54):95-size*22,t);low.frequency.exponentialRampToValueAtTime(deep?22:34,t+(deep?.9:.55));lg.gain.setValueAtTime(.0001,t);lg.gain.exponentialRampToValueAtTime((deep?.58:.3)*size,t+.012);lg.gain.exponentialRampToValueAtTime(.0001,t+(deep?1.35:.75));low.connect(lg).connect(master);low.start(t);low.stop(t+1.4);
  const noise=audio.createBufferSource(),filter=audio.createBiquadFilter(),ng=audio.createGain();noise.buffer=noiseBuffer;filter.type='lowpass';filter.frequency.value=deep?rnd(260,480):900+size*900;ng.gain.setValueAtTime(.0001,t);ng.gain.exponentialRampToValueAtTime((deep?.48:.28)*size,t+.008);ng.gain.exponentialRampToValueAtTime(.0001,t+(deep?1.05:.65));noise.connect(filter).connect(ng).connect(master);noise.start(t);noise.stop(t+1.1);
  trackSound(low,lg);trackSound(noise,filter,ng);
  if(deep){
    const echo=audio.createOscillator(),eg=audio.createGain();echo.type='sine';echo.frequency.setValueAtTime(rnd(33,40),t+.17);echo.frequency.exponentialRampToValueAtTime(20,t+1.6);eg.gain.setValueAtTime(.0001,t+.17);eg.gain.exponentialRampToValueAtTime(.23*size,t+.19);eg.gain.exponentialRampToValueAtTime(.0001,t+1.85);echo.connect(eg).connect(master);echo.start(t+.17);echo.stop(t+1.9);trackSound(echo,eg);
    // A pitched-down rumble adds body on speakers that cannot reproduce the sub-bass.
    const rumble=audio.createBufferSource(),rf=audio.createBiquadFilter(),rg=audio.createGain();rumble.buffer=noiseBuffer;rumble.playbackRate.value=.52;rf.type='lowpass';rf.frequency.value=rnd(120,220);rg.gain.setValueAtTime(.0001,t+.04);rg.gain.exponentialRampToValueAtTime(.42*size,t+.09);rg.gain.exponentialRampToValueAtTime(.0001,t+1.7);rumble.connect(rf).connect(rg).connect(master);rumble.start(t+.04);rumble.stop(t+1.8);trackSound(rumble,rf,rg);
  }
}
function crackle(strength=.5){
  if(!audio||audio.state!=='running')return;const count=3+Math.random()*5|0;
  for(let i=0;i<count;i++){const o=audio.createBufferSource(),g=audio.createGain(),f=audio.createBiquadFilter(),t=audio.currentTime+rnd(.05,.65);o.buffer=noiseBuffer;f.type='highpass';f.frequency.value=rnd(1800,5000);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.06*strength,t+.002);g.gain.exponentialRampToValueAtTime(.0001,t+.035);o.connect(f).connect(g).connect(master);o.start(t,rnd(0,.8),.05);o.stop(t+.06);trackSound(o,g,f)}
}
function hiss(duration=2.5){
  if(!audio||audio.state!=='running')return;const t=audio.currentTime,source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=noiseBuffer;source.loop=true;filter.type='bandpass';filter.frequency.value=2600;filter.Q.value=.45;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.055,t+.08);gain.gain.setValueAtTime(.055,t+duration-.2);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);source.connect(filter).connect(gain).connect(master);source.start(t);source.stop(t+duration+.03);trackSound(source,filter,gain)
}

function trail(x,y,hue,alpha=.6,size=1){if(embers.length<MAX_EMBERS)embers.push({x,y,vx:rnd(-.12,.12),vy:rnd(-.1,.1),life:rnd(.2,.5),max:.5,hue,alpha,size})}
function spark(x,y,vx,vy,o={}){if(particles.length>=MAX_PARTICLES)return;const life=o.life??rnd(1.15,2.2);particles.push({x,y,px:x,py:y,vx,vy,drag:o.drag??rnd(.975,.988),gravity:o.gravity??rnd(42,72),life,max:life,hue:o.hue??45,sat:o.sat??95,light:o.light??66,size:o.size??rnd(.75,2),twinkle:!!o.twinkle,willow:!!o.willow,split:!!o.split,splitAt:o.splitAt??0,fountain:!!o.fountain,tail:!!o.tail})}
function later(delay,action){if(cues.length<24)cues.push({at:performance.now()+delay,action})}
function launch(x=rnd(width*.12,width*.88),targetY=rnd(height*.12,height*.54),scale=rnd(.7,1.3),hues=pick(palettes),style=null){
  if(particles.length>680||rockets.length>=4||fountains.length)return;rockets.push({x,y:height+rnd(8,35),vx:rnd(-.25,.25),vy:-rnd(height*.62,height*.82),targetY,scale,hues,style,trail:0});launches++;canvas.dataset.launchCount=String(launches);
}
function shell(x,y,scale,hues,style){
  const hue=pick(hues),styles=['peony','peony','chrysanthemum','chrysanthemum','willow','palm','ring','crossette','pistil'],kind=style||pick(styles);
  const count=Math.round(({peony:92,chrysanthemum:128,willow:76,palm:24,ring:72,crossette:22,pistil:118}[kind]||90)*scale),speed=Math.min(width*.42,height*.3,rnd(105,205))*scale;
  const tilt=rnd(.3,.85),rotation=rnd(0,TAU),palmArms=pick([6,7,8]);
  for(let i=0;i<count;i++){
    let a=i/count*TAU+rnd(-.025,.025);const ring=kind==='ring',palm=kind==='palm',willow=kind==='willow',variation=ring?.98+rnd(-.035,.035):palm?rnd(.8,1):Math.pow(Math.random(),.18),v=speed*variation;
    if(palm)a=(i%palmArms)/palmArms*TAU+rnd(-.045,.045);
    let vx=Math.cos(a)*v,vy=Math.sin(a)*v;
    if(palm){vx*=.72;vy*=1.2}
    if(ring){vy*=tilt;const rx=vx*Math.cos(rotation)-vy*Math.sin(rotation);vy=vx*Math.sin(rotation)+vy*Math.cos(rotation);vx=rx}
    const gold=willow||Math.random()<.15,h=(gold?rnd(38,55):hue+rnd(-8,8)+360)%360;
    spark(x,y,vx,vy,{drag:willow?rnd(.986,.993):undefined,gravity:willow?rnd(28,45):ring?35:undefined,life:rnd(willow?2.5:1.15,willow?3.7:2.25)*scale,hue:h,sat:gold?75:95,light:gold?72:66,size:rnd(palm?2:0.75,palm?3.4:2.15)*Math.min(scale,1.2),twinkle:kind==='chrysanthemum'||kind==='pistil'||Math.random()<.2,willow,tail:palm||kind==='chrysanthemum',split:kind==='crossette',splitAt:rnd(.55,.9)});
  }
  if(kind==='pistil')for(let i=0;i<34*scale;i++){const a=rnd(0,TAU),v=rnd(35,75)*scale;spark(x,y,Math.cos(a)*v,Math.sin(a)*v,{life:rnd(.8,1.35),hue:(hue+150)%360,size:1.4,twinkle:true})}
}
function burst(r){
  const multi=r.style==='multi'||(!r.style&&Math.random()<.11);boom(r.scale,0,r.scale>1.08||Math.random()<.32);if(Math.random()<.62)crackle(r.scale);
  if(multi){shell(r.x,r.y,r.scale*.7,r.hues,'pistil');later(650,()=>{boom(r.scale*.72,0,false);for(let i=0;i<3;i++){const a=i*TAU/3+rnd(-.22,.22),d=rnd(32,68);shell(r.x+Math.cos(a)*d,r.y+Math.sin(a)*d,r.scale*.48,r.hues,i%2?'ring':'peony')}});return}
  shell(r.x,r.y,r.scale,r.hues,r.style);
}
function fountainPattern(now){
  if(particles.length>350||rockets.length||cues.length)return false;const mode=pick(['fan','wave','crown']),count=mode==='wave'?5:mode==='crown'?3:1,duration=rnd(2.5,3.3),hues=pick(palettes);fountains=[];
  for(let i=0;i<count;i++)fountains.push({x:count===1?width*.5:width*(i+1)/(count+1),start:now+i*(mode==='wave'?180:0),end:now+duration*1000+i*(mode==='wave'?180:0),last:0,phase:i*.9,mode,hue:hues[i%hues.length]});hiss(duration+.7);return true
}
function schedule(now){
  const remaining=endAt-now,density=Math.random();
  if(now>=nextFountain&&remaining>7000){if(fountainPattern(now)){nextFountain=now+rnd(13000,19000);nextLaunch=now+5700}else nextLaunch=now+700;return}
  let count=density<.16?3:density<.46?2:1;if(particles.length>500)count=1;if(remaining<5000)count=Math.min(3,Math.max(count,2));
  for(let i=0;i<count;i++)later(i*rnd(180,340),()=>launch(undefined,undefined,undefined,undefined,Math.random()<.1?'multi':null));
  nextLaunch=now+(density<.16?rnd(3000,4200):density<.46?rnd(1600,2400):rnd(950,1800));
}
function start(){
  if(destroyed)return;
  silence();ensureAudio();particles=[];rockets=[];embers=[];fountains=[];cues=[];launches=0;running=true;canvas.dataset.running='true';endAt=performance.now()+60000;nextLaunch=performance.now()+1400;nextFountain=performance.now()+rnd(6500,11000);lastBoom=lastDeepBoom=-10;
  ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,width,height);if(!transparent){ctx.fillStyle='#02030a';ctx.fillRect(0,0,width,height)}launch();queueFrame();
  if(typeof options.onStart==='function')options.onStart();
}
function stop(){running=false;cues=[];fountains=[];rockets=[];canvas.dataset.running='false'}
if(options.clickReplay!==false){canvas.addEventListener('click',start);canvas.addEventListener('pointerdown',ensureAudio,{once:true})}
function destroy(){
  if(destroyed)return;destroyed=true;stop();silence();if(audio)audio.close().catch(()=>{});
  if(frameId!==null)cancelAnimationFrame(frameId);frameId=null;
  removeEventListener('resize',resize);canvas.removeEventListener('click',start);canvas.removeEventListener('pointerdown',ensureAudio);
  ctx.clearRect(0,0,width,height);if(transparent)canvas.remove();
}
function queueFrame(){if(frameId===null&&!destroyed)frameId=requestAnimationFrame(frame)}

function frame(now){
  frameId=null;if(destroyed)return;
  const dt=Math.min(.033,(now-last)/1000||.016);last=now;
  ctx.globalCompositeOperation=transparent?'destination-out':'source-over';ctx.fillStyle=`rgba(2,3,10,${1-Math.pow(.8,dt*60)})`;ctx.fillRect(0,0,width,height);
  if(running&&now>=endAt)stop();if(running&&now>=nextLaunch)schedule(now);
  for(let i=cues.length-1;i>=0;i--){if(now>=cues[i].at){const cue=cues.splice(i,1)[0];if(running)cue.action()}}
  for(let i=fountains.length-1;i>=0;i--){
    const f=fountains[i];if(now>f.end){fountains.splice(i,1);continue}if(now<f.start)continue;
    if(!f.last)f.last=now;
    if(now-f.last<45)continue;f.last=now;
    const age=(now-f.start)/1000,fade=Math.min(1,(f.end-now)/450,(now-f.start)/250);
    const count=f.mode==='fan'?4:f.mode==='crown'?2:1;
    for(let j=0;j<count;j++){
      const angle=f.mode==='fan'?Math.sin(age*2.2+f.phase)*.48+(j-1.5)*.12:f.mode==='wave'?Math.sin(age*3+f.phase)*.28:(j-.5)*.55;
      const speed=height*rnd(.72,.95)*(.7+.3*Math.max(0,fade));
      spark(f.x+rnd(-2,2),height-2,Math.sin(angle)*Math.min(speed,width*.85),-Math.cos(angle)*speed,{hue:(f.hue+age*18)%360,life:rnd(1,1.65),gravity:height*.67,drag:.994,size:rnd(.8,1.5),light:76,twinkle:true,fountain:true,tail:true});
    }
    trail(f.x,height-3,f.hue,.7,2.5);
  }
  ctx.globalCompositeOperation='lighter';
  for(let i=rockets.length-1;i>=0;i--){
    const r=rockets[i];r.x+=r.vx*dt;r.y+=r.vy*dt;r.vy+=115*dt;r.trail-=dt;
    if(r.trail<=0){trail(r.x,r.y,pick(r.hues),.75,1.5);r.trail=.018}
    const flare=ctx.createRadialGradient(r.x,r.y,0,r.x,r.y,7);flare.addColorStop(0,'rgba(255,255,255,.95)');flare.addColorStop(.25,`hsla(${pick(r.hues)},100%,70%,.75)`);flare.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=flare;ctx.fillRect(r.x-7,r.y-7,14,14);
    if(r.y<=r.targetY||r.vy>-55){rockets.splice(i,1);burst(r)}
  }
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.px=p.x;p.py=p.y;p.vx*=Math.pow(p.drag,dt*60);p.vy=p.vy*Math.pow(p.drag,dt*60)+p.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
    if(p.split&&p.max-p.life>=p.splitAt&&running){
      particles.splice(i,1);
      for(let j=0;j<4;j++){const a=j*TAU/4+Math.PI/4;spark(p.x,p.y,p.vx*.3+Math.cos(a)*48,p.vy*.3+Math.sin(a)*48,{hue:p.hue,life:rnd(.65,1.05),size:p.size*.75,tail:true})}
      continue;
    }
    if(p.life<=0||p.y>height+35){particles.splice(i,1);continue}
    if((p.willow||p.tail)&&Math.random()<Math.min(1,dt*(p.fountain?24:36)))trail(p.x,p.y,p.hue,p.willow?.4:.32,p.size*.55);
    const fade=Math.min(1,p.life/.55),blink=p.twinkle&&p.life<1?(.3+.7*Math.abs(Math.sin(p.life*38))):1;
    ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p.x,p.y);
    // A quiet dark edge keeps sparks visible over the white Clues page as well as the yellow grid.
    if(transparent){ctx.globalCompositeOperation='source-over';ctx.strokeStyle=`rgba(8,12,30,${fade*blink*.45})`;ctx.lineWidth=p.size+1.3;ctx.stroke()}
    ctx.strokeStyle=`hsla(${p.hue},${p.sat}%,${transparent?Math.min(46,p.light):p.light}%,${fade*blink})`;ctx.lineWidth=p.size;ctx.stroke();
    if(transparent)ctx.globalCompositeOperation='lighter';
    if(p.size>2.1){ctx.fillStyle=`hsla(${p.hue},100%,70%,${fade*.09})`;ctx.beginPath();ctx.arc(p.x,p.y,p.size*2.5,0,TAU);ctx.fill()}
    if(Math.random()<dt*3)trail(p.x,p.y,p.hue,.35,p.size*.6);
  }
  if(transparent)ctx.globalCompositeOperation='source-over';
  for(let i=embers.length-1;i>=0;i--){const e=embers[i];e.x+=e.vx;e.y+=e.vy;e.vy+=9*dt;e.life-=dt;if(e.life<=0){embers.splice(i,1);continue}const a=Math.max(0,e.life/e.max)*e.alpha;ctx.fillStyle=`hsla(${e.hue},100%,${transparent?39:72}%,${a})`;ctx.beginPath();ctx.arc(e.x,e.y,e.size,0,TAU);ctx.fill()}
  if(running||particles.length||embers.length)queueFrame();else if(transparent)destroy();
}
start();
return {start,destroy};
}

if(typeof module!=='undefined'&&module.exports)module.exports={createBabbleFireworks};
