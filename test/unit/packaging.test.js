'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { displayVersion } = require('../../src/version');

test('packaged package metadata can omit electron-builder configuration', () => {
  assert.equal(displayVersion({ version: '3.1.1' }), '3.1.1.0');
  assert.equal(displayVersion({ version: '3.1.1', build: { buildVersion: '3.1.1.42' } }), '3.1.1.42');
});
