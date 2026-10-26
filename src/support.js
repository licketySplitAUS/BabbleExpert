'use strict';
const os = require('node:os');
function supportSummary({ version, anonymousId, paneHealth, update, diagnostics = [], runtime = process.versions.electron || 'development' }) {
  const lines = ['Babble Expert support summary', `Version: ${version}`, `Electron: ${runtime}`,
    `Installation: ${anonymousId || 'not available'}`,
    `System: ${process.platform} / ${process.arch} / ${os.release()}`, `Total RAM: ${Math.round(os.totalmem() / 1048576)} MB`,
    ...Object.entries(paneHealth).map(([name, state]) => `${name}: ${state}`),
    `Update: ${update.phase}${update.version ? ' / ' + update.version : ''}`, 'Recent technical events:'];
  lines.push(...diagnostics.slice(-10).map(item => [item.occurredAt, item.event, item.component, item.code, item.errorType, item.source && `${item.source}:${item.line}`, item.count > 1 ? `count=${item.count}` : ''].filter(value => value !== undefined && value !== '').join(' ')));
  if (!diagnostics.length) lines.push('None recorded in this session.');
  lines.push('No entered words, chat, passwords, page addresses or local paths are included.');
  return lines.join('\n');
}
module.exports = { supportSummary };
