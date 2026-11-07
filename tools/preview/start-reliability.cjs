'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(__dirname, 'reliability.cjs')], { env,
  detached: true, windowsHide: true, stdio: 'ignore', cwd: path.resolve(__dirname, '../..') });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.unref();
console.log('Opening local Expert 3.5.0.1 with a separate profile and no updates or notifications.');
