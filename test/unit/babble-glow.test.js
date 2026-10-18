'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findGridPaths, chooseGridPath, makeBabbleGlowScript } = require('../../src/babble-glow');

test('finds adjacent paths without reusing a tile', () => {
  const grid = [
    'c', 'a', 't',
    'x', 'r', 's',
    'x', 'x', 'x'
  ];
  assert.deepEqual(findGridPaths(grid, 3, 'cat'), [[0, 1, 2]]);
  assert.deepEqual(findGridPaths(grid, 3, 'car'), [[0, 1, 4]]);
  assert.deepEqual(findGridPaths(grid, 3, 'cac'), []);
});

test('duplicate letters reroute only when the existing route cannot continue', () => {
  const grid = [
    'a', 'b', 'x',
    'a', 'b', 'c',
    'x', 'x', 'x'
  ];
  const first = chooseGridPath(findGridPaths(grid, 3, 'ab'));
  const extended = chooseGridPath(findGridPaths(grid, 3, 'abc'), first);
  assert.deepEqual(extended, [3, 4, 5]);
});

test('remaining-word weights choose the useful duplicate route', () => {
  const paths = [[0, 1], [3, 4]];
  assert.deepEqual(chooseGridPath(paths, [0, 1], [0, 3]), [3, 4]);
});

test('q tile consumes the u in qu without requiring a second tile', () => {
  const grid = ['q', 'i', 'x', 'x'];
  assert.deepEqual(findGridPaths(grid, 2, 'qui'), [[0, 1]]);
  assert.deepEqual(findGridPaths(grid, 2, 'q'), [[0]]);
});

test('generated injection is valid JavaScript and host guarded', () => {
  const script = makeBabbleGlowScript();
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /playbabble\.com/);
});

test('impossible repeated-letter hints are rejected before searching the grid', () => {
  let reads = 0;
  const board = Array.from({ length: 25 }, (_, index) => index);
  for (let i = 0; i < 25; i++) Object.defineProperty(board, i, { get() { reads++; return 'a'; } });
  assert.deepEqual(findGridPaths(board, 5, 'aaaaaaaaaaaaz'), []);
  assert.ok(reads <= 25, 'Only one board read is needed');
  assert.deepEqual(findGridPaths(Array(25).fill('a'), 5, 'a'.repeat(26)), []);
});
