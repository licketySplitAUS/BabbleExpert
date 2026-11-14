/** Self-contained canvas renderer, shared with Expert by tools/sync-celebrations.cjs. */
function createBabbleCelebration(canvas, options = {}) {
  const effects = ['fireworks', 'disco', 'lasers', 'lanterns', 'poppers', 'champagne', 'balloons', 'scroll', 'curtain', 'glitter', 'powder', 'slime', 'butterflies', 'ocean', 'shooting-stars', 'rainbow-falls', 'birdsong', 'hummingbirds', 'paper-planes', 'cherry-blossoms', 'space', 'jellyfish', 'fireflies', 'soap-bubbles', 'autumn', 'peacock', 'magic-paint', 'aurora', 'aether', 'word-cloud', 'protoplasm', 'fibre-tunnel', 'monument', 'perfect-alignment', 'forged-gold', 'word-echoes', 'final-inscription', 'type-gravity', 'beyond-horizon', 'prismatic-language', 'silence-after', 'thousand-strokes'];
  const labels = ['Fireworks', 'Disco ball', 'Laser show', 'Rising lanterns', 'Party poppers', 'Champagne', 'Helium balloons', 'Congratulations scroll', 'Red stage curtain', 'Glitter bombs', 'Colour powder', 'Fluorescent slime', 'Butterfly garden', 'Ocean party', 'Shooting stars', 'Rainbow waterfall', 'Birdsong morning', 'Hummingbird dance', 'Paper planes', 'Cherry blossoms', 'Space adventure', 'Dancing jellyfish', 'Firefly evening', 'Soap bubble rainbow', 'Autumn swirl', 'Peacock display', 'Magic paintbrush', 'Northern lights', 'Æther', 'Found-word cloud', 'Protoplasm', 'Fibre Tunnel', 'Monument of Words', 'The Perfect Alignment', 'Forged in Gold', 'Echoes of Achievement', 'The Final Inscription', 'Typographic Gravity', 'Beyond the Horizon', 'Prismatic Language', 'The Silence After', 'A Thousand Strokes'];
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { start() {}, destroy() {}, effects, labels };
  let w = 1, h = 1, frame = null, child = null, dead = false, started = 0, last = 0, next = 0;
  let effect = '', seed = 1, items = [], sparks = [], variant = 0, reduced = false;
  let showSeed = 1;
  let cloudLayout = null;
  const titleLayouts = new Map();
  let audio = null, master = null, noiseBuffer = null, soundEnabled = options.sound !== false, nextSound = 0, soundStep = 0, lastImpact = -Infinity;
  const voices = new Set();
  const tau = Math.PI * 2, duration = Math.max(1000, Math.min(60000, options.duration || 60000));
  // Words are transient puzzle input, never part of rotation storage or reports.
  const foundWords = Array.isArray(options.words) && options.words.length <= 10000
    ? [...new Set(options.words.filter(word => typeof word === 'string' && /^[a-z]{4,25}$/i.test(word)).map(word => word.toLowerCase()))].sort() : [];
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rnd = (a, b) => a + random() * (b - a);
  const colour = (hue, alpha = 1, light = 58) => `hsla(${hue},90%,${light}%,${alpha})`;
  function nextEffect() {
    const key = options.rotationKey || 'lickety-celebration-rotation:v1';
    // Keep a session fallback when private browsing denies storage. A failed
    // write must not let an older disk copy rewind the next selection.
    const memory = globalThis.__licketyCelebrationRotations || (globalThis.__licketyCelebrationRotations = Object.create(null));
    const remembered = memory[key];
    // Version-1 bags before downloadable catalogs contained these twelve IDs.
    // Keep their consumed entries while adding the new catalog to that round.
    const legacyCatalog = ['fireworks', 'disco', 'lasers', 'lanterns', 'poppers', 'champagne', 'balloons', 'scroll', 'curtain', 'glitter', 'powder', 'slime'];
    const valid = bag => {
      const catalog = bag?.catalog || legacyCatalog;
      return bag && bag.version === 1 && Array.isArray(catalog) && catalog.length <= 100 &&
        catalog.every(id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(id)) && new Set(catalog).size === catalog.length &&
        Array.isArray(bag.remaining) && bag.remaining.length <= catalog.length &&
        bag.remaining.every(id => catalog.includes(id)) && new Set(bag.remaining).size === bag.remaining.length &&
        (bag.last === null || catalog.includes(bag.last)) && !bag.remaining.includes(bag.last);
    };
    let bag = remembered?.unsaved ? remembered.bag : null;
    if (!bag) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw && raw.length <= 16384) { const saved = JSON.parse(raw); if (valid(saved)) bag = saved; }
      } catch { /* Memory keeps the rotation usable when storage is unavailable. */ }
    }
    if (!bag && valid(remembered?.bag)) bag = remembered.bag;
    if (!valid(bag)) bag = { version: 1, catalog: effects.slice(), remaining: [], last: null };
    if (!bag.catalog) bag.catalog = legacyCatalog;
    if (bag.catalog) {
      // Preserve the unfinished round. Play shuffled additions first, then the
      // remaining older shows; already-seen shows stay consumed until next round.
      bag.remaining = bag.remaining.filter(id => effects.includes(id));
      const additions = effects.filter(id => !bag.catalog.includes(id));
      for (let i = additions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [additions[i], additions[j]] = [additions[j], additions[i]]; }
      // Selection pops from the end, so append the new shows above the old deck.
      bag.remaining.push(...additions);
      if (!effects.includes(bag.last)) bag.last = null;
    }
    bag.catalog = effects.slice();
    if (!bag.remaining.length) {
      bag.remaining = effects.slice();
      for (let i = bag.remaining.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag.remaining[i], bag.remaining[j]] = [bag.remaining[j], bag.remaining[i]]; }
      // The first show in a new round must also differ from the previous show.
      const end = bag.remaining.length - 1;
      if (end > 0 && bag.remaining[end] === bag.last) { const other = Math.floor(Math.random() * end); [bag.remaining[end], bag.remaining[other]] = [bag.remaining[other], bag.remaining[end]]; }
    }
    const selected = bag.remaining.pop(); bag.last = selected;
    const record = memory[key] = { bag, unsaved: true };
    try { window.localStorage.setItem(key, JSON.stringify(bag)); record.unsaved = false; } catch { /* Never interrupt the celebration for a failed cache write. */ }
    return selected;
  }
  function ensureAudio() {
    if (!soundEnabled || reduced || dead || effect === 'fireworks') return;
    try {
      if (!audio) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) { canvas.dataset.sound = 'unavailable'; return; }
        audio = new Audio(); master = audio.createGain(); master.gain.value = .28;
        const compressor = audio.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.ratio.value = 4;
        master.connect(compressor).connect(audio.destination);
        noiseBuffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * 2), audio.sampleRate);
        const data = noiseBuffer.getChannelData(0); let noiseSeed = 7513;
        // Audio must not consume the visual random sequence shared by Expert's panes.
        for (let i = 0; i < data.length; i++) { noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0; data[i] = noiseSeed / 2147483648 - 1; }
      }
      master.gain.value = .28;
      canvas.dataset.sound = audio.state === 'running' ? 'playing' : 'blocked';
      if (audio.state === 'suspended') audio.resume().then(() => { if (!dead && soundEnabled) canvas.dataset.sound = 'playing'; }).catch(() => {});
    } catch { canvas.dataset.sound = 'unavailable'; }
  }
  function silence() {
    for (const voice of voices) { voice.source.onended = null; try { voice.source.stop(); } catch {} voice.source.disconnect(); for (const node of voice.nodes) node.disconnect(); }
    voices.clear();
  }
  function track(source, ...nodes) {
    const voice = { source, nodes }; voices.add(voice);
    source.onended = () => { voices.delete(voice); source.disconnect(); for (const node of nodes) node.disconnect(); };
  }
  function tone(from, to, length, volume = .1, type = 'sine', delay = 0) {
    if (!soundEnabled || !audio || audio.state !== 'running' || voices.size >= 48) return;
    const t = audio.currentTime + delay, source = audio.createOscillator(), gain = audio.createGain(); source.type = type;
    source.frequency.setValueAtTime(from, t); source.frequency.exponentialRampToValueAtTime(to, t + length);
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + .015); gain.gain.exponentialRampToValueAtTime(.0001, t + length);
    source.connect(gain).connect(master); track(source, gain); source.start(t); source.stop(t + length + .02);
  }
  function noise(length, volume, frequency, type = 'lowpass', delay = 0) {
    if (!soundEnabled || !audio || audio.state !== 'running' || voices.size >= 48) return;
    const t = audio.currentTime + delay, source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = noiseBuffer; source.loop = true; filter.type = type; filter.frequency.value = frequency; filter.Q.value = .6;
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + .015); gain.gain.exponentialRampToValueAtTime(.0001, t + length);
    source.connect(filter).connect(gain).connect(master); track(source, filter, gain); source.start(t); source.stop(t + length + .02);
  }
  function impact(kind) {
    if (reduced || !soundEnabled) return;
    const now = performance.now(); if (now - lastImpact < (kind === 'bounce' ? 350 : 100)) return; lastImpact = now;
    if (kind === 'poppers') { noise(.1, .4, 2200, 'highpass'); tone(180, 65, .12, .18); noise(.65, .07, 3500, 'highpass', .06); }
    else if (kind === 'champagne') { tone(550, 90, .14, .25); noise(.09, .3, 1200); noise(1.25, .18, 3100, 'highpass', .09); }
    else if (kind === 'powder') { tone(95, 38, .28, .26); noise(.2, .35, 550); noise(1, .2, 1200, 'bandpass', .05); }
    else if (kind === 'bounce') { tone(effect === 'balloons' ? 350 : 100, effect === 'balloons' ? 480 : 55, .09, .07); }
    else if (kind === 'glitter') { noise(.65, .09, 5000, 'highpass'); [1046.5, 1318.5, 1568, 2093, 2637].forEach((note, i) => tone(note, note, .6, .09, 'sine', i * .065)); }
  }
  function soundtrack(now) {
    if (reduced || !soundEnabled || !audio || audio.state !== 'running' || now < nextSound || now - started > duration - 3000) return;
    const step = soundStep++; let interval = 1;
    if (effect === 'disco') {
      interval = .25; noise(.045, .1, 6500, 'highpass');
      if (step % 2 === 0) tone(110, 42, .2, .4);
      if (step % 4 === 2) noise(.14, .2, 1800, 'bandpass');
      if (step % 4 === 0) [220, 277.18, 329.63].forEach(note => tone(note, note, .2, .05, 'triangle'));
    } else if (effect === 'lasers') { interval = .55; tone(step % 2 ? 1700 : 160, step % 2 ? 90 : 2400, .4, .16, 'triangle'); noise(.25, .04, 2400, 'bandpass'); }
    else if (effect === 'lanterns') { interval = 1.4; const note = [523.25, 659.25, 783.99, 1046.5, 880][step % 5]; tone(note, note, 1.25, .13); tone(note * 2, note * 2, .7, .035); noise(1.1, .025, 750, 'bandpass'); }
    else if (effect === 'balloons') { interval = 1.25; tone(160 + step % 4 * 35, 400 + step % 4 * 50, .32, .1); noise(.8, .025, 650, 'bandpass'); }
    else if (effect === 'scroll') { interval = 6; noise(.8, .06, 1700, 'bandpass'); [392, 493.88, 587.33, 783.99, 987.77].forEach((note, i) => tone(note, note, 1, .15, 'sine', i * .15)); }
    else if (effect === 'curtain') {
      const phase = step % 3; interval = [3, 4, 8][phase];
      if (phase === 0) { noise(2.9, .15, 550); tone(75, 45, 1.2, .09); }
      else if (phase === 1) { tone(110, 50, .65, .3); [261.63, 329.63, 392, 523.25].forEach(note => tone(note, note, 1.7, .09, 'triangle')); }
      else noise(2.8, .13, 900, 'bandpass');
    } else if (effect === 'slime') { interval = .85; const pitch = 100 + step % 5 * 23; tone(pitch, pitch * 2.3, .22, .22); noise(.25, .09, 850); tone(520, 130, .13, .1, 'sine', .22); }
    else if (sceneScores[effect]) {
      const [pace, notes, voice, length] = sceneScores[effect], note = notes[step % notes.length];
      interval = pace;
      tone(note, note, length, .12, voice);
      tone(note * 2, note * 2, length * .65, .025, 'sine', .075);
      if (effect === 'ocean') { noise(.9, .07, 800, 'lowpass'); tone(1500, 2200, .16, .045, 'sine', .28); }
      else if (effect === 'rainbow-falls') noise(.85, .05, 1800, 'bandpass');
      else if (effect === 'birdsong' || effect === 'hummingbirds') { tone(note * 2, note * 3.1, .1, .05, 'sine', .16); tone(note * 3, note * 2, .13, .035, 'sine', .34); }
      else if (effect === 'paper-planes' || effect === 'autumn' || effect === 'cherry-blossoms') noise(.6, .025, effect === 'autumn' ? 1100 : 2800, 'bandpass');
      else if (effect === 'space') { noise(.8, .035, 450, 'lowpass'); tone(note * .25, note * .5, .6, .07, 'triangle'); }
      else if (effect === 'soap-bubbles') tone(note * .7, note * 1.5, .09, .09);
      else if (effect === 'magic-paint') noise(.22, .04, 2200, 'bandpass');
      else if (effect === 'fireflies' && step % 3 === 0) tone(3400, 3100, .035, .018, 'sine', .22);
      else if (effect === 'protoplasm') { tone(note * .5, note * .51, 2.7, .05); noise(1.8, .018, 500, 'lowpass'); }
      else if (effect === 'fibre-tunnel') tone(note * .5, note * 2, .16, .035, 'triangle', .12);
      else if (effect === 'aether') tone(note * 1.5, note * 2, 1.2, .035, 'sine', .2);
      else if (effect === 'monument') { tone(note * .5, note * .5, 3.4, .09, 'sine'); [1.5, 2.5, 3].forEach(ratio => tone(note * ratio, note * ratio, 2.6, .04, 'triangle', .15)); }
      else if (effect === 'perfect-alignment') tone(note * 3, note * 3, .9, .025, 'sine', .3);
      else if (effect === 'forged-gold') { noise(.4, .035, 3200, 'highpass'); tone(note * 3.01, note * 3, 1.1, .035); }
      else if (effect === 'word-echoes') [1.5, 2.01, 2.76].forEach((ratio, i) => tone(note * ratio, note * ratio, 2.2, .035 / (i + 1), 'sine', i * .18));
      else if (effect === 'final-inscription') { noise(.07, .07, 1400, 'bandpass'); tone(70, 42, .12, .055); }
      else if (effect === 'type-gravity') { tone(note * .5, note * .25, .8, .08); noise(.6, .025, 600, 'lowpass'); }
      else if (effect === 'beyond-horizon') { tone(note * 1.5, note * 1.5, 2.7, .045); tone(note * .5, note * .5, 2.6, .05); }
      else if (effect === 'prismatic-language') [1.501, 2.002].forEach((ratio, i) => tone(note * ratio, note * ratio, 1.6, .025, 'sine', .2 + i * .14));
      else if (effect === 'silence-after') [329.63, 392, 523.25].forEach((pitch, i) => tone(pitch, pitch, 3.8 - i * .2, .045, 'triangle', i * .018));
      else if (effect === 'thousand-strokes') { tone(note * 1.5, note * 1.5, .65, .025, 'sine', .1); noise(.12, .012, 2500, 'bandpass'); }
      else if (effect === 'aurora') { tone(note * .5, note * .5, 2.7, .045); tone(note * 1.5, note * 1.5, 2, .03, 'sine', .2); }
    }
    nextSound = now + interval * 1000;
  }
  // Distinct, bounded synthesized scores. Audio never draws from visual randomness.
  const sceneScores = {
    butterflies: [1.1, [784, 988, 1175, 1568, 1319, 988], 'sine', 1.1],
    ocean: [1.35, [392, 523, 659, 587, 440], 'sine', .8],
    'shooting-stars': [.65, [1047, 1319, 1568, 2093, 1760, 1397], 'sine', 1.2],
    'rainbow-falls': [.42, [1047, 988, 880, 784, 698, 659, 587], 'sine', .65],
    birdsong: [1.2, [880, 1175, 988, 1319, 1047], 'sine', .24],
    hummingbirds: [.7, [1175, 1568, 1397, 1760, 1319], 'sine', .22],
    'paper-planes': [.95, [349, 440, 523, 698, 587, 440], 'triangle', .5],
    'cherry-blossoms': [1.45, [330, 440, 494, 659, 587, 440], 'triangle', 1.3],
    space: [.6, [262, 330, 392, 523, 659, 784], 'triangle', .5],
    jellyfish: [1.8, [294, 370, 440, 554, 440, 370], 'sine', 2.2],
    fireflies: [1.65, [988, 784, 659, 880, 1175, 784], 'sine', 1.8],
    'soap-bubbles': [.55, [698, 1047, 880, 1397, 1175, 784, 1568], 'sine', .28],
    autumn: [1.3, [220, 277, 330, 440, 370, 277], 'triangle', 1.5],
    peacock: [.32, [294, 330, 370, 440, 494, 587, 740, 880, 1175], 'sine', .9],
    'magic-paint': [.5, [440, 554, 659, 880, 740, 622, 494], 'triangle', .55],
    aurora: [2.4, [196, 247, 294, 370, 330, 247], 'sine', 3],
    aether: [.85, [147, 220, 294, 370, 440, 330, 247], 'sine', 1.8],
    'word-cloud': [.45, [330, 415, 494, 659, 554, 440, 370], 'triangle', .32],
    protoplasm: [2.1, [110, 165, 207.65, 277, 185], 'sine', 2.8],
    'fibre-tunnel': [.3, [196, 294, 392, 587, 784, 659, 494, 330], 'sine', .65],
    monument: [3.8, [65.41, 98, 130.81, 164.81], 'triangle', 3.6],
    'perfect-alignment': [.62, [293.66, 369.99, 440, 587.33, 739.99], 'sine', 1.5],
    'forged-gold': [1.25, [146.83, 220, 293.66, 349.23, 440], 'triangle', 1.2],
    'word-echoes': [2.6, [174.61, 261.63, 349.23, 523.25], 'sine', 2.5],
    'final-inscription': [.78, [130.81, 196, 246.94, 293.66], 'triangle', .85],
    'type-gravity': [1.05, [82.41, 123.47, 164.81, 246.94, 329.63], 'sine', 1.2],
    'beyond-horizon': [2.2, [110, 164.81, 220, 277.18, 369.99], 'sine', 2.5],
    'prismatic-language': [.95, [554.37, 698.46, 830.61, 1108.73], 'sine', 1.7],
    'silence-after': [90, [261.63], 'triangle', 3.8],
    'thousand-strokes': [.58, [220, 293.66, 369.99, 440, 587.33], 'triangle', 1.1]
  };
  function unlockSound() { if (canvas.dataset.running === 'true' && !reduced) { if (child) child.setSoundEnabled?.(soundEnabled); else ensureAudio(); } }
  function setSoundEnabled(enabled) {
    soundEnabled = !!enabled; options.sound = soundEnabled;
    if (child) child.setSoundEnabled?.(soundEnabled);
    if (!soundEnabled || reduced) { silence(); if (master) master.gain.value = 0; canvas.dataset.sound = 'muted'; }
    else { ensureAudio(); nextSound = performance.now(); }
  }
  function resize() {
    cloudLayout = null; titleLayouts.clear();
    w = Math.max(1, innerWidth); h = Math.max(1, innerHeight);
    const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function ellipse(x, y, rx, ry, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, tau); ctx.fill(); }
  function path(points, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(...points[0]); for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]); ctx.closePath(); ctx.fill(); }
  function line(x, y, xx, yy, colour, width = 1) { ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xx, yy); ctx.stroke(); }
  function star(x, y, size, hue) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = colour(hue); ctx.fillRect(-size, -size, size * 2, size * 2); ctx.restore(); }
  function burst(x, y, hue, kind, count = 100) {
    for (let i = 0; i < count && sparks.length < 700; i++) {
      const a = rnd(0, tau), v = rnd(35, Math.min(w, h) * .55);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 70, life: rnd(1.5, 3.5), max: 3.5, size: rnd(kind === 'powder' ? 12 : 2, kind === 'powder' ? 35 : 6), hue: kind === 'confetti' ? rnd(0, 360) : hue + rnd(-15, 15), kind, phase: rnd(0, tau) });
    }
  }
  function spawn() {
    const hue = rnd(0, 360), r = rnd(18, 43), x = rnd(r, Math.max(r, w - r));
    if (effect === 'lanterns' || effect === 'balloons') {
      if (items.length < 28) items.push({ x, y: h + r * 3, r, hue, vx: rnd(-12, 12), vy: -rnd(Math.max(35, h / 13), Math.max(65, h / 8)), phase: rnd(0, tau) });
    } else if (effect === 'poppers' || effect === 'champagne' || effect === 'powder') {
      if (items.length < 8) {
        const p = { x, y: h + 65, r: rnd(22, 36), hue, vx: (w / 2 - x) * rnd(.1, .4), vy: -rnd(h * .65, h * .95), age: 0, angle: rnd(-.5, .5), popped: false, bounces: 0 };
        if (effect === 'powder') {
          // Aim into the upper part of each pane, rather than using a fixed
          // launch speed that keeps powder low in tall windows.
          const gravity = h * .65, apex = h * rnd(.16, .38);
          p.vy = -Math.sqrt(2 * gravity * (p.y - apex));
          p.airBurst = random() < .8;
          p.burstAt = p.airBurst ? (-p.vy / gravity) * rnd(.78, 1.12) : Infinity;
          p.bounceDelay = rnd(.22, .55);
        }
        items.push(p);
      }
    } else if (effect === 'glitter') { burst(x, rnd(h * .15, h * .75), hue, 'glitter', Math.round(rnd(70, 145))); impact('glitter'); }
  }
  function disco(t) {
    const radius = Math.min(110, w * .23), cx = w / 2;
    // Moving reflected patches stay translucent so the puzzle remains visible.
    for (let i = 0; i < 55; i++) {
      const a = i * 2.399 + t * .22, x = cx + Math.sin(a) * w * .58, y = (i * 91 + t * (12 + i % 5)) % (h + 60);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = colour(i * 37 + t * 18, .3); ctx.fillRect(-9, -4, 18, 8); ctx.restore();
    }
    ctx.save(); ctx.beginPath(); ctx.arc(cx, 0, radius, 0, Math.PI); ctx.clip();
    const g = ctx.createRadialGradient(cx - radius * .4, 0, 2, cx, 0, radius); g.addColorStop(0, '#fff'); g.addColorStop(.5, '#afbdce'); g.addColorStop(1, '#202940');
    ctx.fillStyle = g; ctx.fillRect(cx - radius, 0, radius * 2, radius);
    for (let row = 0; row < 9; row++) for (let col = -9; col < 10; col++) {
      const y = row * radius / 9, x = cx + (col + (t * .6 % 1)) * radius / 9;
      ctx.fillStyle = colour(col * 22 + row * 18 + t * 25, .45, 60 + 25 * Math.sin(col + row + t)); ctx.fillRect(x, y, radius / 9 - 2, radius / 9 - 2);
    }
    ctx.restore(); ellipse(cx, radius * .24, 4, 4, '#fff');
  }
  function lasers(t) {
    for (let side = 0; side < 2; side++) for (let i = 0; i < 9; i++) {
      const x = w * (side ? .8 : .2), y = side ? -10 : h + 10, angle = Math.sin(t * .6 + i * .17 + side) * .95;
      const xx = x + Math.sin(angle) * h * 1.3, yy = side ? h + 20 : -20, hue = i * 39 + side * 120 + t * 12;
      path([[x, y], [xx - 12, yy], [xx + 12, yy]], colour(hue, .025));
      line(x, y, xx, yy, colour(hue, .12), 8); line(x, y, xx, yy, colour(hue, .72), 1.3);
    }
  }
  function floaters(t, dt) {
    // Spatial work is bounded by 28 balloons, with a gentle equal-mass collision response.
    if (effect === 'balloons') for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j], dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy), limit = (a.r + b.r) * .95;
      if (distance > .01 && distance < limit) { const nx = dx / distance, ny = dy / distance, overlap = (limit - distance) / 2; a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap; const impulse = Math.min(0, (b.vx - a.vx) * nx + (b.vy - a.vy) * ny); if (impulse < -5) impact('bounce'); a.vx += impulse * nx; b.vx -= impulse * nx; a.vy += impulse * ny; b.vy -= impulse * ny; }
    }
    for (const p of items) {
      p.x += (p.vx + Math.sin(t + p.phase) * 9) * dt; p.y += p.vy * dt;
      if (p.x < p.r || p.x > w - p.r) { p.x = Math.max(p.r, Math.min(w - p.r, p.x)); p.vx *= -.8; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(t + p.phase) * .07);
      if (effect === 'lanterns') {
        const glow = ctx.createRadialGradient(0, p.r * .4, 1, 0, 0, p.r * 1.8); glow.addColorStop(0, '#ffbf5555'); glow.addColorStop(1, '#ffbf5500'); ctx.fillStyle = glow; ctx.fillRect(-p.r * 2, -p.r * 2, p.r * 4, p.r * 4);
        const g = ctx.createLinearGradient(-p.r, 0, p.r, 0); g.addColorStop(0, colour(p.hue, .85, 35)); g.addColorStop(.5, '#ffe6a9'); g.addColorStop(1, colour(p.hue, .85, 35));
        path([[-p.r, -p.r], [p.r, -p.r], [p.r * .7, p.r], [-p.r * .7, p.r]], g);
        line(-p.r, -p.r, p.r, -p.r, '#9f6637', 2); line(-p.r * .7, p.r, p.r * .7, p.r, '#9f6637', 2);
        ctx.fillStyle = '#8d442e'; ctx.textAlign = 'center'; ctx.font = `${p.r * .85}px Georgia`; ctx.fillText('★', 0, p.r * .22);
        ellipse(0, p.r * .8, p.r * .13, p.r * .23, '#fff3b0');
      } else {
        const g = ctx.createRadialGradient(-p.r * .35, -p.r * .5, 1, 0, 0, p.r * 1.5); g.addColorStop(0, colour(p.hue, .95, 85)); g.addColorStop(.4, colour(p.hue, .93, 58)); g.addColorStop(1, colour(p.hue, .95, 27));
        ellipse(0, 0, p.r, p.r * 1.22, g); path([[-4, p.r * 1.18], [4, p.r * 1.18], [0, p.r * 1.36]], colour(p.hue));
        ctx.beginPath(); ctx.moveTo(0, p.r * 1.36); ctx.bezierCurveTo(-16, p.r + 35, 18, p.r + 60, Math.sin(t + p.phase) * 12, p.r + 90); ctx.strokeStyle = '#928ba5aa'; ctx.lineWidth = 1; ctx.stroke();
        ellipse(-p.r * .35, -p.r * .5, p.r * .14, p.r * .3, '#ffffff66');
      }
      ctx.restore();
    }
    items = items.filter(p => p.y > -p.r * 4);
  }
  function projectiles(dt) {
    for (const p of items) {
      p.age += dt; p.vy += h * .65 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (effect === 'powder' && p.y > h - p.r && p.vy > 0) {
        p.y = h - p.r; p.vy *= -.65; p.bounces++; impact('bounce');
        if (!p.airBurst && p.bounces === 1) p.burstAt = p.age + p.bounceDelay;
      }
      const ready = effect === 'powder' ? p.age >= p.burstAt : p.vy > -h * .15;
      if (!p.popped && ready) {
        p.popped = true; p.popAt = p.age;
        impact(effect);
        if (effect === 'powder') burst(p.x, p.y, p.hue, 'powder', 65);
        else if (effect === 'poppers') burst(p.x, p.y, p.hue, 'confetti', 100);
        else { burst(p.x, p.y - p.r * 1.7, 48, 'fizz', 100); sparks.push({ x: p.x, y: p.y - p.r * 2, vx: p.vx + 70, vy: -230, life: 2, max: 2, size: 6, hue: 37, kind: 'cork', phase: 0 }); }
      }
      if (p.popped && effect !== 'champagne') continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + (effect === 'powder' ? p.age * 3 : Math.sin(p.age * 2) * .12));
      if (effect === 'poppers') {
        path([[-p.r * .7, p.r], [p.r * .7, -p.r], [p.r, p.r * .5]], colour(p.hue));
        for (let j = 0; j < 3; j++) line(-p.r * .3 + j * 6, p.r * .8 - j * 7, p.r * .9, p.r * .5 - j * 8, '#ffe7a6', 3);
      } else if (effect === 'champagne') {
        ctx.fillStyle = '#174c36'; ctx.fillRect(-p.r * .42, -p.r * .4, p.r * .84, p.r * 1.6); ellipse(0, -p.r * .4, p.r * .42, p.r * .4, '#174c36'); ctx.fillRect(-p.r * .17, -p.r * 1.65, p.r * .34, p.r * 1.25);
        ctx.fillStyle = '#e9c563'; ctx.fillRect(-p.r * .19, -p.r * 1.65, p.r * .38, p.r * .7); ctx.fillStyle = '#fff2ce'; ctx.fillRect(-p.r * .39, p.r * .1, p.r * .78, p.r * .65); ctx.fillStyle = '#685226'; ctx.font = `${p.r * .4}px Georgia`; ctx.textAlign = 'center'; ctx.fillText('★', 0, p.r * .57);
        if (p.popped && p.age - p.popAt < 1.2) for (let j = 0; j < 5 && sparks.length < 700; j++) sparks.push({ x: p.x, y: p.y - p.r * 1.7, vx: rnd(-100, 100), vy: rnd(-320, -180), life: rnd(.6, 1.4), max: 1.4, size: rnd(1, 4), hue: 48, kind: 'fizz', phase: 0 });
      } else {
        ellipse(0, 0, p.r * .65, p.r, colour(p.hue)); ctx.fillStyle = '#55596b'; ctx.fillRect(-p.r * .3, -p.r * 1.15, p.r * .6, p.r * .3); ctx.fillStyle = '#fff'; ctx.font = `${p.r * .6}px Georgia`; ctx.textAlign = 'center'; ctx.fillText('★', 0, p.r * .2);
      }
      ctx.restore();
    }
    items = items.filter(p => p.age < 7 && (!p.popped || (effect === 'champagne' && p.age - p.popAt < 2)));
  }
  function particles(t, dt) {
    for (const p of sparks) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * (p.kind === 'powder' ? 1.1 : .3)); p.vy += (p.kind === 'powder' ? -8 : 65) * dt;
      const fade = Math.max(0, Math.min(1, p.life / .8));
      if (p.kind === 'powder') { const size = p.size * (1 + (p.max - p.life) * .7); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size); g.addColorStop(0, colour(p.hue, fade * .23)); g.addColorStop(1, colour(p.hue, 0)); ellipse(p.x, p.y, size, size, g); }
      else if (p.kind === 'confetti' || p.kind === 'cork') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 5 + p.phase); ctx.fillStyle = colour(p.hue, fade); ctx.fillRect(-p.size / 2, -p.size / 2, Math.max(.5, p.size * Math.abs(Math.cos(t * 6 + p.phase))), p.size * 2); ctx.restore(); }
      else if (p.kind === 'glitter') { ctx.save(); ctx.globalAlpha *= fade * (.35 + .65 * Math.pow(Math.sin(t * 5 + p.phase), 2)); star(p.x, p.y, p.size * .6, p.hue); line(p.x - p.size * 2, p.y, p.x + p.size * 2, p.y, colour(p.hue, .6), .6); ctx.restore(); }
      else ellipse(p.x, p.y, p.size, p.size, colour(48, fade, 85));
    }
    sparks = sparks.filter(p => p.life > 0 && p.y < h + 100);
  }
  function scroll(t) {
    const width = Math.min(w * .88, 720), height = Math.min(h * .3, 165), reveal = Math.min(1, t / 3), x = w / 2, y = h * .43 + (variant === 0 ? Math.sin(t) * 8 : variant === 2 ? Math.abs(Math.sin(t * 1.8)) * -22 : 0);
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .7) * .012); ctx.globalAlpha *= reveal;
    const g = ctx.createLinearGradient(0, -height / 2, 0, height / 2); g.addColorStop(0, '#c99652'); g.addColorStop(.15, '#ffeac1'); g.addColorStop(.8, '#f5dba4'); g.addColorStop(1, '#c99652');
    ctx.fillStyle = g; ctx.fillRect(-width / 2, -height / 2, width, height);
    for (const side of [-1, 1]) { ellipse(side * width / 2, 0, 12, height * .55, '#dbb170'); ellipse(side * width / 2, -height * .5, 12, 6, '#b57f3d'); }
    ctx.filter = `blur(${Math.max(0, 9 * (1 - reveal))}px)`; ctx.fillStyle = variant === 1 ? colour(t * 45, 1, 30) : '#69341f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `italic ${Math.min(width / 8, height * .4)}px "Segoe Script", "Brush Script MT", cursive`; ctx.fillText('Congratulations', 0, 0, width * .88); ctx.filter = 'none';
    ctx.restore();
  }
  function curtain(t) {
    // Close, settle with a damped bounce, then reopen; do not leave the puzzle covered.
    const phase = t % 15, progress = phase < 4 ? Math.min(1, phase / 3) : phase < 7 ? 1 : Math.max(0, 1 - (phase - 7) / 3);
    const bounce = phase > 3 && phase < 5 ? Math.sin((phase - 3) * 9) * Math.exp(-(phase - 3) * 2) * .035 : 0;
    for (const side of [-1, 1]) {
      ctx.save(); if (side === 1) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      // The curved inner edge bows back to 85% of its top position. Extra
      // fabric overlap must cover that narrowest point, including the bounce.
      const edge = w * .62 * (progress + bounce);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(edge, 0); ctx.bezierCurveTo(edge * .88, h * .3, edge * .85, h * .7, edge, h); ctx.lineTo(0, h); ctx.closePath(); ctx.clip();
      const g = ctx.createLinearGradient(0, 0, Math.max(1, edge), 0); for (let i = 0; i <= 20; i++) g.addColorStop(i / 20, i % 2 ? '#a71530' : '#450719'); ctx.fillStyle = g; ctx.fillRect(0, 0, Math.max(0, edge), h);
      line(edge - 6, 0, edge - 6, h, '#e9bc67', 4); ctx.restore();
    }
    if (phase >= 3 && phase < 7) {
      ctx.save(); ctx.globalAlpha *= Math.min(1, (phase - 3) / .5, (7 - phase) / .5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#27020e'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#ffe3a0'; ctx.font = `bold ${Math.min(w / 14, 54)}px Georgia`;
      ctx.fillText('Finished the grid,', w / 2, h * .46, w * .84);
      ctx.fillText('well done!', w / 2, h * .46 + Math.min(w / 11, 70), w * .84);
      ctx.restore();
    }
  }
  function slime(t) {
    const palette = [[105, 170, 305], [305, 270, 160], [170, 105, 285]][variant];
    // Reach full coverage before the final fade, including the shorter browser
    // show. Keep the base translucent rather than accumulating opacity.
    const progress = Math.pow(Math.min(1, t / Math.min(12, duration / 1000 * .65)), .9);
    const base = h * (.02 + progress * 1.1), n = Math.max(5, Math.min(18, Math.ceil(w / 125))), span = w / n;
    const gradient = ctx.createLinearGradient(0, 0, w, h * .35);
    for (let i = 0; i <= 3; i++) gradient.addColorStop(i / 3, colour(palette[i % 3] + Math.sin(t * .17 + i) * 10, .38, 53));
    ctx.save(); ctx.fillStyle = gradient; ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, base);
    for (let i = n; i > 0; i--) {
      const x = i * span, depth = h * (.16 + .12 * (.5 + .5 * Math.sin(i * 2.3 + variant))) * (1 - .35 * progress);
      const sway = Math.sin(t * .5 + i) * h * .013 * (1 - progress);
      ctx.bezierCurveTo(x - span * .12, base + depth + sway, x - span * .7, base + depth + sway, x - span, base);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.clip();
    // Moving bubbles and highlights keep the surface liquid while the puzzle
    // stays visible underneath the coloured covering.
    for (let i = 0; i < 16; i++) {
      const x = w * (.5 + .47 * Math.sin(i * 7.3 + Math.sin(t * .2 + i) * .12));
      const y = ((t * (18 + i % 5 * 4) + i * 137) % (h + 180)) - 90, radius = Math.min(42, w * (.02 + i % 4 * .008));
      ellipse(x, y, radius, radius * 1.3, '#ffffff0d');
      ctx.beginPath(); ctx.ellipse(x, y, radius, radius * 1.3, 0, 0, tau); ctx.strokeStyle = colour(palette[i % 3], .22, 85); ctx.lineWidth = 1.5; ctx.stroke();
      ellipse(x - radius * .3, y - radius * .5, Math.max(1, radius * .1), radius * .25, '#ffffff26');
    }
    ctx.restore();
    for (const side of [0, 1]) for (let i = 0; i < 5; i++) {
      const y = ((t * (25 + i * 4) + i * 193) % (h + 260)) - 130, radius = Math.min(w * .13, 100) * (.7 + i * .08);
      ellipse(side ? w : 0, y, radius, h * (.16 + i * .02), colour(palette[(i + side) % 3], .18, 55));
    }
  }
  // Scene props are pure functions of seed, index and elapsed time. Frame rate,
  // audio unlocking and pane size cannot change the cast or choreography.
  function unit(index, salt = 0) { const n = Math.sin(index * 127.1 + salt * 311.7 + showSeed * .00013) * 43758.5453; return n - Math.floor(n); }
  function cycle(t, seconds, offset = 0) { return ((t / seconds + offset) % 1 + 1) % 1; }
  function ease(n) { n = Math.max(0, Math.min(1, n)); return n * n * (3 - 2 * n); }
  function glow(x, y, radius, hue, alpha = .3) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
    g.addColorStop(0, colour(hue, alpha, 80)); g.addColorStop(1, colour(hue, 0));
    ellipse(x, y, radius, radius, g);
  }
  function twinkle(x, y, radius, hue, alpha = 1) {
    ctx.save(); ctx.globalAlpha *= alpha;
    path([[x, y - radius], [x + radius * .24, y - radius * .24], [x + radius, y], [x + radius * .24, y + radius * .24], [x, y + radius], [x - radius * .24, y + radius * .24], [x - radius, y], [x - radius * .24, y - radius * .24]], colour(hue, 1, 88)); ctx.restore();
  }
  function sceneStars(t, count = 35) {
    for (let i = 0; i < count; i++) twinkle(unit(i, 1) * w, unit(i, 2) * h * .82, 1.5 + unit(i, 3) * 3, 195 + unit(i, 4) * 100, .3 + .6 * (.5 + .5 * Math.sin(t * 1.7 + i)));
  }
  function flower(x, y, radius, hue, opening = 1, sway = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(sway);
    line(0, radius * 2.2, 0, 0, '#4c9d64', Math.max(1.5, radius * .1));
    ellipse(radius * .4, radius * 1.5, radius * .45, radius * .17, '#7ebd71');
    for (let j = 0; j < 6; j++) { ctx.save(); ctx.rotate(j * tau / 6); ellipse(0, -radius * .62 * opening, radius * .4, radius * .68 * Math.max(.15, opening), colour(hue, .93, 70)); ctx.restore(); }
    ellipse(0, 0, radius * .28, radius * .28, '#ffe49a'); ctx.restore();
  }
  function butterfly(x, y, size, hue, phase) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(phase * .3) * .22);
    const wing = .15 + .85 * Math.abs(Math.sin(phase));
    for (const side of [-1, 1]) {
      ellipse(side * size * .55 * wing, -size * .2, size * .65 * wing, size * .8, colour(hue, .92, 67));
      ellipse(side * size * .42 * wing, size * .55, size * .48 * wing, size * .5, colour(hue + 35, .9, 77));
      ellipse(side * size * .68 * wing, -size * .35, size * .18 * wing, size * .24, '#fff3d9bb');
      line(0, -size * .55, side * size * .25, -size * .95, '#35435d', 1);
    }
    ellipse(0, size * .1, size * .09, size * .75, '#35435d'); ctx.restore();
  }
  function bird(x, y, size, phase, fill = '#faedc4', humming = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(phase * .2) * .12);
    const flap = Math.sin(phase) * size;
    path([[-size * .2, 0], [-size, -size * .5 - flap], [-size * 1.7, -size * .4 - flap * .6], [-size * .7, size * .25]], fill);
    ellipse(0, 0, size * .8, size * .32, fill); ellipse(size * .62, -size * .18, size * .3, size * .3, fill);
    path([[size * .8, -size * .2], [size * (humming ? 1.8 : 1.2), -size * .13], [size * .8, -size * .03]], '#d8ac66');
    path([[-size * .55, .1 * size], [-size * 1.4, size * .4], [-size * 1.1, -size * .1]], fill);
    ellipse(size * .73, -size * .24, size * .065, size * .065, '#172c3d'); ctx.restore();
  }
  function garden(t) {
    const size = Math.min(w, h);
    for (let i = 0; i < 10; i++) flower((i + .5) * w / 10, h - size * (.07 + unit(i, 7) * .09), size * (.023 + unit(i, 6) * .016), 285 + i * 29, ease(t * .65 - i * .08), Math.sin(t + i) * .09);
    for (let i = 0; i < 14; i++) { const p = cycle(t, 12 + unit(i, 8) * 8, unit(i, 9)); butterfly(w * (.08 + unit(i, 10) * .84) + Math.sin(t * .8 + i) * w * .06, h * (1.12 - p * 1.3), size * (.023 + unit(i, 11) * .02), i * 41 + variant * 35, t * 9 + i); }
  }
  function ocean(t) {
    const water = h * .82, size = Math.min(w * .15, h * .1);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let j = 0; j <= 40; j++) { const x = j * w / 40; ctx.lineTo(x, water + i * h * .025 + Math.sin(j * .5 - t * 1.6 + i) * size * .12); }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = colour(185 + i * 9, .16); ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      const p = cycle(t, 5.5, i / 3), x = w * (-.15 + p * 1.3), y = water - Math.sin(p * Math.PI) * h * (.28 + i * .04);
      ctx.save(); ctx.translate(x, y); ctx.rotate((p - .5) * 1.5);
      const g = ctx.createLinearGradient(0, -size * .4, 0, size * .4); g.addColorStop(0, '#389aa9'); g.addColorStop(1, '#d0f8f1');
      ellipse(0, 0, size, size * .35, g);
      path([[size * .7, -size * .05], [size * 1.35, size * .12], [size * .7, size * .2]], '#8fd5d8');
      path([[-size * .75, 0], [-size * 1.35, -size * .5], [-size * 1.1, 0], [-size * 1.4, size * .32]], '#62beca');
      path([[-size * .2, -size * .2], [0, -size * .85], [size * .4, -size * .15]], '#3b97ad');
      ellipse(size * .65, -size * .1, size * .045, size * .045, '#193143'); ctx.restore();
      for (let j = 0; j < 7; j++) { const q = cycle(t, 2.8, j / 7 + i * .3); ellipse(w * (.12 + i * .36) + Math.sin(j * 8) * size * q, water - Math.sin(q * Math.PI) * size * 1.4, 2, 4, '#b3f8ff99'); }
    }
    for (let i = 0; i < 20; i++) twinkle(unit(i, 12) * w, water + unit(i, 13) * (h - water), 2 + Math.sin(t * 2 + i), 185);
  }
  function shootingStars(t) {
    sceneStars(t);
    for (let i = 0; i < 9; i++) {
      const p = cycle(t, 4 + unit(i, 1) * 3, unit(i, 2)), x = (-.35 + p * 1.7) * w, y = (unit(i, 3) * .5 + p * .4) * h;
      const g = ctx.createLinearGradient(x - w * .22, y - h * .08, x, y); g.addColorStop(0, colour(i * 39, 0)); g.addColorStop(1, colour(i * 39, .85));
      line(x - w * .22, y - h * .08, x, y, g, 3); twinkle(x, y, Math.min(w, h) * .018, i * 39);
    }
    ctx.save(); ctx.globalAlpha *= ease((t % 12 - 2) / 2); ctx.textAlign = 'center'; ctx.font = `italic bold ${Math.min(58, w * .1)}px Georgia`; ctx.fillStyle = '#fff1c4'; ctx.fillText('Well done!', w / 2, h * .5); ctx.restore();
  }
  function rainbowFalls(t) {
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      for (let j = 0; j <= 35; j++) { const y = j * h / 35, x = w * (.2 + i * .09) + Math.sin(y / h * 6 + t + i * .15) * w * .065; if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = colour(i * 46, .28, 68); ctx.lineWidth = Math.min(28, w * .045); ctx.stroke();
      for (let j = 0; j < 7; j++) { const p = cycle(t, 2.5 + i * .12, j / 7); const y = p * h, x = w * (.2 + i * .09) + Math.sin(p * 6 + t + i * .15) * w * .065; ellipse(x, y, 2, 6, colour(i * 46, .9, 85)); }
      const q = cycle(t, 1.3, i / 7); ellipse(w * (.2 + i * .09) + Math.sin(t + i) * w * .03, h * .94 - Math.sin(q * Math.PI) * h * .1, 3, 5, colour(i * 46, .8));
    }
    for (let i = 0; i < 24; i++) twinkle(unit(i, 6) * w, h * (.8 + .16 * unit(i, 7)), 2 + unit(i, 8) * 3, i * 32, .4 + .5 * Math.sin(t * 2 + i) ** 2);
  }
  function birdsong(t) {
    const size = Math.min(w, h), sunY = h * (.87 - ease(t / 5) * .33);
    glow(w * .5, sunY, size * .45, 42, .23); ellipse(w * .5, sunY, size * .105, size * .105, '#ffe1a4bb');
    for (let i = 0; i < 12; i++) { const a = i * tau / 12 + t * .025; line(w * .5 + Math.cos(a) * size * .14, sunY + Math.sin(a) * size * .14, w * .5 + Math.cos(a) * size * .22, sunY + Math.sin(a) * size * .22, '#ffdc8c88', 2); }
    for (let i = 0; i < 7; i++) bird((cycle(t, 13 + i, i / 7) * 1.3 - .15) * w, h * (.12 + i * .065) + Math.sin(t + i) * size * .025, size * (.016 + unit(i, 12) * .016), t * 5 + i, i % 2 ? '#f7d7a0' : '#90cbd4');
    for (let i = 0; i < 7; i++) flower((i + .5) * w / 7, h - size * .07, size * .025, i * 38 + 12, ease(t / 3), Math.sin(t * 1.3 + i) * .14);
  }
  function hummingbirds(t) {
    const s = Math.min(w, h);
    for (let i = 0; i < 6; i++) { const side = i % 2; flower(w * (side ? .93 : .07), h * (.18 + Math.floor(i / 2) * .28), s * .044, 310 + i * 21, 1, Math.sin(t + i) * .09); }
    for (let i = 0; i < 5; i++) {
      const p = t * .7 + i * 1.7, x = w * (.5 + Math.sin(p) * .32), y = h * (.2 + i * .14) + Math.cos(p * 2) * h * .045;
      ctx.save(); ctx.translate(x, y); ctx.scale(Math.cos(p) > 0 ? 1 : -1, 1);
      bird(0, 0, s * .033, t * 36 + i, colour(140 + i * 24, .95, 57), true);
      ellipse(0, s * .006, s * .015, s * .013, '#f9dcdf'); ctx.restore();
      for (let j = 0; j < 3; j++) twinkle(x - j * 12, y + Math.sin(t + j) * 12, 2, 165 + i * 22, .5);
    }
  }
  function paperPlanes(t) {
    for (let i = 0; i < 6; i++) {
      const p = cycle(t, 9 + i * .7, i / 6), s = Math.min(w, h) * (.045 + unit(i, 2) * .02), x = (-.2 + p * 1.4) * w, y = h * (.15 + i * .13) + Math.sin(p * tau * 2 + i) * h * .075;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.cos(p * tau * 2 + i) * .35);
      path([[-s, -s * .6], [s * 1.3, 0], [-s, s * .6], [-s * .4, 0]], colour(i * 55, .95, 80));
      path([[-s * .4, 0], [s * 1.3, 0], [-s * .6, s * .35]], colour(i * 55, .9, 59));
      line(-s, -s * .6, s * 1.3, 0, '#ffffffbb', 1); ctx.restore();
      // Notes unfold after the plane passes, rather than replacing its flight.
      const unfold = ease((p - .6) * 8) * (1 - ease((p - .92) * 12));
      if (unfold > 0) { ctx.save(); ctx.globalAlpha *= unfold; ctx.translate(x - s * 2.5, y - s); ctx.rotate(-.08); ctx.fillStyle = '#fff4dedd'; ctx.fillRect(-s * 1.2, -s * .5, s * 2.4, s); ctx.fillStyle = '#3c6971'; ctx.textAlign = 'center'; ctx.font = `bold ${s * .4}px Arial`; ctx.fillText(['Bravo!', 'Lovely!', 'Well done!'][i % 3], 0, s * .15); ctx.restore(); }
      for (let j = 1; j < 8; j++) ellipse(x - j * s * .8, y - Math.sin(j * .5) * s * .3, 1.2, 1.2, colour(i * 55, .3));
    }
  }
  function cherryBlossoms(t) {
    const s = Math.min(w, h);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side < 0 ? 0 : w, 0); ctx.scale(-side, 1);
      line(-10, h * .25, w * .37, h * .07, '#805c65', s * .017);
      line(w * .1, h * .2, w * .19, h * .015, '#805c65', s * .009);
      line(w * .24, h * .13, w * .4, h * .2, '#805c65', s * .007);
      for (let i = 0; i < 12; i++) flower(w * (.03 + unit(i, 4) * .34), h * (.035 + unit(i, 5) * .17), s * .02, 335 + i % 3 * 9, ease(t / 2), Math.sin(t * .6 + i) * .07);
      ctx.restore();
    }
    for (let i = 0; i < 55; i++) { const p = cycle(t, 9 + unit(i, 1) * 9, unit(i, 2)); ctx.save(); ctx.translate(w * unit(i, 3) + Math.sin(t * .5 + i) * s * .1, (p * 1.2 - .1) * h); ctx.rotate(t * .5 + i); ellipse(0, 0, s * .012 * (.2 + Math.abs(Math.sin(t + i))), s * .018, colour(335 + i % 4 * 5, .85, 85)); ctx.restore(); }
  }
  function space(t) {
    sceneStars(t, 45);
    const s = Math.min(w, h);
    for (let i = 0; i < 3; i++) {
      const x = w * (.16 + i * .34), y = h * (.15 + i * .13) + Math.sin(t * .4 + i) * s * .02, r = s * (.052 + i * .012);
      ellipse(x, y, r, r, colour(30 + i * 100, .8, 72));
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.55, r * .35, -.3, 0, tau); ctx.strokeStyle = colour(45 + i * 100, .75, 85); ctx.lineWidth = r * .14; ctx.stroke();
      for (const dx of [-.25, .25]) ellipse(x + r * dx, y - r * .1, r * .06, r * .08, '#263b54');
      ctx.beginPath(); ctx.arc(x, y + r * .06, r * .3, .15, Math.PI - .15); ctx.strokeStyle = '#263b54'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    const p = cycle(t, 8), x = w * (.5 + Math.sin(p * tau) * .15), y = h * (1.2 - p * 1.5), r = s * .055;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.cos(p * tau) * .2);
    path([[-r * .45, r], [0, r * (2 + .35 * Math.sin(t * 28))], [r * .45, r]], '#ffb85ee0');
    path([[-r * .24, r], [0, r * 1.8], [r * .24, r]], '#fff3bc');
    ellipse(0, 0, r * .65, r * 1.3, '#ecf1f6');
    path([[-r * .5, r * .15], [-r * 1.1, r * 1.15], [-r * .35, r * .8]], '#ec7e88'); path([[r * .5, r * .15], [r * 1.1, r * 1.15], [r * .35, r * .8]], '#ec7e88');
    ellipse(0, -r * .25, r * .32, r * .32, '#69d5e4'); ellipse(-r * .1, -r * .35, r * .1, r * .08, '#ffffffaa'); ctx.restore();
    for (let i = 0; i < 18; i++) { const q = cycle(t, 1.2, i / 18); ellipse(x + Math.sin(i * 7) * r * q * 2, y + r * (1.5 + q * 4), r * .12 * (1 - q), r * .2 * (1 - q), colour(35, (1 - q) * .7, 80)); }
  }
  function jellyfish(t) {
    const s = Math.min(w, h);
    for (let i = 0; i < 9; i++) {
      const p = cycle(t, 16 + unit(i, 1) * 10, unit(i, 2)), x = w * (.1 + .8 * unit(i, 3)) + Math.sin(t * .6 + i) * s * .04, y = h * (1.2 - p * 1.5), r = s * (.04 + unit(i, 4) * .04), pulse = 1 + Math.sin(t * 2 + i) * .12, hue = 180 + i * 23;
      glow(x, y, r * 2, hue, .16);
      for (let j = 0; j < 7; j++) { ctx.beginPath(); ctx.moveTo(x + (j - 3) * r * .22, y); for (let k = 1; k < 13; k++) ctx.lineTo(x + (j - 3) * r * .22 + Math.sin(t * 2 + k * .55 + j + i) * r * .16 * k / 12, y + k * r * .18); ctx.strokeStyle = colour(hue + j * 4, .55, 80); ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(x, y, r * pulse, r * .8 / pulse, 0, Math.PI, tau); ctx.quadraticCurveTo(x, y + r * .23, x - r * pulse, y); ctx.fillStyle = colour(hue, .48, 73); ctx.fill();
      for (let j = 0; j < 5; j++) ellipse(x + (j - 2) * r * .32, y, r * .12, r * .12, colour(hue, .8, 88));
    }
  }
  function fireflies(t) {
    const s = Math.min(w, h), formation = .5 - .5 * Math.cos(Math.min(1, (t % 16) / 7) * tau);
    for (let i = 0; i < 65; i++) {
      const a = i / 65 * tau, heartX = w / 2 + Math.pow(Math.sin(a), 3) * s * .32, heartY = h * .45 - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17 * s * .29;
      const freeX = unit(i, 4) * w + Math.sin(t * .5 + i) * s * .05, freeY = h * (.1 + unit(i, 5) * .8) + Math.cos(t * .7 + i) * s * .06;
      const x = freeX * (1 - formation) + heartX * formation, y = freeY * (1 - formation) + heartY * formation, alpha = .35 + .6 * Math.sin(t * 2 + i) ** 2;
      glow(x, y, s * .025, 65, alpha * .35);
      ellipse(x, y, 2.7, 2.7, `rgba(95,116,34,${alpha * .8})`); ellipse(x, y, 1.7, 1.7, colour(65, alpha, 85));
    }
    for (let i = 0; i < 9; i++) { const x = i * w / 8; line(x, h, x + Math.sin(t * .7 + i) * 12, h - s * (.13 + unit(i, 6) * .14), '#709b7477', 2); }
  }
  function soapBubbles(t) {
    const s = Math.min(w, h);
    for (let i = 0; i < 22; i++) {
      const p = cycle(t, 9 + unit(i, 2) * 10, unit(i, 3)), x = unit(i, 4) * w + Math.sin(t * .5 + i) * s * .05, y = h * (1.15 - p * 1.4), r = s * (.025 + unit(i, 5) * .065), pop = ease((p - .88) * 9);
      if (pop > 0) { for (let j = 0; j < 6; j++) twinkle(x + Math.cos(j * tau / 6) * r * (1 + pop), y + Math.sin(j * tau / 6) * r * (1 + pop), 4 * (1 - pop), j * 55, 1 - pop); }
      else {
        const g = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); g.addColorStop(0, '#ffffff08'); g.addColorStop(.8, colour(i * 37 + t * 12, .08, 80)); g.addColorStop(1, colour(i * 37 + t * 12, .35, 80)); ellipse(x, y, r, r, g);
        for (let j = 0; j < 6; j++) { ctx.beginPath(); ctx.arc(x, y, r, j * tau / 6 + t * .1, (j + 1) * tau / 6 + t * .1); ctx.strokeStyle = colour(j * 55 + i * 13, .65, 80); ctx.lineWidth = 1.7; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x - r * .06, y - r * .06, r * .78, Math.PI * 1.1, Math.PI * 1.55); ctx.strokeStyle = '#ffffffbd'; ctx.lineWidth = Math.max(1, r * .06); ctx.stroke();
      }
    }
  }
  function autumn(t) {
    const s = Math.min(w, h);
    for (let i = 0; i < 44; i++) {
      const p = cycle(t, 10 + unit(i, 1) * 10, unit(i, 2)), side = i % 2 ? 1 : -1, x = w * .5 + Math.sin(p * tau + i) * w * (.2 + unit(i, 4) * .35), y = (p * 1.25 - .1) * h, r = s * (.018 + unit(i, 5) * .02);
      ctx.save(); ctx.translate(x + Math.sin(t + i) * r, y); ctx.rotate(t * .4 * side + i); ctx.scale(.25 + Math.abs(Math.sin(t * .6 + i)) * .75, 1);
      const points = [[0, -r], [r * .25, -r * .45], [r * .7, -r * .65], [r * .55, -.1 * r], [r, r * .05], [r * .45, r * .45], [r * .2, r * .8], [0, r * .55], [-r * .2, r * .8], [-r * .45, r * .45], [-r, r * .05], [-r * .55, -.1 * r], [-r * .7, -r * .65], [-r * .25, -r * .45]];
      path(points, colour(12 + i % 5 * 10, .85, 58)); line(0, -r * .7, 0, r * 1.1, '#8c613f', 1); for (let j = 0; j < 3; j++) { line(0, j * r * .2, r * .4, (j - 1) * r * .25, '#8c613f88', 1); line(0, j * r * .2, -r * .4, (j - 1) * r * .25, '#8c613f88', 1); } ctx.restore();
    }
  }
  function peacock(t) {
    const s = Math.min(w * .43, h * .36), x = w / 2, y = h * .75, opening = .15 + .85 * ease((t % 14) / 3);
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 19; i++) {
      const a = -Math.PI / 2 + (i - 9) / 9 * 1.35 * opening, length = s * (layer ? .79 : 1), xx = x + Math.cos(a) * length, yy = y + Math.sin(a) * length;
      line(x, y, xx, yy, colour(145 + i * 3, .65, 45), 2);
      ctx.save(); ctx.translate(xx, yy); ctx.rotate(a + Math.PI / 2); const r = s * .09;
      ellipse(0, 0, r * .8, r * 1.55, colour(140 + i * 4, .8, 49)); ellipse(0, -r * .17, r * .58, r * .84, '#e9cf72'); ellipse(0, -r * .22, r * .38, r * .53, '#37b5bd'); ellipse(0, -r * .24, r * .2, r * .3, '#354789'); ellipse(-r * .07, -r * .35, r * .07, r * .1, '#ffffffbb'); ctx.restore();
    }
    ellipse(x, y, s * .14, s * .25, '#227f9b'); ellipse(x + s * .07, y - s * .28, s * .06, s * .24, '#347db3'); ellipse(x + s * .09, y - s * .46, s * .09, s * .085, '#397cbd');
    path([[x + s * .17, y - s * .47], [x + s * .27, y - s * .43], [x + s * .16, y - s * .41]], '#eac88a'); ellipse(x + s * .11, y - s * .48, s * .012, s * .012, '#18283e');
    for (let i = 0; i < 3; i++) { line(x + s * .07, y - s * .51, x + (i - .3) * s * .07, y - s * .64, '#4a9ea4', 1); ellipse(x + (i - .3) * s * .07, y - s * .64, s * .02, s * .025, '#67cabf'); }
    for (const dx of [-.06, .06]) line(x + s * dx, y + s * .18, x + s * dx, y + s * .33, '#d0af6a', 2);
    for (let i = 0; i < 8; i++) twinkle(x + Math.sin(i * 5 + t * .4) * s, y - s * (.4 + .7 * unit(i, 3)), 2.5, 150 + i * 20, .3 + .5 * Math.sin(t + i) ** 2);
  }
  function magicPaint(t) {
    const s = Math.min(w, h), phase = t % 14, progress = Math.min(1, phase / 6);
    for (let i = 0; i < 4; i++) {
      const end = Math.max(0, Math.min(1, progress * 1.5 - i * .12));
      ctx.beginPath();
      for (let j = 0; j <= 60; j++) { const p = j / 60 * end, x = w * (.08 + p * .84), y = h * (.18 + i * .19) + Math.sin(p * tau * 1.5 + i) * s * .06; if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = colour(i * 75 + 305, .55, 75); ctx.lineWidth = s * .022; ctx.lineCap = 'round'; ctx.stroke();
      if (i === Math.min(3, Math.floor(progress * 4))) { const x = w * (.08 + end * .84), y = h * (.18 + i * .19) + Math.sin(end * tau * 1.5 + i) * s * .06; ctx.save(); ctx.translate(x, y); ctx.rotate(.6); ctx.fillStyle = '#dbbc88'; ctx.fillRect(-s * .01, -s * .13, s * .02, s * .12); path([[-s * .02, -.01 * s], [0, s * .04], [s * .02, -.01 * s]], colour(i * 75 + 305)); ctx.restore(); }
      for (let j = 0; j < 5; j++) if (end > (j + 1) / 6) { const x = (j + 1) * w / 6, y = h * (.18 + i * .19); if ((i + j) % 2) flower(x, y, s * .022, 315 + i * 42 + j * 16, ease((end - (j + 1) / 6) * 8)); else twinkle(x, y, s * .028, i * 70 + 35); }
    }
    ctx.save(); ctx.globalAlpha *= ease((phase - 5) / 2); ctx.textAlign = 'center'; ctx.font = `italic bold ${Math.min(58, w * .12)}px Georgia`; ctx.fillStyle = '#ffe2a6'; ctx.fillText('Brilliant!', w / 2, h * .5); ctx.restore();
  }
  function aurora(t) {
    sceneStars(t, 50);
    // Four ribbon gradients, rather than a gradient per strand, keep the
    // three-pane show affordable on integrated graphics and high-DPI screens.
    for (let band = 0; band < 4; band++) {
      const top = h * (.06 + band * .12), depth = h * .28;
      const edge = i => top + Math.sin(i * .095 + t * .2 + band * 1.3) * h * .075 + Math.sin(i * .23 - t * .35) * h * .025;
      const g = ctx.createLinearGradient(0, top - h * .08, 0, top + depth); g.addColorStop(0, colour(145 + band * 38, 0)); g.addColorStop(.38, colour(145 + band * 38, .32, 73)); g.addColorStop(1, colour(190 + band * 35, 0));
      ctx.beginPath(); for (let i = 0; i < 48; i++) { const x = i * w / 47, y = edge(i); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      for (let i = 47; i >= 0; i--) ctx.lineTo(i * w / 47, edge(i) + h * (.15 + .05 * Math.sin(i * .2 + t * .4)));
      ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      for (let i = 0; i < 24; i++) { const x = i * w / 23, y = edge(i * 47 / 23); line(x, y, x + Math.sin(t + i) * w * .012, y + h * .11, colour(145 + band * 38, .06, 80), Math.max(1, w * .005)); }
    }
  }
  // Automatic adaptations of lickety's original Æther, Voice Canvas,
  // Protoplasm and Fibre Tunnel. No sensors, gesture steering or external assets.
  function aether(t) {
    const s = Math.min(w, h), phase = Math.floor(t / 4) % 4, centreX = w * (.5 + .12 * Math.sin(t * .31)), centreY = h * (.5 + .1 * Math.cos(t * .27));
    glow(centreX, centreY, s * .36, 250 + variant * 30, .16);
    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath();
      for (let j = 0; j <= 44; j++) {
        const p = j / 44, angle = arm * tau / 4 + p * tau * 1.3 - t * .25, radius = s * (.04 + p * .48);
        const x = centreX + Math.cos(angle) * radius, y = centreY + Math.sin(angle) * radius;
        if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1.5; ctx.strokeStyle = colour(arm * 65 + t * 9, .35, 75); ctx.stroke();
    }
    for (let i = 0; i < 120; i++) {
      const p = cycle(t, 7 + unit(i, 7) * 6, unit(i, 8)), a = i * 2.39996 + t * (.12 + unit(i, 2) * .12) + p * 2, r = s * (.03 + p * .62);
      const x = centreX + Math.cos(a) * r, y = centreY + Math.sin(a) * r * (.75 + .18 * Math.sin(t * .2)), hue = 215 + i * 13 + t * 8;
      const size = (1.5 + unit(i, 5) * 4) * (.45 + Math.sin(p * Math.PI) * .7);
      if (phase === 0) { line(x, y, x - Math.cos(a) * size * 4, y - Math.sin(a) * size * 4, colour(15 + i % 7 * 8, .45), size * .55); ellipse(x, y, size * .5, size * .5, '#fff4cc'); }
      else if (phase === 1) { ctx.beginPath(); ctx.arc(x, y, size * 1.6, 0, tau); ctx.strokeStyle = colour(175 + i % 7 * 9, .55, 76); ctx.lineWidth = 1; ctx.stroke(); }
      else if (phase === 2) { if (i % 8 === 0) glow(x, y, size * 8, hue, .13); ellipse(x, y, size, size, colour(hue, .5, 78)); }
      else { path([[x, y - size * 2], [x + size, y], [x, y + size * 2], [x - size, y]], colour(hue, .7, 76)); }
    }
    for (let i = 0; i < 3; i++) {
      const p = cycle(t, 5, i / 3); ctx.beginPath(); ctx.arc(centreX, centreY, s * (.04 + p * .42), 0, tau); ctx.strokeStyle = colour(200 + i * 45, (1 - p) * .2, 80); ctx.lineWidth = 1.5; ctx.stroke();
    }
    twinkle(centreX, centreY, s * (.02 + .006 * Math.sin(t * 2)), 240);
  }
  function wordCloud(t) {
    if (!foundWords.length) {
      ctx.textAlign = 'center'; ctx.font = `${Math.min(24, w / 17)}px Georgia`; ctx.fillStyle = '#e7bfa0';
      ctx.fillText('No confirmed words available', w / 2, h / 2); return;
    }
    // Keep every word, including large grids. Readable groups follow one another
    // within the show; there is no first-N sampling or repeated multiplication.
    const perPage = 30, pages = Math.ceil(foundWords.length / perPage), span = Math.min(4, Math.max(.5, duration / 1000 - 2) / pages);
    const page = Math.floor(t / span) % pages, local = (t % span) / span, offset = page * perPage;
    const count = Math.min(perPage, foundWords.length - offset), columns = w < 480 ? 3 : 5, rows = Math.ceil(count / columns);
    const cellW = w * .9 / columns, cellH = Math.min(h * .12, h * .78 / rows), top = (h - rows * cellH) / 2;
    if (cloudLayout?.page !== page) {
      const fonts = [];
      for (let i = 0; i < count; i++) {
        const index = offset + i, font = ['Georgia', 'Arial', 'monospace'][index % 3];
        let size = Math.min(42, cellH * .42) * (.8 + unit(index, 12) * .3);
        ctx.font = `bold ${size}px ${font}`;
        const measured = ctx.measureText(foundWords[index]).width;
        if (Number.isFinite(measured) && measured > cellW * .86) size *= cellW * .86 / measured;
        fonts.push({ size, font });
      }
      // Only the current group is cached; text is measured on page/size changes,
      // rather than measuring all words in all three panes on every frame.
      cloudLayout = { page, fonts };
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let i = 0; i < count; i++) {
      const index = offset + i, word = foundWords[index], { size, font } = cloudLayout.fonts[i];
      ctx.font = `bold ${size}px ${font}`;
      const drop = ease(Math.min(1, local * 8));
      const x = w * .05 + (i % columns + .5) * cellW + Math.sin(t + index) * cellW * .035;
      const y = top + (Math.floor(i / columns) + .5) * cellH - (1 - drop) * cellH * .8 + Math.sin(local * tau * 1.5 + index) * cellH * .07;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .8 + index) * .055);
      const pulse = 1 + Math.sin(t * 2 + index) * .045; ctx.scale(pulse, 1 / pulse);
      ctx.strokeStyle = '#172139b3'; ctx.lineWidth = Math.max(1.5, size * .1); ctx.strokeText(word, 0, 0);
      ctx.fillStyle = colour(155 + index * 31 + t * 7, .96, 76); ctx.fillText(word, 0, 0); ctx.restore();
    }
  }
  function protoplasm(t) {
    const s = Math.min(w, h), hue = 185 + variant * 45 + t * 3;
    // Curved layers echo the original domain-warped liquid without allocating
    // WebGL contexts in every page or requesting audio/motion permissions.
    for (let band = 0; band < 9; band++) {
      const y = h * (.12 + band * .095), shift = Math.sin(t * .22 + band) * w * .12;
      ctx.beginPath(); ctx.moveTo(-w * .1, y);
      for (let i = 0; i <= 36; i++) { const x = i * w / 36; ctx.lineTo(x, y + Math.sin(i * .21 + t * .3 + band * .55) * s * .11 + Math.sin(i * .11 - t * .2) * s * .08); }
      for (let i = 36; i >= 0; i--) { const x = i * w / 36; ctx.lineTo(x, y + s * .11 + Math.sin(i * .21 + t * .3 + band * .55 + .45) * s * .1); }
      ctx.closePath(); const g = ctx.createLinearGradient(shift, y - s * .1, w + shift, y + s * .2);
      g.addColorStop(0, colour(hue + band * 17, .08, 48)); g.addColorStop(.5, colour(hue + band * 22 + 35, .3, 70)); g.addColorStop(1, colour(hue + band * 17 + 80, .06, 55)); ctx.fillStyle = g; ctx.fill();
    }
    for (let i = 0; i < 6; i++) {
      const x = w * (.5 + .36 * Math.sin(t * (.12 + i * .009) + i * 2.4)), y = h * (.5 + .32 * Math.cos(t * .13 + i * 1.7)), r = s * (.06 + i % 3 * .025);
      glow(x, y, r * 2, hue + i * 35, .16);
      ctx.beginPath();
      for (let j = 0; j <= 48; j++) { const a = j * tau / 48, rr = r * (1 + .19 * Math.sin(a * 3 + t * .7 + i) + .12 * Math.cos(a * 5 - t * .4)); const xx = x + Math.cos(a) * rr, yy = y + Math.sin(a) * rr; if (!j) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      ctx.closePath(); ctx.fillStyle = colour(hue + i * 35, .15, 70); ctx.fill(); ctx.strokeStyle = colour(hue + i * 35, .48, 82); ctx.lineWidth = 1.3; ctx.stroke();
    }
  }
  function fibreTunnel(t) {
    const N = 32, S = 25, depth = 1.4, camera = t * 3.4, focal = Math.min(w, h) * .85;
    const spine = z => [Math.sin(z * .21 + t * .35) * .9 + Math.sin(z * .09 - t * .21) * 1.3, Math.cos(z * .17 + t * .28) * .8 + Math.sin(z * .11 + t * .17) * 1.1];
    const origin = spine(camera), ahead = spine(camera + .05), dx = (ahead[0] - origin[0]) / .05, dy = (ahead[1] - origin[1]) / .05;
    const cx = w * (.5 + Math.sin(t * .27) * .04), cy = h * (.5 + Math.cos(t * .23) * .035), rings = [];
    const twist0 = Math.sin(camera * .12 + t * .25) * 1.8 + camera * .04;
    for (let k = 0; k < S; k++) {
      const z = .7 + depth - camera % depth + k * depth, world = camera + z, p = spine(world), radius = 2 + .6 * Math.sin(world * .35 + t * .8) + .3 * Math.sin(world * .13 - t * .4);
      const twist = Math.sin(world * .12 + t * .25) * 1.8 + world * .04 - twist0 + t * .08, ring = [];
      for (let i = 0; i < N; i++) { const a = i / N * tau + twist, r = radius * (1 + .1 * Math.sin(i * 12.9898 + world * .7)); ring.push([cx + (p[0] - origin[0] - dx * z + r * Math.cos(a)) * focal / z, cy + (p[1] - origin[1] - dy * z + r * Math.sin(a)) * focal / z]); }
      rings.push(ring);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    for (let i = 0; i < N; i++) for (let section = 0; section < 3; section++) {
      const start = section * 8; ctx.beginPath(); ctx.moveTo(...rings[start][i]);
      for (let k = start + 1; k <= start + 8; k++) ctx.lineTo(...rings[k][i]);
      ctx.strokeStyle = colour(i / N * 190 + t * 15 + section * 25, [.55, .3, .14][section], 74); ctx.lineWidth = [1.5, 1, .7][section]; ctx.stroke();
    }
    for (let j = 0; j < 22; j++) { const z = cycle(-t, 6 + j % 4, j / 22) * (S - 2), k = Math.floor(z), i = j * 5 % N, p = rings[k][i], q = rings[k + 1][i], f = z - k; twinkle(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, 1.5 + (1 - k / S) * 2, j * 19); }
    ctx.restore();
  }
  // Typography uses local system fonts and cached metrics. Every fragment has
  // a fixed destination and a seeded trajectory, independent of frame rate.
  function titleLayout(lines, proportion = .18, family = 'Georgia', weight = 'bold') {
    const key = lines.join('|') + proportion + family + weight;
    if (titleLayouts.has(key)) return titleLayouts.get(key);
    let size = Math.min(108, Math.min(w, h) * proportion);
    ctx.font = `${weight} ${size}px ${family}`;
    const measured = Math.max(1, ...lines.map(text => ctx.measureText(text).width));
    size *= Math.min(1, w * .86 / measured);
    ctx.font = `${weight} ${size}px ${family}`;
    const leading = size * 1.3, glyphs = [];
    lines.forEach((text, row) => {
      const width = ctx.measureText(text).width, y = (row - (lines.length - 1) / 2) * leading;
      for (let i = 0; i < text.length; i++) if (text[i] !== ' ') {
        const advance = ctx.measureText(text.slice(0, i)).width, letter = ctx.measureText(text[i]).width;
        glyphs.push({ text: text[i], x: -width / 2 + advance + letter / 2, y, width: letter, index: glyphs.length });
      }
    });
    const layout = { lines, size, family, weight, leading, glyphs, height: lines.length * leading, width: w * .86 };
    titleLayouts.set(key, layout); return layout;
  }
  function titleFont(layout) { ctx.font = `${layout.weight} ${layout.size}px ${layout.family}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; }
  function titleText(layout, fill, stroke = null, width = 1) {
    titleFont(layout);
    layout.lines.forEach((text, i) => {
      const y = (i - (layout.lines.length - 1) / 2) * layout.leading;
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.strokeText(text, 0, y); }
      if (fill) { ctx.fillStyle = fill; ctx.fillText(text, 0, y); }
    });
  }
  function materialDust(t, count, hue, originY, spread = .7) {
    const s = Math.min(w, h);
    for (let i = 0; i < count; i++) {
      const p = cycle(t, 3 + unit(i, 31) * 3, unit(i, 32));
      const x = w * (.5 + (unit(i, 33) - .5) * spread) + Math.sin(t * .6 + i) * s * .025;
      const y = originY + p * s * .35;
      ellipse(x, y, .7 + unit(i, 34) * 1.3, .7 + unit(i, 34) * 1.3, colour(hue, (1 - p) * .42, 73));
    }
  }
  function monument(t) {
    const p = ease((t % 16) / 4), layout = titleLayout(w < 650 ? ['EXTRA', 'ORDINARY'] : ['EXTRAORDINARY'], .21);
    const y = h * .48 + (1 - p) * layout.height * .6, depth = layout.size * .15;
    glow(w * (.25 + cycle(t, 12) * .5), y - layout.height * .4, Math.min(w, h) * .5, 38, .14);
    for (let i = 0; i < 12; i++) line(w * .5, h * .78, i * w / 11, h, '#b6ac8b12', 1);
    ctx.save(); ctx.translate(w / 2, y); ctx.globalAlpha *= .3 + .7 * p;
    for (let i = 12; i > 0; i--) { ctx.save(); ctx.translate(i * depth / 12, i * depth / 12); titleText(layout, i % 3 ? '#344252' : '#4a5260'); ctx.restore(); }
    const g = ctx.createLinearGradient(-w * .4, -layout.height / 2, w * .4, layout.height / 2);
    g.addColorStop(0, '#747f87'); g.addColorStop(.42, '#e3dfcd'); g.addColorStop(.63, '#a5aaab'); g.addColorStop(1, '#5f7180');
    titleText(layout, g, '#f2e8ca88', .7); ctx.restore();
    materialDust(t, 42, 42, y + layout.height * .38);
  }
  function perfectAlignment(t) {
    const layout = titleLayout(['COMPLETE'], .19, 'Arial'), p = ease((t % 14) / 4), s = Math.min(w, h);
    ctx.save(); ctx.translate(w / 2, h * .48); titleFont(layout);
    for (const glyph of layout.glyphs) for (let strip = 0; strip < 5; strip++) {
      const index = glyph.index * 5 + strip, drift = 1 - p;
      ctx.save(); ctx.translate(glyph.x + (unit(index, 40) - .5) * w * 1.7 * drift, glyph.y + (unit(index, 41) - .5) * h * 1.1 * drift);
      ctx.rotate((unit(index, 42) - .5) * 3 * drift);
      ctx.beginPath(); ctx.rect(-glyph.width / 2 - 1, -layout.size * .62 + strip * layout.size * .25, glyph.width + 2, layout.size * .252); ctx.clip();
      ctx.fillStyle = colour(185 + strip * 9, .45 + .55 * p, 88); ctx.fillText(glyph.text, 0, 0); ctx.restore();
    }
    ctx.restore();
    line(w * .5 - s * .38 * p, h * .48 + layout.size * .85, w * .5 + s * .38 * p, h * .48 + layout.size * .85, '#b5e3e877', 1);
    for (const side of [-1, 1]) line(w * .5 + side * s * .4, h * .48 - s * .12 * p, w * .5 + side * s * .4, h * .48 + s * .12 * p, '#a9d7e433', 1);
  }
  function forgedGold(t) {
    const layout = titleLayout(['BRILLIANTLY', 'DONE'], .18), p = ease((t % 15) / 4.5), s = Math.min(w, h);
    const left = -w * .45, front = left + p * w * .9;
    glow(w / 2 + front, h * .48, s * .3, 32, (1 - p) * .27 + .06);
    ctx.save(); ctx.translate(w / 2, h * .48);
    titleText(layout, '#6d523e88', '#d5a86b44', .8);
    ctx.save(); ctx.beginPath(); ctx.rect(left, -layout.height, p * w * .9 + 1, layout.height * 2); ctx.clip();
    const g = ctx.createLinearGradient(0, -layout.height * .6, 0, layout.height * .6);
    g.addColorStop(0, '#fff0b0'); g.addColorStop(.32, '#d5a34c'); g.addColorStop(.49, '#fff1c2'); g.addColorStop(.55, '#b17b32'); g.addColorStop(1, '#edc67b');
    titleText(layout, g, '#ffdd8d', .6); ctx.restore();
    if (p < .995) { ctx.save(); ctx.beginPath(); ctx.rect(front - 5, -layout.height, 10, layout.height * 2); ctx.clip(); titleText(layout, '#fff7d3', '#ffa336', 3); ctx.restore(); }
    ctx.restore();
    for (let i = 0; i < 22; i++) { const q = cycle(t, 1.7, i / 22); ellipse(w / 2 + front + Math.sin(i * 2.4) * s * q * .06, h * .48 + (unit(i, 23) - .5) * layout.height + q * s * .1, 1, 2, colour(28 + i % 4 * 8, (1 - p) * (1 - q), 84)); }
  }
  function wordEchoes(t) {
    const layout = titleLayout(['BRAVO'], .23), s = Math.min(w, h);
    ctx.save(); ctx.translate(w / 2, h * .49);
    for (let i = 10; i >= 0; i--) {
      const p = cycle(t, 6.5, i / 11), scale = .65 + p * 6;
      ctx.save(); ctx.scale(scale, scale); ctx.globalAlpha *= Math.pow(1 - p, 2) * .3;
      titleText(layout, null, colour(37 + i * 3, .9, 82), .7 / scale); ctx.restore();
    }
    const g = ctx.createLinearGradient(0, -layout.size / 2, 0, layout.size / 2); g.addColorStop(0, '#fff4da'); g.addColorStop(1, '#c2b18b');
    titleText(layout, g, '#4f514e99', 1); ctx.restore();
    line(w * .5 - s * .23, h * .49 + layout.size, w * .5 + s * .23, h * .49 + layout.size, '#d5c5a43d', 1);
  }
  function finalInscription(t) {
    const layout = titleLayout(['A GRID', 'CONQUERED'], .18), p = ease((t % 16) / 5), x = w / 2, y = h * .48, s = Math.min(w, h);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#17222c45'; ctx.fillRect(-w * .46, -layout.height * .8, w * .92, layout.height * 1.6);
    ctx.save(); ctx.beginPath(); ctx.rect(-w * .46, -layout.height * .8, w * .92, layout.height * 1.6); ctx.clip();
    for (let i = 0; i < 24; i++) {
      ctx.beginPath(); const yy = (unit(i, 43) - .5) * layout.height * 1.8; ctx.moveTo(-w * .5, yy);
      ctx.bezierCurveTo(-w * .2, yy - s * .05, w * .1, yy + s * .11, w * .5, yy - s * .02); ctx.strokeStyle = '#ced7d414'; ctx.lineWidth = i % 4 ? .7 : 1.4; ctx.stroke();
    }
    ctx.restore();
    titleText(layout, '#15233288', '#a6b0b533', .7);
    ctx.save(); ctx.beginPath(); ctx.rect(-w * .46, -layout.height, p * w * .92, layout.height * 2); ctx.clip();
    ctx.save(); ctx.translate(1.8, 2); titleText(layout, '#030a12a6'); ctx.restore();
    titleText(layout, '#c8ccc3', '#eddbc099', .7); ctx.restore(); ctx.restore();
    materialDust(t, 65, 32, y + layout.height * .1, .82);
    if (p < .99) line(w * (.04 + p * .92), y - layout.height * .65, w * (.04 + p * .92), y + layout.height * .65, '#e4c49b66', 1);
  }
  function typeGravity(t) {
    const layout = titleLayout(['EVERY WORD', 'FOUND'], .18, 'Arial'), raw = Math.min(1, (t % 14) / 4), pull = raw * raw * raw;
    const s = Math.min(w, h);
    glow(w / 2, h * .49, s * .48, 210, .07 + pull * .08);
    ctx.save(); ctx.translate(w / 2, h * .49); titleFont(layout);
    for (const glyph of layout.glyphs) {
      const i = glyph.index, a = unit(i, 51) * tau, radius = s * (.35 + unit(i, 52) * .55), drift = 1 - pull;
      ctx.save(); ctx.translate(glyph.x * pull + Math.cos(a + raw * .35) * radius * drift, glyph.y * pull + Math.sin(a + raw * .35) * radius * drift);
      ctx.rotate((unit(i, 53) - .5) * 2 * drift); const scale = .35 + pull * .65; ctx.scale(scale, scale);
      ctx.fillStyle = colour(205 + i * 2, .35 + pull * .65, 88); ctx.strokeStyle = '#2c425455'; ctx.lineWidth = 1; ctx.strokeText(glyph.text, 0, 0); ctx.fillText(glyph.text, 0, 0); ctx.restore();
    }
    ctx.restore();
    if (raw > .8) { const q = ease((raw - .8) * 5); line(w * (.5 - q * .4), h * .49 + layout.height * .7, w * (.5 + q * .4), h * .49 + layout.height * .7, '#c0d9e67d', 1); }
  }
  function beyondHorizon(t) {
    const layout = titleLayout(['ONWARD'], .22, 'Arial'), phase = t % 16, p = Math.min(1, phase / 7), horizon = h * .41, s = Math.min(w, h);
    glow(w / 2, horizon, s * .42, 205, .12);
    for (let i = 0; i < 15; i++) line(w / 2, horizon, (i - 2) * w / 10, h, '#8cbed025', 1);
    for (let i = 0; i < 7; i++) { const q = cycle(t, 8, i / 7); const yy = horizon + q * q * (h - horizon); line(0, yy, w, yy, colour(205, q * .15, 74), .7); }
    if (phase < 9) {
      ctx.save(); ctx.translate(w / 2, horizon - p * p * h * .6); const scale = .06 + p * p * p * 5; ctx.scale(scale, scale * (.5 + p * .5));
      ctx.globalAlpha *= 1 - ease((phase - 7) / 2); titleText(layout, '#f2e8d4', '#a6c7d166', .6); ctx.restore();
    }
    ctx.save(); ctx.translate(w / 2, h * .55); ctx.globalAlpha *= ease((phase - 4.5) / 3); titleText(layout, '#e0e6e5', '#62798488', .6); ctx.restore();
  }
  function prismaticLanguage(t) {
    const layout = titleLayout(['EXCEPTIONAL'], .19), angle = t * .45, s = Math.min(w, h), split = 2 + (1 - ease((t % 14) / 4)) * s * .06;
    ctx.save(); ctx.translate(w / 2, h * .49);
    for (const [dx, dy, hue] of [[-1, .3, 180], [1, -.2, 315], [.1, 1, 42]]) {
      ctx.save(); ctx.translate(dx * split * Math.sin(angle + dx), dy * split * Math.cos(angle)); titleText(layout, colour(hue, .35, 76), colour(hue, .5, 83), 1); ctx.restore();
    }
    for (let depth = 5; depth > 0; depth--) { ctx.save(); ctx.translate(depth * 1.2, depth * 1.4); titleText(layout, null, '#9ccad329', .7); ctx.restore(); }
    const g = ctx.createLinearGradient(-w * .4, -layout.size, w * .4, layout.size);
    g.addColorStop(0, '#c0dce57a'); g.addColorStop(.45, '#ffffffc9'); g.addColorStop(.55, '#b9bedf66'); g.addColorStop(1, '#e4d6afae');
    titleText(layout, g, '#e6f5f2cc', .8); ctx.restore();
    const lightX = w * (.5 + Math.sin(t * .33) * .35); glow(lightX, h * .49 - layout.size * .5, s * .2, 190, .1);
  }
  function silenceAfter(t) {
    const layout = titleLayout(['Done.'], .1, 'Georgia', 'normal'), s = Math.min(w, h);
    glow(w * .5, h * .5, s * .5, 42, .065 * ease(t / 5));
    ctx.save(); ctx.translate(w / 2, h * .5);
    ctx.save(); const scale = 4 + ease(t / 12) * 2; ctx.scale(scale, scale); ctx.globalAlpha *= ease((t - 1) / 5) * .18; titleText(layout, null, '#e3d8ba', .5 / scale); ctx.restore();
    ctx.globalAlpha *= ease(t / 1.2); titleText(layout, '#ece6d9', '#26344380', .7); ctx.restore();
  }
  function thousandStrokes(t) {
    const layout = titleLayout(['MASTERFULLY', 'SOLVED'], .17, 'Georgia', 'italic'), p = ease((t % 17) / 6), s = Math.min(w, h);
    glow(w * .5, h * .48, s * .43, 24, .075);
    ctx.save(); ctx.translate(w / 2, h * .48); titleFont(layout);
    ctx.save(); ctx.beginPath(); ctx.rect(-w * .46, -layout.height, p * w * .92, layout.height * 2); ctx.clip();
    // Native dashed glyph contours create thousands of fine copper marks with
    // sixteen bounded text passes, without a pixel scan or offscreen bitmap.
    ctx.setLineDash([.8, 3.6]);
    for (let i = 0; i < 16; i++) { ctx.save(); ctx.translate(Math.sin(i * 2.4) * .6, Math.cos(i * 2.4) * .6); ctx.lineDashOffset = i * .27 - t * .28; titleText(layout, null, colour(22 + i, .16 + p * .18, 68 + i % 3 * 8), .55); ctx.restore(); }
    ctx.setLineDash([]); ctx.globalAlpha *= ease((p - .5) * 2); titleText(layout, '#dbab87', '#f5d5b455', .55); ctx.restore();
    if (p < .99) for (let i = 0; i < 20; i++) { const x = -w * .46 + p * w * .92 + Math.sin(i * 2.3) * s * .035, y = (unit(i, 61) - .5) * layout.height; line(x - s * .04, y - s * .3, x, y, colour(24 + i, .12, 78), .5); }
    ctx.restore();
    const y = h * .48 + layout.height * .78;
    ctx.beginPath(); ctx.moveTo(w * .18, y); ctx.bezierCurveTo(w * .35, y + s * .07 * p, w * .65, y - s * .06 * p, w * .82, y); ctx.strokeStyle = '#b98b6670'; ctx.lineWidth = 1; ctx.stroke();
  }
  const cinematicEffects = ['monument', 'perfect-alignment', 'forged-gold', 'word-echoes', 'final-inscription', 'type-gravity', 'beyond-horizon', 'prismatic-language', 'silence-after', 'thousand-strokes'];
  function cinemaBackdrop(t, index) {
    // Broad native gradients supply soft light without per-pixel work, blur
    // filters or large intermediate canvases. Keep overlays translucent.
    const quiet = index === 8, time = t * (quiet ? .3 : 1), s = Math.min(w, h), radius = Math.max(w, h) * .48;
    const gain = options.transparent ? .64 : 1, hue = index * 29 + variant * 24 + time * 4;
    ctx.save(); ctx.globalAlpha *= ease(t / 1.8);
    for (let i = 0; i < 6; i++) {
      const a = i * tau / 6 + time * .08 + index * .24;
      const x = w * (.5 + Math.cos(a) * .43) + Math.sin(time * .19 + i) * w * .1;
      const y = h * (.5 + Math.sin(a) * .38) + Math.cos(time * .16 + i * 2) * h * .08;
      const r = radius * (.86 + .14 * Math.sin(time * .23 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, colour(hue + i * 60, .38 * gain, 56));
      g.addColorStop(.45, colour(hue + i * 60 + 18, .2 * gain, 51));
      g.addColorStop(1, colour(hue + i * 60 + 32, 0, 45));
      ellipse(x, y, r, r, g);
    }
    // Three flowing sheets of spectral light move behind the typography.
    for (let i = 0; i < 3; i++) {
      const g = ctx.createLinearGradient(0, h, w, 0);
      for (let j = 0; j <= 6; j++) g.addColorStop(j / 6, colour(hue + j * 55 + i * 35, .14 * gain, 70));
      const shift = Math.sin(time * .21 + i * 1.6 + index) * h * .13;
      ctx.beginPath(); ctx.moveTo(-w * .15, h * (.78 + i * .09) + shift);
      ctx.bezierCurveTo(w * .2, h * .1 + shift, w * .65, h * 1.05 - shift, w * 1.15, h * (.12 + i * .09) - shift);
      ctx.strokeStyle = g; ctx.lineWidth = s * (.09 + .02 * i); ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = colour(hue + i * 100, .12 * gain, 86); ctx.lineWidth = .8; ctx.stroke();
    }
    // Leave a gently shaded centre so pale/glass text stays readable as the
    // surrounding colours change; this also works over the light clues page.
    const shade = ctx.createRadialGradient(w / 2, h * .49, s * .06, w / 2, h * .49, s * .52);
    shade.addColorStop(0, `rgba(5,9,25,${.2 * gain})`); shade.addColorStop(1, 'rgba(5,9,25,0)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  const sceneDrawers = { butterflies: garden, ocean, 'shooting-stars': shootingStars, 'rainbow-falls': rainbowFalls, birdsong, hummingbirds, 'paper-planes': paperPlanes, 'cherry-blossoms': cherryBlossoms, space, jellyfish, fireflies, 'soap-bubbles': soapBubbles, autumn, peacock, 'magic-paint': magicPaint, aurora, aether, 'word-cloud': wordCloud, protoplasm, 'fibre-tunnel': fibreTunnel, monument, 'perfect-alignment': perfectAlignment, 'forged-gold': forgedGold, 'word-echoes': wordEchoes, 'final-inscription': finalInscription, 'type-gravity': typeGravity, 'beyond-horizon': beyondHorizon, 'prismatic-language': prismaticLanguage, 'silence-after': silenceAfter, 'thousand-strokes': thousandStrokes };
  function draw(now) {
    frame = null; if (dead) return;
    const t = (now - started) / 1000, dt = Math.min(.04, Math.max(0, (now - last) / 1000)); last = now;
    ctx.clearRect(0, 0, w, h); if (!options.transparent) { ctx.fillStyle = '#070b1a'; ctx.fillRect(0, 0, w, h); }
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, (duration / 1000 - t) / 2));
    if (reduced) { ctx.fillStyle = '#073f48'; ctx.fillRect(w * .05, h / 2 - 45, w * .9, 70); ctx.fillStyle = '#ffe29b'; ctx.font = `bold ${Math.min(w / 16, 38)}px Georgia`; ctx.textAlign = 'center'; ctx.fillText('Congratulations!', w / 2, h / 2); }
    else {
      soundtrack(now);
      const cinematic = cinematicEffects.indexOf(effect);
      if (cinematic !== -1) cinemaBackdrop(t, cinematic);
      if (now >= next && t < duration / 1000 - 4) { spawn(); next = now + (effect === 'lanterns' || effect === 'balloons' ? 650 : effect === 'glitter' ? 1100 : 1700); }
      if (effect === 'disco') disco(t); else if (effect === 'lasers') lasers(t); else if (effect === 'lanterns' || effect === 'balloons') floaters(t, dt); else if (['poppers', 'champagne', 'powder'].includes(effect)) projectiles(dt); else if (effect === 'scroll') scroll(t); else if (effect === 'curtain') curtain(t); else if (effect === 'slime') slime(t);
      else if (sceneDrawers[effect]) sceneDrawers[effect](t);
      particles(t, dt);
    }
    ctx.restore();
    if (t * 1000 >= duration) { canvas.dataset.running = 'false'; silence(); if (options.transparent) destroy(); return; }
    frame = requestAnimationFrame(draw);
  }
  function start(event, requested) {
    if (dead) return;
    silence(); if (master) master.gain.value = 0;
    if (child) { child.destroy(); child = null; } if (frame !== null) cancelAnimationFrame(frame); frame = null;
    // Replaying the current show must not draw another card from the rotation.
    const replay = !!event && !requested && !!effect;
    const desired = replay ? effect : requested || options.effect;
    // Only Expert's explicit off choice (or a test preview) suppresses motion.
    // Browser/OS preferences do not select a different celebration.
    reduced = options.reducedMotion === true;
    if (effects.includes(desired)) effect = desired;
    else if (!reduced) effect = nextEffect();
    else effect = effect || 'fireworks'; // No unseen animation is consumed by a static message.
    seed = replay ? showSeed : (Number(options.seed) || Math.floor(Math.random() * 4294967295)) >>> 0;
    const initialSeed = seed;
    showSeed = initialSeed;
    nextSound = performance.now(); soundStep = 0; lastImpact = -Infinity;
    canvas.dataset.sound = !soundEnabled || reduced ? 'muted' : 'ready'; ensureAudio();
    resize(); items = []; sparks = []; variant = Math.floor(rnd(0, 3)); started = last = performance.now(); next = started;
    canvas.dataset.running = 'true'; canvas.dataset.effect = effect; canvas.dataset.animation = reduced ? 'message' : effect;
    if (!reduced && (effect === 'lanterns' || effect === 'balloons')) for (let i = 0; i < (effect === 'balloons' ? 11 : 6); i++) { spawn(); items[items.length - 1].y = h - rnd(0, h * .17); }
    if (effect === 'fireworks' && !reduced && typeof options.fireworksFactory === 'function') child = options.fireworksFactory(canvas, { ...options, sound: soundEnabled, clickReplay: false, onStart: null });
    else frame = requestAnimationFrame(draw);
    if (typeof options.onStart === 'function') options.onStart({ userInitiated: !!event, effect, animation: canvas.dataset.animation, seed: initialSeed });
  }
  function destroy() {
    if (dead) return; dead = true; child?.destroy(); silence(); if (audio) audio.close().catch(() => {}); if (frame !== null) cancelAnimationFrame(frame); frame = null;
    removeEventListener('pointerdown', unlockSound); removeEventListener('keydown', unlockSound);
    removeEventListener('resize', resize); canvas.removeEventListener('click', start); ctx.clearRect(0, 0, w, h); canvas.dataset.running = 'false'; if (options.transparent) canvas.remove();
  }
  addEventListener('resize', resize); if (options.clickReplay !== false) canvas.addEventListener('click', start);
  addEventListener('pointerdown', unlockSound); addEventListener('keydown', unlockSound);
  start(); return { start, destroy, setSoundEnabled, effects, labels };
}

// Reuse the real standalone notice in the offline preview as well as in clues.
function createCluesCompletionNotice(doc) {
  const notice = doc.createElement('div');
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'position:fixed;z-index:2147483641;top:20px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 32px);box-sizing:border-box;padding:14px 18px;border-radius:16px;background:#073f48;color:white;box-shadow:0 4px 22px #0004;font:600 17px/1.5 Arial,sans-serif;text-align:center';
  const message = doc.createElement('span');
  message.textContent = 'All words found — well done!';
  const close = doc.createElement('button');
  close.type = 'button'; close.textContent = 'Close'; close.setAttribute('aria-label', 'Close celebration');
  close.style.cssText = 'margin:0 0 0 12px;padding:5px 10px;border:1px solid #fff8;border-radius:8px;background:#fff;color:#073f48;font:600 14px Arial,sans-serif;cursor:pointer';
  notice.append(message, close); doc.body.appendChild(notice);
  return { notice, message, close };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createBabbleCelebration };
