'use strict';

function createLicketyMessenger({ endpoint = 'https://selfserve.r46.me/api/lickety-message', version, fetchImpl = globalThis.fetch } = {}) {
  return {
    async send(text) {
      if (typeof text !== 'string' || !text.trim() || text.length > 500) return { ok: false, message: 'Enter a message of 1–500 characters.' };
      if (!endpoint) return { ok: false, message: 'Messages are temporarily unavailable. Please try again later.' };
      try {
        const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ message: text.trim(), version }) });
        if (!response.ok) return { ok: false, message: 'Your message could not be delivered. Please try again.' };
        return { ok: true, message: 'Your message has been sent to lickety. Thank you!' };
      } catch { return { ok: false, message: 'Your message could not be delivered. Please try again.' }; }
    },
  };
}
module.exports = { createLicketyMessenger };
