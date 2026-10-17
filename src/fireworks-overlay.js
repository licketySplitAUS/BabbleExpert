'use strict';
const { createBabbleFireworks } = require('./experiments/fireworks');

// These canvases belong to the app, not to the puzzle. They intercept no input,
// create no audio, and remove themselves when the show finishes.
function makeFireworksOverlayScript(hosts) {
  return `(function(){
    if(!${JSON.stringify(hosts)}.includes(location.hostname))return false;
    if(window.__babbleExpertFireworks)window.__babbleExpertFireworks.destroy();
    const canvas=document.createElement('canvas');
    canvas.id='babble-expert-fireworks';
    canvas.setAttribute('aria-hidden','true');
    for(const [key,value] of Object.entries({position:'fixed',inset:'0',width:'100%',height:'100%',display:'block','pointer-events':'none','z-index':'2147483647',background:'transparent',opacity:'1',border:'0',margin:'0',padding:'0'}))canvas.style.setProperty(key,value,'important');
    document.documentElement.appendChild(canvas);
    window.__babbleExpertFireworks=(${createBabbleFireworks.toString()})(canvas,{transparent:true,sound:false,clickReplay:false});
    return true;
  })()`;
}

const stopFireworksOverlayScript = `(function(){
  if(window.__babbleExpertFireworks){window.__babbleExpertFireworks.destroy();delete window.__babbleExpertFireworks;}
})()`;

module.exports = { makeFireworksOverlayScript, stopFireworksOverlayScript };
