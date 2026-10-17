'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeAnonymousId, isAnonymousId } = require('../../src/anonymous-id');

test('anonymous IDs are compact, valid and made only from random bytes', () => {
  const id = makeAnonymousId(() => Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
  assert.equal(id, 'BE-ABCD-EFGH');
  assert.equal(isAnonymousId(id), true);
  assert.equal(isAnonymousId('BE-USER-NA1E'), false);
});
