'use strict';

function createLicketyMessenger({ endpoint = 'https://selfserve.r46.me/api/lickety-message', version, fetchImpl = globalThis.fetch } = {}) {
  return {
    async send(details) {
      const text = typeof details === 'string' ? details : details?.message;
      if (typeof text !== 'string' || !text.trim() || text.length > 500) return { ok: false, message: 'Enter a message of 1–500 characters.' };
      const name = typeof details === 'string' ? '' : details?.name ?? '';
      const email = typeof details === 'string' ? '' : details?.email ?? '';
      if (typeof name !== 'string' || name.length > 80) return { ok: false, message: 'Enter a name of up to 80 characters.' };
      if (typeof email !== 'string' || email.length > 254 || (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) return { ok: false, message: 'Enter a valid email address or leave it blank.' };
      if (!endpoint) return { ok: false, message: 'Messages are temporarily unavailable. Please try again later.' };
      try {
        const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ message: text.trim(), ...(name.trim() ? { name: name.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}), version }) });
        if (!response.ok) return { ok: false, message: 'Your message could not be delivered. Please try again.' };
        return { ok: true, message: 'Your message has been sent to lickety. Thank you!' };
      } catch { return { ok: false, message: 'Your message could not be delivered. Please try again.' }; }
    },
  };
}
module.exports = { createLicketyMessenger };
