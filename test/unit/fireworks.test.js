'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createBabbleFireworks } = require('../../src/experiments/fireworks');
const { createBabbleCelebration } = require('../../src/experiments/celebrations');
const { createCompletionTracker, celebrationWords } = require('../../src/fireworks-overlay');

test('automatic celebrations happen once per grid despite count corrections, reloads and puzzle ID changes', () => {
  const observe = createCompletionTracker();
  const first = { ready: true, puzzleId: '1', gridLetters: 'ABCDEFGHIJKLMNOPQRSTUVWXY', remaining: '1' };
  assert.equal(observe(first), false);
  assert.equal(observe({ ...first, remaining: '0' }), true);
  assert.equal(observe({ ready: false, puzzleId: '' }), false);
  assert.equal(observe({ ...first, puzzleId: 'other' }), false);
  assert.equal(observe({ ...first, remaining: '0' }), false);
  const second = { ...first, gridLetters: 'ZBCDEFGHIJKLMNOPQRSTUVWXY' };
  assert.equal(observe(second), false);
  assert.equal(observe({ ...second, remaining: '0' }), true);
  assert.equal(observe(first), false);
  assert.equal(observe({ ...first, remaining: '0' }), false, 'returning to an earlier grid does not rearm it');
  const completeOnLaunch = createCompletionTracker();
  assert.equal(completeOnLaunch({ ...first, remaining: '0' }), false);
  assert.equal(completeOnLaunch(first), false);
  assert.equal(completeOnLaunch({ ...first, remaining: '0' }), false);
});

const script = createBabbleFireworks.toString();
const catalog = createBabbleCelebration({ getContext: () => null }).effects;
const count = catalog.length;
const addEffect = (source, id) => source.replace(/(const effects = \[[^\n]*)(\];)/, (_match, start, end) => start + ", '" + id + "'" + end);

test('celebration words require a ready, matching grid and never substitute solution or invalid input', () => {
  const grid = 'ABCDEFGHIJKLMNOPQRSTUVWXY';
  const snapshot = { gridLetters: grid, remaining: '0', words: ['CHARLIE', 'alpha', 'alpha', 'bravo'] };
  assert.deepEqual(celebrationWords(snapshot, grid), ['alpha', 'bravo', 'charlie']);
  for (const value of [null, { ...snapshot, gridLetters: 'ZBCDEFGHIJKLMNOPQRSTUVWXY' }, { ...snapshot, wordListReady: false },
    { ...snapshot, hasAddWord: false }, { ...snapshot, remaining: null }, { ...snapshot, words: ['<script>'] },
    { ...snapshot, words: Array(10001).fill('alpha') }]) assert.deepEqual(celebrationWords(value, grid), []);
  assert.deepEqual(celebrationWords(snapshot, ''), []);
});

test('the word cloud shows every found word across large grids, with bounded work and no word persistence/reporting', () => {
  const words = Array.from({ length: 1001 }, (_, i) => 'word' + String.fromCharCode(97 + Math.floor(i / 676), 97 + Math.floor(i / 26) % 26, 97 + i % 26));
  const seen = new Set(), storage = new Map(), starts = []; let time = 0, frame, drawn = 0;
  const drawing = new Proxy({}, { get: (_target, name) => (...args) => {
    if (name === 'measureText') return { width: args[0].length * 10 };
    if (name === 'fillText') { seen.add(args[0]); drawn++; }
    if (/create.*Gradient/.test(name)) return { addColorStop() {} };
  }, set: () => true });
  const canvas = { dataset: {}, getContext: () => drawing, addEventListener() {}, removeEventListener() {}, remove() {} };
  const context = vm.createContext({ window: { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
    innerWidth: 320, innerHeight: 800, performance: { now: () => time }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame() {} });
  const factory = vm.runInContext('(' + createBabbleCelebration.toString() + ')', context);
  const show = factory(canvas, { effect: 'word-cloud', words: [...words, words[0], '<bad>'], duration: 12000, sound: false, onStart: info => starts.push(info) });
  for (time = 16; time < 11000; time += 16) { drawn = 0; frame(time); assert.ok(drawn <= 30, 'only the visible group is drawn'); }
  assert.equal(seen.size, words.length); assert.ok(words.every(word => seen.has(word)));
  assert.equal(storage.size, 0); assert.doesNotMatch(JSON.stringify(starts), /wordaaa|words/);
  show.destroy();
});

function rotationSession(storage, source = createBabbleCelebration.toString()) {
  const drawing = new Proxy({}, { get: () => () => {}, set: () => true });
  const context = vm.createContext({ window: { localStorage: storage }, matchMedia: () => ({ matches: true }), innerWidth: 520, innerHeight: 750,
    performance: { now: () => 0 }, addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  const factory = vm.runInContext('(' + source + ')', context);
  return options => {
    const canvas = { dataset: {}, getContext: () => drawing, addEventListener() {}, removeEventListener() {}, remove() {} };
    const show = factory(canvas, { sound: false, ...options });
    const selected = canvas.dataset.effect; show.destroy(); return selected;
  };
}

test('saved random rotation shows every effect once per round despite system reduced motion, without a boundary repeat', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const choices = [];
  for (let i = 0; i < count * 3; i++) choices.push(rotationSession(storage)());
  for (let i = 0; i < choices.length; i += count) assert.equal(new Set(choices.slice(i, i + count)).size, count);
  assert.notEqual(choices[count - 1], choices[count]); assert.notEqual(choices[count * 2 - 1], choices[count * 2]);
  const bag = JSON.parse([...values.values()][0]);
  assert.equal(bag.remaining.length, 0); assert.equal(bag.last, choices.at(-1));
  assert.deepEqual(Object.keys(bag).sort(), ['catalog', 'last', 'remaining', 'version']);
});

test('button and canvas replay preserve the chosen effect, seed and rotation; explicit random testing draws again', () => {
  const values = new Map(), starts = [], handlers = new Map();
  const drawing = new Proxy({}, { get: () => () => {}, set: () => true });
  const context = vm.createContext({ window: { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } },
    innerWidth: 520, innerHeight: 750, performance: { now: () => 0 }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  const factory = vm.runInContext('(' + createBabbleCelebration.toString() + ')', context);
  const canvas = { dataset: {}, getContext: () => drawing, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener() {}, remove() {} };
  const show = factory(canvas, { sound: false, onStart: info => starts.push(info) });
  const key = 'lickety-celebration-rotation:v1', saved = values.get(key), first = starts[0];
  show.start({ type: 'click' }); handlers.get('click')({ type: 'click' });
  for (const replay of starts.slice(1)) { assert.equal(replay.effect, first.effect); assert.equal(replay.seed, first.seed); assert.equal(replay.userInitiated, true); }
  assert.equal(values.get(key), saved);
  show.start({ type: 'click' }, 'random');
  assert.notEqual(starts.at(-1).effect, first.effect);
  assert.equal(JSON.parse(values.get(key)).remaining.length, JSON.parse(saved).remaining.length - 1);
  const afterRandom = values.get(key);
  show.start({ type: 'click' }, 'aurora'); const chosen = starts.at(-1);
  show.start({ type: 'click' });
  assert.equal(starts.at(-1).effect, 'aurora'); assert.equal(starts.at(-1).seed, chosen.seed);
  assert.equal(values.get(key), afterRandom); show.destroy();
});

test('forced previews, reduced motion and preview rotation do not consume the normal rotation', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const select = rotationSession(storage), first = select(); const saved = JSON.stringify([...values]);
  select({ effect: 'curtain' }); select({ reducedMotion: true });
  assert.equal(JSON.stringify([...values]), saved);
  select({ rotationKey: 'preview' });
  assert.equal(values.get('lickety-celebration-rotation:v1'), JSON.parse(saved)[0][1]);
  const round = [first]; for (let i = 1; i < count; i++) round.push(select());
  assert.equal(new Set(round).size, count);
});

test('catalog additions and removals preserve the unfinished rotation across renderer updates', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const seen = Array.from({ length: 5 }, () => rotationSession(storage)());
  const expanded = addEffect(createBabbleCelebration.toString(), 'new-show');
  const rest = Array.from({ length: count - 4 }, () => rotationSession(storage, expanded)());
  assert.equal(rest[0], 'new-show', 'new additions play before older remaining effects');
  assert.equal(new Set([...seen, ...rest]).size, count + 1, 'new effect joins the remaining round without replaying consumed effects');
  const bag = JSON.parse([...values.values()][0]);
  assert.equal(bag.remaining.length, 0);
  assert.ok(bag.catalog.includes('new-show'));
  // Remove an unseen effect and add another while a round is in progress.
  const first = rotationSession(storage, expanded)();
  const before = JSON.parse([...values.values()][0]), removed = before.remaining.find(id => id !== 'new-show');
  const reduced = addEffect(expanded.replace("'" + removed + "', ", ''), 'another-show');
  const remaining = Array.from({ length: count }, () => rotationSession(storage, reduced)());
  assert.equal(remaining[0], 'another-show');
  assert.equal(new Set([first, ...remaining]).size, count + 1);
  assert.ok(!remaining.includes(removed));
});

test('the original twelve-effect bag gains every new show without replaying consumed originals', () => {
  const legacy = catalog.slice(0, 12), consumed = legacy.slice(0, 5);
  let raw = JSON.stringify({ version: 1, remaining: legacy.slice(5), last: consumed.at(-1) });
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const rest = Array.from({ length: count - consumed.length }, () => rotationSession(storage)());
  assert.equal(new Set([...consumed, ...rest]).size, count);
  assert.equal(new Set(rest.slice(0, count - legacy.length)).size, count - legacy.length);
  assert.ok(rest.slice(0, count - legacy.length).every(id => !legacy.includes(id)), 'all additions play first, including across reopening');
  assert.deepEqual(new Set(rest.slice(count - legacy.length)), new Set(legacy.slice(5)), 'older unfinished choices resume after the additions');
  assert.equal(JSON.parse(raw).remaining.length, 0);
  assert.ok(rest.includes('butterflies') && rest.includes('aurora'));
});

test('removed celebrations leave saved rounds without replaying the remaining effects', () => {
  const removed = ['treasure', 'toy-train', 'penguins', 'snow-globe'];
  for (const last of ['curtain', 'penguins']) {
    const remaining = [...catalog.filter(id => id !== 'curtain'), ...removed.filter(id => id !== last)];
    let raw = JSON.stringify({ version: 1, catalog: [...catalog, ...removed], remaining, last });
    const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
    const choices = Array.from({ length: count - 1 }, () => rotationSession(storage)());
    assert.equal(new Set(choices).size, count - 1);
    assert.ok(choices.every(id => catalog.includes(id) && id !== 'curtain'));
    assert.equal(JSON.parse(raw).remaining.length, 0);
    assert.deepEqual(JSON.parse(raw).catalog, Array.from(catalog));
  }
  assert.ok(removed.every(id => !catalog.includes(id)));
});

test('new scene choreography remains identical at the same elapsed time across different frame rates', () => {
  for (const effect of catalog.slice(12)) {
    function sample(step) {
      let time = 0, pending, record = [];
      const drawing = new Proxy({}, { get: (_target, name) => (...args) => {
        record.push([name, ...args]);
        if (/create.*Gradient/.test(name)) return { addColorStop() {} };
        if (name === 'measureText') return { width: args[0].length * 10 };
      }, set: (_target, name, value) => { record.push([name, value]); return true; } });
      const canvas = { dataset: {}, getContext: () => drawing, addEventListener() {}, removeEventListener() {}, remove() {} };
      const context = vm.createContext({ window: {}, innerWidth: 520, innerHeight: 800, performance: { now: () => time },
        addEventListener() {}, removeEventListener() {}, requestAnimationFrame: callback => { pending = callback; return 1; }, cancelAnimationFrame() {} });
      const factory = vm.runInContext('(' + createBabbleCelebration.toString() + ')', context);
      const show = factory(canvas, { effect, seed: 71, sound: false, transparent: true, words: ['alpha', 'bravo', 'charlie'] });
      for (time = step; time < 3500; time += step) pending(time);
      time = 3500; record = []; pending(time); show.destroy();
      return JSON.stringify(record);
    }
    assert.equal(sample(25), sample(50), effect + ' uses the same seed and elapsed time in all panes');
  }
});

test('hosted packs are bounded, cached atomically and retained through offline or incompatible updates', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { createCelebrationPacks, validatePack, SOURCE, MAX_BYTES } = require('../../src/celebration-pack');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-pack-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = JSON.stringify({ version: 1, effects: ['fireworks'], labels: ['Fireworks'],
    renderer: createBabbleCelebration.toString(), fireworks: createBabbleFireworks.toString() });
  let time = 0, calls = 0, bad = false;
  const fetchImpl = async (url, options) => {
    calls++; assert.equal(url, SOURCE); assert.equal(options.redirect, 'error');
    return new Response(bad ? '{}' : raw);
  };
  const packs = createCelebrationPacks({ cacheDir: dir, fetchImpl, now: () => time });
  const [first, concurrent] = await Promise.all([packs.load(), packs.load()]);
  assert.equal(first.deliverySource, 'downloaded');
  assert.equal(first.id, concurrent.id); assert.equal(calls, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'celebration-pack-v1.json'), 'utf8'), raw);
  time += 7 * 60 * 60 * 1000; bad = true;
  assert.equal((await packs.load()).id, first.id);
  const offline = createCelebrationPacks({ cacheDir: dir, fetchImpl: async () => { throw Error('offline'); } });
  assert.equal((await offline.load()).id, first.id);
  assert.equal((await offline.load()).deliverySource, 'cached');
  const fallback = createCelebrationPacks({ fetchImpl: async () => { throw Error('offline'); } });
  assert.equal((await fallback.load()).id, 'bundled');
  assert.throws(() => validatePack('x'.repeat(MAX_BYTES + 1)));
  assert.throws(() => validatePack(raw.replace('"version":1', '"version":2')));
  assert.throws(() => validatePack(raw.replace('function createBabbleCelebration(', 'function invalid(')));
  assert.throws(() => validatePack(raw.replace('function createBabbleCelebration(', 'function createBabbleCelebration(()')));
  globalThis.__packExecuted = false;
  validatePack(raw.replace('function createBabbleCelebration(canvas, options = {}) {', 'function createBabbleCelebration(canvas, options = {}) { globalThis.__packExecuted = true;'));
  assert.equal(globalThis.__packExecuted, false, 'validation never runs downloaded code in Node');
  delete globalThis.__packExecuted;
});

test('pack rejection reports only after repeated failures, retries quietly and recovers to downloaded effects', async () => {
  const { createCelebrationPacks } = require('../../src/celebration-pack');
  let time = 0, bad = true; const reports = [];
  const raw = JSON.stringify({ version: 1, effects: ['fireworks'], labels: ['Fireworks'], renderer: createBabbleCelebration.toString(), fireworks: createBabbleFireworks.toString() });
  const packs = createCelebrationPacks({ now: () => time, report: (event, data) => reports.push({ event, ...data }), fetchImpl: async () => new Response(bad ? '{}' : raw) });
  assert.equal((await packs.load()).deliverySource, 'bundled'); assert.equal(reports.length, 0);
  time += 300001; await packs.load(); assert.equal(reports.length, 1); assert.equal(reports[0].code, 'ERR_CELEBRATION_PACK_REJECTED');
  time += 300001; await packs.load(); assert.equal(reports.length, 1);
  bad = false; time += 300001; assert.equal((await packs.load()).deliverySource, 'downloaded');
});

test('redirects and oversized response streams quietly use bundled celebrations', async () => {
  const { createCelebrationPacks, MAX_BYTES } = require('../../src/celebration-pack');
  for (const fetchImpl of [async () => ({ ok: true, url: 'https://untrusted.test/pack' }),
    async () => new Response('x'.repeat(MAX_BYTES + 1)), async () => new Response('{}', { status: 404 })]) {
    assert.equal((await createCelebrationPacks({ fetchImpl }).load()).id, 'bundled');
  }
});

test('blocked storage and failed writes keep a complete rotation in memory, including a stale disk copy', () => {
  for (const mode of ['blocked', 'stale']) {
    let stale;
    const storage = { getItem() { if (mode === 'blocked') throw Error('blocked'); return stale; },
      setItem(_key, value) { if (mode === 'stale' && !stale) { stale = value; return; } throw Error('full'); } };
    const select = rotationSession(storage), choices = [];
    for (let i = 0; i < count * 2; i++) choices.push(select());
    assert.equal(new Set(choices.slice(0, count)).size, count); assert.equal(new Set(choices.slice(count)).size, count);
    assert.notEqual(choices[count - 1], choices[count]);
  }
});

test('malformed or obsolete rotation storage recovers to a valid complete round', () => {
  for (const initial of ['{', 'x'.repeat(4096), JSON.stringify({ version: 1, remaining: ['curtain', 'curtain'], last: 'slime' }), JSON.stringify({ version: 1, remaining: ['unknown'], last: null }), JSON.stringify({ version: 0, remaining: [], last: null })]) {
    let value = initial;
    const storage = { getItem: () => value, setItem: (_key, saved) => { value = saved; } }, choices = [];
    for (let i = 0; i < count; i++) choices.push(rotationSession(storage)());
    assert.equal(new Set(choices).size, count);
  }
});

test('powder mostly bursts high in the air, while some canisters bounce before bursting', () => {
  const bursts = [];
  for (const [seed, width] of [[7, 320], [31, 1280], [83, 520]]) {
    let time = 0, render = null;
    const ctx = new Proxy({}, { get: (_, name) => /create.*Gradient/.test(name) ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
    const canvas = { dataset: {}, getContext: () => ctx, addEventListener() {}, removeEventListener() {}, remove() {} };
    const context = vm.createContext({ canvas, options: { effect: 'powder', seed, transparent: true, sound: false },
      innerWidth: width, innerHeight: 750, devicePixelRatio: 1, performance: { now: () => time },
      addEventListener() {}, removeEventListener() {},
      record: item => bursts.push(item), requestAnimationFrame: callback => { render = callback; return 1; }, cancelAnimationFrame: () => { render = null; } });
    const source = createBabbleCelebration.toString().replace('p.popped = true; p.popAt = p.age;', 'p.popped = true; p.popAt = p.age; record({y:p.y,bounces:p.bounces});');
    vm.runInContext('(' + source + ')(canvas,options)', context);
    while (render && time < 61000) { time += 1000 / 30; const callback = render; render = null; callback(time); }
  }
  const aerial = bursts.filter(item => item.bounces === 0), bouncing = bursts.filter(item => item.bounces > 0);
  assert.ok(bursts.length > 70, 'the shows produce enough canisters to exercise both behaviours');
  assert.ok(aerial.length > bursts.length * .65, 'most explosions happen before any bounce');
  assert.ok(bouncing.length > 0, 'some canisters still bounce first');
  assert.ok(aerial.every(item => item.y < 750 / 2 && item.y > 0), 'aerial bursts happen visibly in the upper half of the page');
});

test('every celebration renders finite coordinates at narrow and wide sizes and releases frames on finish/dismissal', () => {
  for (const width of [320, 1280]) for (const effect of catalog.filter(id => id !== 'fireworks')) {
    let time = 0, render = null, draws = 0, removed = false, resize;
    const drawing = new Proxy({}, { get: (_, name) => (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${effect}/${name} coordinate is finite`);
      draws++;
      if (/create.*Gradient/.test(name)) return { addColorStop() {} };
      if (name === 'measureText') return { width: args[0].length * 10 };
    }, set: () => true });
    const canvas = { dataset: {}, getContext: () => drawing, addEventListener() {}, removeEventListener() {}, remove() { removed = true; } };
    const context = vm.createContext({ canvas, options: { effect, transparent: true, sound: false, duration: 12000, seed: 71, words: ['alpha', 'bravo', 'charlie'] },
      innerWidth: width, innerHeight: 750, devicePixelRatio: 2, performance: { now: () => time },
      addEventListener: (name, callback) => { if (name === 'resize') resize = callback; }, removeEventListener() {},
      requestAnimationFrame: callback => { assert.equal(render, null, 'only one frame is pending'); render = callback; return 1; },
      cancelAnimationFrame: () => { render = null; } });
    const show = vm.runInContext('(' + createBabbleCelebration.toString() + ')(canvas,options)', context);
    for (let i = 0; i < 400 && render; i++) { time += 1000 / 30; const callback = render; render = null; callback(time); if (i === 90) { context.innerWidth = 420; resize(); } }
    assert.ok(draws > 100, effect + ' draws a show'); assert.equal(canvas.dataset.running, 'false'); assert.equal(removed, true); assert.equal(render, null);
    show.destroy(); assert.equal(render, null);
  }
});

test('reduced motion stays static without consuming animations, and destroy cancels replay frames', () => {
  let time = 0, frame, calls = [];
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const canvas = { dataset: {}, getContext: () => ctx, addEventListener() {}, removeEventListener() {} };
  const context = vm.createContext({ canvas, innerWidth: 500, innerHeight: 700, performance: { now: () => time },
    matchMedia: () => ({matches:false}), addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: cb => { frame = cb; return 1; }, cancelAnimationFrame: () => {frame = null;},
    options: { reducedMotion: true, onStart: detail => calls.push(detail), fireworksFactory: () => assert.fail('reduced motion must not launch fireworks') } });
  const show = vm.runInContext('(' + createBabbleCelebration.toString() + ')(canvas,options)', context);
  show.start({type:'click'}); assert.equal(calls[0].effect, calls[1].effect); assert.equal(calls[1].userInitiated, true);
  assert.equal(calls[1].animation, 'message', 'preview can force reduced motion without changing the OS preference');
  time = 1000; frame(time); show.destroy(); assert.equal(frame, null); assert.equal(canvas.dataset.running, 'false');
});

function simulation(seed = 17, width = 500, height = 760, options = {}) {
  let time = 0, render;
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const drawing = new Proxy({}, {
    get: (_object, name) => name === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${String(name)} received a non-finite coordinate`);
    },
    set: () => true
  });
  const canvas = { dataset: {}, removed: false, getContext: () => drawing, addEventListener() {}, removeEventListener() {}, remove() { this.removed = true; } };
  const context = vm.createContext({
    Math: math, canvas, options, window: {},
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    performance: { now: () => time }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: callback => { render = callback; return 1; }, cancelAnimationFrame: () => { render = null; }
  });
  // Observe the private animation state in the test sandbox; no test API is shipped in the page.
  vm.runInContext('(' + script.replace('return {start,destroy,setSoundEnabled', `globalThis.inspect = {
    state: () => ({particles, rockets, embers, fountains, cues, running, endAt}),
    start, stop, destroy,
    clear: () => {particles=[];rockets=[];embers=[];cues=[];fountains=[];nextLaunch=Infinity;nextFountain=Infinity},
    burst: style => burst({x:250,y:150,scale:1,hues:[190,310],style}),
    fountain: () => fountainPattern(performance.now())
  };return {start,destroy,setSoundEnabled`) + ')(canvas,options);', context);
  return {
    ...context.inspect, canvas,
    advance(ms) { const until = time + ms; while (time < until) { time = Math.min(until, time + 1000 / 60); if(render){const next=render;render=null;next(time);} } }
  };
}

test('full fireworks shows include fountains, stay bounded, stop and replay cleanly', () => {
  for (const [seed, width, height] of [[7,500,760], [31,1440,900], [83,320,600]]) {
    const sim = simulation(seed, width, height);
    let sawFountain = false, peak = 0;
    for (let i = 0; i < 60; i++) {
      sim.advance(1000);
      const state = sim.state();
      sawFountain ||= state.fountains.length > 0;
      peak = Math.max(peak, state.particles.length);
      assert.ok(state.particles.length <= 1000 && state.embers.length <= 700);
      assert.ok(state.rockets.length <= 4 && state.cues.length <= 24);
    }
    sim.advance(100);
    assert.ok(sawFountain, `seed ${seed} includes bottom-up fountains`);
    assert.ok(peak > 100, 'aerial displays actually render');
    assert.equal(sim.state().running, false);
    assert.equal(sim.state().cues.length + sim.state().rockets.length + sim.state().fountains.length, 0);
    sim.advance(6000);
    assert.equal(sim.state().particles.length, 0);
    sim.start();
    assert.equal(sim.state().running, true);
    assert.equal(sim.state().particles.length, 0);
    assert.equal(sim.state().cues.length, 0);
    assert.equal(sim.canvas.dataset.running, 'true');
  }
});

test('transparent overlays remove their canvas after the show and support immediate dismissal', () => {
  const sim = simulation(9, 400, 700, { transparent: true, sound: false, clickReplay: false });
  sim.advance(66000);
  assert.equal(sim.canvas.removed, true);
  const dismissed = simulation(18, 400, 700, { transparent: true, sound: false });
  dismissed.destroy();
  assert.equal(dismissed.canvas.removed, true);
  assert.equal(dismissed.state().running, false);
});

test('multi-break shells burst again in mid-air and crossettes split without new ground launches', () => {
  const sim = simulation();
  sim.clear(); sim.burst('multi');
  const first = sim.state().particles.length;
  sim.advance(750);
  assert.ok(sim.state().particles.length > first, 'delayed secondary bursts create more stars');
  assert.equal(sim.state().rockets.length, 0);
  sim.clear(); sim.burst('crossette');
  const primary = sim.state().particles.length;
  sim.advance(950);
  assert.ok(sim.state().particles.length > primary, 'primary stars split into smaller crosses');
  assert.ok(sim.state().particles.every(p => !p.split), 'secondary stars cannot split recursively');
});

test('fountains emit rising sparks from the bottom and replay cancels queued secondary bursts', () => {
  const sim = simulation();
  sim.clear(); assert.equal(sim.fountain(), true);
  sim.advance(250);
  assert.ok(sim.state().particles.length > 0);
  assert.ok(sim.state().particles.every(p => p.fountain && p.vy < 0 && p.y > 500));
  sim.clear(); sim.burst('multi');
  assert.equal(sim.state().cues.length, 1);
  sim.start();
  assert.equal(sim.state().cues.length, 0, 'replay discards the previous show’s pending bursts');
});
