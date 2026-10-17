'use strict';

const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FORMAT = /^BE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

function makeAnonymousId(randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(8);
  let value = '';
  for (let i = 0; i < 8; i++) value += ALPHABET[bytes[i] % ALPHABET.length];
  return `BE-${value.slice(0, 4)}-${value.slice(4)}`;
}

const isAnonymousId = value => typeof value === 'string' && FORMAT.test(value);

module.exports = { makeAnonymousId, isAnonymousId, FORMAT };
