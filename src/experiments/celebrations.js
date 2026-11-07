/** Self-contained canvas renderer, shared with Expert by tools/sync-celebrations.cjs. */
function createBabbleCelebration(canvas, options = {}) {
  const effects = ['fireworks', 'disco', 'lasers', 'lanterns', 'poppers', 'champagne', 'balloons', 'scroll', 'curtain', 'glitter', 'powder', 'slime'];
  const labels = ['Fireworks', 'Disco ball', 'Laser show', 'Rising lanterns', 'Party poppers', 'Champagne', 'Helium balloons', 'Congratulations scroll', 'Red stage curtain', 'Glitter bombs', 'Colour powder', 'Fluorescent slime'];
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { start() {}, destroy() {}, effects, labels };
  let w = 1, h = 1, frame = null, child = null, dead = false, started = 0, last = 0, next = 0;
  let effect = '', seed = 1, items = [], sparks = [], variant = 0, reduced = false;
  let audio = null, master = null, noiseBuffer = null, soundEnabled = options.sound !== false, nextSound = 0, soundStep = 0, lastImpact = -Infinity;
  const voices = new Set();
  const tau = Math.PI * 2, duration = Math.max(1000, Math.min(60000, options.duration || 60000));
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rnd = (a, b) => a + random() * (b - a);
  const colour = (hue, alpha = 1, light = 58) => `hsla(${hue},90%,${light}%,${alpha})`;
  function nextEffect() {
    const key = options.rotationKey || 'lickety-celebration-rotation:v1';
    // Keep a session fallback when private browsing denies storage. A failed
    // write must not let an older disk copy rewind the next selection.
    const memory = globalThis.__licketyCelebrationRotations || (globalThis.__licketyCelebrationRotations = Object.create(null));
    const remembered = memory[key];
    const valid = bag => bag && bag.version === 1 && Array.isArray(bag.remaining) && bag.remaining.length <= effects.length &&
      bag.remaining.every(id => effects.includes(id)) && new Set(bag.remaining).size === bag.remaining.length &&
      (bag.last === null || effects.includes(bag.last)) && !bag.remaining.includes(bag.last);
    let bag = remembered?.unsaved ? remembered.bag : null;
    if (!bag) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw && raw.length <= 2048) { const saved = JSON.parse(raw); if (valid(saved)) bag = saved; }
      } catch { /* Memory keeps the rotation usable when storage is unavailable. */ }
    }
    if (!bag && valid(remembered?.bag)) bag = remembered.bag;
    if (!valid(bag)) bag = { version: 1, remaining: [], last: null };
    if (!bag.remaining.length) {
      bag.remaining = effects.slice();
      for (let i = bag.remaining.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag.remaining[i], bag.remaining[j]] = [bag.remaining[j], bag.remaining[i]]; }
      // The first show in a new round must also differ from the previous show.
      const end = bag.remaining.length - 1;
      if (bag.remaining[end] === bag.last) { const other = Math.floor(Math.random() * end); [bag.remaining[end], bag.remaining[other]] = [bag.remaining[other], bag.remaining[end]]; }
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
    nextSound = now + interval * 1000;
  }
  function unlockSound() { if (canvas.dataset.running === 'true' && !reduced) { if (child) child.setSoundEnabled?.(soundEnabled); else ensureAudio(); } }
  function setSoundEnabled(enabled) {
    soundEnabled = !!enabled; options.sound = soundEnabled;
    if (child) child.setSoundEnabled?.(soundEnabled);
    if (!soundEnabled || reduced) { silence(); if (master) master.gain.value = 0; canvas.dataset.sound = 'muted'; }
    else { ensureAudio(); nextSound = performance.now(); }
  }
  function resize() {
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
  function draw(now) {
    frame = null; if (dead) return;
    const t = (now - started) / 1000, dt = Math.min(.04, Math.max(0, (now - last) / 1000)); last = now;
    ctx.clearRect(0, 0, w, h); if (!options.transparent) { ctx.fillStyle = '#070b1a'; ctx.fillRect(0, 0, w, h); }
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, (duration / 1000 - t) / 2));
    if (reduced) { ctx.fillStyle = '#073f48'; ctx.fillRect(w * .05, h / 2 - 45, w * .9, 70); ctx.fillStyle = '#ffe29b'; ctx.font = `bold ${Math.min(w / 16, 38)}px Georgia`; ctx.textAlign = 'center'; ctx.fillText('Congratulations!', w / 2, h / 2); }
    else {
      soundtrack(now);
      if (now >= next && t < duration / 1000 - 4) { spawn(); next = now + (effect === 'lanterns' || effect === 'balloons' ? 650 : effect === 'glitter' ? 1100 : 1700); }
      if (effect === 'disco') disco(t); else if (effect === 'lasers') lasers(t); else if (effect === 'lanterns' || effect === 'balloons') floaters(t, dt); else if (['poppers', 'champagne', 'powder'].includes(effect)) projectiles(dt); else if (effect === 'scroll') scroll(t); else if (effect === 'curtain') curtain(t); else if (effect === 'slime') slime(t);
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
    const desired = requested || options.effect;
    reduced = typeof options.reducedMotion === 'boolean' ? options.reducedMotion : typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (effects.includes(desired)) effect = desired;
    else if (!reduced) effect = nextEffect();
    else effect = effect || 'fireworks'; // No unseen animation is consumed by a static message.
    seed = (Number(options.seed) || Math.floor(Math.random() * 4294967295)) >>> 0;
    const initialSeed = seed;
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
