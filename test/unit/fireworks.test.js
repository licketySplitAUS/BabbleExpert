'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createBabbleFireworks } = require('../../src/experiments/fireworks');
const { createBabbleCelebration } = require('../../src/experiments/celebrations');

const script = createBabbleFireworks.toString();

function rotationSession(storage) {
  const drawing = new Proxy({}, { get: () => () => {}, set: () => true });
  const context = vm.createContext({ window: { localStorage: storage }, innerWidth: 520, innerHeight: 750,
    performance: { now: () => 0 }, addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  const factory = vm.runInContext('(' + createBabbleCelebration.toString() + ')', context);
  return options => {
    const canvas = { dataset: {}, getContext: () => drawing, addEventListener() {}, removeEventListener() {}, remove() {} };
    const show = factory(canvas, { sound: false, ...options });
    const selected = canvas.dataset.effect; show.destroy(); return selected;
  };
}

test('saved random rotation shows every effect once per round across page reloads, without a boundary repeat', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const choices = [];
  for (let i = 0; i < 36; i++) choices.push(rotationSession(storage)());
  for (let i = 0; i < choices.length; i += 12) assert.equal(new Set(choices.slice(i, i + 12)).size, 12);
  assert.notEqual(choices[11], choices[12]); assert.notEqual(choices[23], choices[24]);
  const bag = JSON.parse([...values.values()][0]);
  assert.equal(bag.remaining.length, 0); assert.equal(bag.last, choices.at(-1));
  assert.deepEqual(Object.keys(bag).sort(), ['last', 'remaining', 'version']);
});

test('forced previews, reduced motion and preview rotation do not consume the normal rotation', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const select = rotationSession(storage), first = select(); const saved = JSON.stringify([...values]);
  select({ effect: 'curtain' }); select({ reducedMotion: true });
  assert.equal(JSON.stringify([...values]), saved);
  select({ rotationKey: 'preview' });
  assert.equal(values.get('lickety-celebration-rotation:v1'), JSON.parse(saved)[0][1]);
  const round = [first]; for (let i = 1; i < 12; i++) round.push(select());
  assert.equal(new Set(round).size, 12);
});

test('blocked storage and failed writes keep a complete rotation in memory, including a stale disk copy', () => {
  for (const mode of ['blocked', 'stale']) {
    let stale;
    const storage = { getItem() { if (mode === 'blocked') throw Error('blocked'); return stale; },
      setItem(_key, value) { if (mode === 'stale' && !stale) { stale = value; return; } throw Error('full'); } };
    const select = rotationSession(storage), choices = [];
    for (let i = 0; i < 24; i++) choices.push(select());
    assert.equal(new Set(choices.slice(0, 12)).size, 12); assert.equal(new Set(choices.slice(12)).size, 12);
    assert.notEqual(choices[11], choices[12]);
  }
});

test('malformed or obsolete rotation storage recovers to a valid complete round', () => {
  for (const initial of ['{', 'x'.repeat(4096), JSON.stringify({ version: 1, remaining: ['curtain', 'curtain'], last: 'slime' }), JSON.stringify({ version: 1, remaining: ['unknown'], last: null }), JSON.stringify({ version: 0, remaining: [], last: null })]) {
    let value = initial;
    const storage = { getItem: () => value, setItem: (_key, saved) => { value = saved; } }, choices = [];
    for (let i = 0; i < 12; i++) choices.push(rotationSession(storage)());
    assert.equal(new Set(choices).size, 12);
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
  for (const width of [320, 1280]) for (const effect of ['disco','lasers','lanterns','poppers','champagne','balloons','scroll','curtain','glitter','powder','slime']) {
    let time = 0, render = null, draws = 0, removed = false, resize;
    const drawing = new Proxy({}, { get: (_, name) => (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${effect}/${name} coordinate is finite`);
      draws++;
      if (/create.*Gradient/.test(name)) return { addColorStop() {} };
    }, set: () => true });
    const canvas = { dataset: {}, getContext: () => drawing, addEventListener() {}, removeEventListener() {}, remove() { removed = true; } };
    const context = vm.createContext({ canvas, options: { effect, transparent: true, sound: false, duration: 12000, seed: 71 },
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
