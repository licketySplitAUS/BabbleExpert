'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findBabbleWordEntry } = require('../../src/babble-entry');
const { makeBabbleGlowScript } = require('../../src/babble-glow');
const vm = require('node:vm');

function field(name, attributes = {}, form = null) {
  return { name, id: '', type: 'text', placeholder: '', form,
    closest: () => null, getAttribute: key => attributes[key] || '' };
}
const documentWith = (...fields) => ({ querySelectorAll: () => fields });

test('Babble login Email and Password labels never identify a word entry', () => {
  const form = { name: '', textContent: 'Email: Password:', getAttribute: key => key === 'action' ? '/action/log_in' : '', querySelector: () => ({}) };
  const email = field('email', {}, form), password = { ...field('password', {}, form), type: 'password' };
  assert.equal(findBabbleWordEntry(documentWith(email, password)), null);
});

test('credential identity, autocomplete and password forms are excluded even when labelled word', () => {
  for (const input of [field('username', { 'aria-label': 'word' }), field('word', { autocomplete: 'username' }),
    field('word', { autocomplete: 'section-login current-password' }),
    field('word', {}, { querySelector: () => ({}), getAttribute: () => '' }),
    field('word', {}, { querySelector: () => null, getAttribute: key => key === 'action' ? '/password' : '' })]) {
    assert.equal(findBabbleWordEntry(documentWith(input)), null);
  }
});

test('ordinary form text containing Password is not evidence of a word entry', () => {
  const input = field('account', {}, { name: '', textContent: 'Password', getAttribute: () => '', querySelector: () => null });
  assert.equal(findBabbleWordEntry(documentWith(input)), null);
});

test('real word field still wins over chat and dictionary search', () => {
  const word = field('add_word');
  assert.equal(findBabbleWordEntry(documentWith(field('add_message'), field('find_word'), word)), word);
});

test('login pages install no glow controls or input listeners', () => {
  const email = field('email');
  const result = vm.runInNewContext(makeBabbleGlowScript(), {
    location: { hostname: 'playbabble.com' }, window: {}, document: documentWith(email)
  });
  assert.equal(result, false, 'must return before creating overlays or registering handlers');
});
