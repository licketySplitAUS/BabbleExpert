'use strict';

function createCompletionTracker() {
  const completed = new Set();
  let grid = '', previous = null;
  return state => {
    if (!state.ready || !/^[A-Z]{25}$/.test(state.gridLetters || '') || !/^\d+$/.test(String(state.remaining))) return false;
    if (grid !== state.gridLetters) { grid = state.gridLetters; previous = null; }
    const remaining = Number(state.remaining);
    const celebrate = remaining === 0 && previous !== null && previous > 0 && !completed.has(grid);
    // An already-complete puzzle on launch also consumes its automatic show.
    // Loading, source changes and counter corrections must not rearm it.
    if (remaining === 0) {
      completed.add(grid);
      if (completed.size > 32) completed.delete(completed.values().next().value);
    }
    previous = remaining;
    return celebrate;
  };
}

// These canvases belong to the app, not to the puzzle. They intercept no input,
// create no audio, and remove themselves when the show finishes.
function celebrationWords(snapshot, gridLetters) {
  if (!/^[A-Z]{25}$/.test(gridLetters || '') || snapshot?.gridLetters !== gridLetters || snapshot.remaining == null ||
      snapshot.wordListReady === false || snapshot.hasAddWord === false || !Array.isArray(snapshot.words) || snapshot.words.length > 10000 ||
      !snapshot.words.every(word => typeof word === 'string' && /^[a-z]{4,25}$/i.test(word))) return [];
  return [...new Set(snapshot.words.map(word => word.toLowerCase()))].sort();
}

function makeFireworksOverlayScript(hosts, effect = 'fireworks', seed = 1, animations, pack, words = []) {
  // Optional effects should not be parsed during a cold application start.
  // CommonJS caches them after the first celebration.
  pack = pack || require('./celebration-pack').bundledPack();
  return `(function(){
    if(!${JSON.stringify(hosts)}.includes(location.hostname))return false;
    if(window.__babbleExpertFireworks)window.__babbleExpertFireworks.destroy();
    const canvas=document.createElement('canvas');
    canvas.id='babble-expert-fireworks';
    canvas.setAttribute('aria-hidden','true');
    for(const [key,value] of Object.entries({position:'fixed',inset:'0',width:'100%',height:'100%',display:'block','pointer-events':'none','z-index':'2147483647',background:'transparent',opacity:'1',border:'0',margin:'0',padding:'0'}))canvas.style.setProperty(key,value,'important');
    document.documentElement.appendChild(canvas);
    window.__babbleExpertFireworks=(${pack.renderer})(canvas,{transparent:true,sound:false,clickReplay:false,${typeof animations === 'boolean' ? `reducedMotion:${!animations},` : ''}effect:${JSON.stringify(effect)},seed:${JSON.stringify(seed)},words:${JSON.stringify(words)},fireworksFactory:(${pack.fireworks})});
    return true;
  })()`;
}

const stopFireworksOverlayScript = `(function(){
  if(window.__babbleExpertFireworks){window.__babbleExpertFireworks.destroy();delete window.__babbleExpertFireworks;}
})()`;

module.exports = { makeFireworksOverlayScript, stopFireworksOverlayScript, createCompletionTracker, celebrationWords };
