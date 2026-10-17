'use strict';

// Chromium can create Windows spellchecker/cache directories in its process
// working directory when a test runs in a restricted environment. Keep those
// disposable artifacts out of the repository by running Electron in its own
// temporary working directory.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testName = process.argv[2];
if (!testName || path.basename(testName) !== testName) {
  console.error('Usage: node test/e2e/run.js <test-file> [electron arguments]');
  process.exit(2);
}

const testFile = path.join(__dirname, testName);
if (!fs.existsSync(testFile)) {
  console.error(`E2E test not found: ${testFile}`);
  process.exit(2);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'babble-expert-electron-'));
try {
  const electron = require('electron');
  const env = { ...process.env };
  // Some automation hosts run Node through Electron and export this globally.
  // The child must start in normal Electron mode for the GUI integration test.
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, [testFile, ...process.argv.slice(3)], {
    cwd: workDir,
    env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status === null ? 1 : result.status;
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
