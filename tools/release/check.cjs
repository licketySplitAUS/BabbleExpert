'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const YAML = require('yaml');
const pkg = require('../../package.json'), lock = require('../../package-lock.json');
assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
assert.equal(pkg.build.buildVersion, pkg.version + '.0');
if (process.env.GITHUB_REF?.startsWith('refs/tags/')) assert.equal(process.env.GITHUB_REF.slice('refs/tags/v'.length), pkg.version, 'Tag and package version must match');
assert.ok(fs.readFileSync(path.join(__dirname, '../../RELEASE_NOTES.md'), 'utf8').includes('Babble Expert ' + pkg.version));
require('../../src/update-highlights').validateHighlights(require('../../src/update-highlights.json'));
assert.ok(/unsigned/i.test(fs.readFileSync(path.join(__dirname, '../../CODE_SIGNING.md'), 'utf8')));
const directory = process.argv[2];
if (directory) {
  const manifests = fs.readdirSync(directory).filter(name => /^latest.*\.yml$/.test(name));
  assert.ok(manifests.length, 'Update manifests missing');
  for (const filename of manifests) {
    const manifest = YAML.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    assert.equal(manifest.version, pkg.version, 'Manifest version must match the app');
    for (const file of manifest.files) {
      assert.equal(path.basename(file.url), file.url, 'Manifest assets must be simple filenames');
      const bytes = fs.readFileSync(path.join(directory, file.url));
      assert.equal(crypto.createHash('sha512').update(bytes).digest('base64'), file.sha512, 'Installer hash mismatch');
      assert.equal(bytes.length, file.size, 'Installer size mismatch');
      assert.ok(fs.existsSync(path.join(directory, file.url + '.blockmap')), 'Installer blockmap missing');
      fs.writeFileSync(path.join(directory, file.url + '.sha256'), crypto.createHash('sha256').update(bytes).digest('hex') + '  ' + file.url + '\n');
    }
  }
}
console.log('PASS release metadata' + (directory ? ', installer hashes, sizes and blockmaps' : '') + ' for ' + pkg.version);
