'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(__dirname, 'hints.cjs')], { env,
  detached: true, windowsHide: true, stdio: 'ignore', cwd: path.resolve(__dirname, '../..') });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.unref();
console.log('Opening the Helpful Hints test preview with its own settings and login profile.');
