'use strict';
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const history = require('./release-history.json');
const { isNewerVersion } = require('./updates');
const RELEASES_API = 'https://api.github.com/repos/licketySplitAUS/BabbleExpert/releases?per_page=8';

function createReleaseNotes({ fetchImpl = globalThis.fetch, runningVersion = pkg.version, clock = Date.now } = {}) {
  const bundled = [{ version: pkg.version, body: fs.readFileSync(path.join(__dirname, '..', 'RELEASE_NOTES.md'), 'utf8').replace(/^\uFEFF/, '') }, ...history];
  let cached = [], loadedAt = null, pending;
  const result = message => ({ installedVersion: runningVersion, entries: [...new Map([...cached, ...bundled].map(entry => [entry.version, entry])).values()]
    .sort((a, b) => isNewerVersion(a.version, b.version) ? -1 : isNewerVersion(b.version, a.version) ? 1 : 0), message });
  async function get({ online = false, refresh = false } = {}) {
    if (!online) return result('Included release notes are available offline.');
    if (!refresh && loadedAt !== null && clock() - loadedAt < 30 * 60 * 1000) return result('Recent release notes are up to date.');
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetchImpl(RELEASES_API, { signal: AbortSignal.timeout(6500), cache: 'no-store',
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Babble-Expert-Release-Notes' } });
        if (!response.ok) throw new Error('Release notes unavailable');
        const releases = await response.json();
        if (!Array.isArray(releases)) throw new Error('Invalid releases response');
        cached = releases.filter(release => !release.draft && !release.prerelease && /^v?\d+\.\d+\.\d+$/.test(release.tag_name || ''))
          .slice(0, 8).map(release => ({ version: release.tag_name.replace(/^v/, ''), date: String(release.published_at || '').slice(0, 10),
            body: String(release.body || 'No release notes were supplied.').slice(0, 50000) }));
        loadedAt = clock();
        return result('Recent release notes are up to date.');
      } catch {
        return result('Could not load online release notes. Included notes are still available below.');
      }
    })();
    try { return await pending; } finally { pending = null; }
  }
  return { get };
}
module.exports = { createReleaseNotes, RELEASES_API };
