'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createBabbleFireworks } = require('../../src/experiments/fireworks');

const script = createBabbleFireworks.toString();

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
  vm.runInContext('(' + script.replace('return {start,destroy};', `globalThis.inspect = {
    state: () => ({particles, rockets, embers, fountains, cues, running, endAt}),
    start, stop, destroy,
    clear: () => {particles=[];rockets=[];embers=[];cues=[];fountains=[];nextLaunch=Infinity;nextFountain=Infinity},
    burst: style => burst({x:250,y:150,scale:1,hues:[190,310],style}),
    fountain: () => fountainPattern(performance.now())
  };return {start,destroy};`) + ')(canvas,options);', context);
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
