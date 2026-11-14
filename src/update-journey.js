'use strict';
const { isNewerVersion } = require('./updates');
const stages = new Set(['download-ready', 'later', 'install-requested', 'download-opened', 'running']);
const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value) && value.length <= 32;
function createUpdateJourney({ settings, version: runningVersion, report = () => {} }) {
  const seen = new Set();
  function record(stage, targetVersion) {
    if (!stages.has(stage) || !version(targetVersion) || stage === 'running' || !isNewerVersion(targetVersion, runningVersion)) return;
    const key = `${stage}:${targetVersion}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Persist before an installer can close the process. This contains versions
    // and an update stage only, independently of whether reporting is enabled.
    settings.patch({ updateJourney: { targetVersion, previousVersion: runningVersion, stage } });
    settings.flush();
    report('update-stage', { component: 'updater', stage, targetVersion, previousVersion: runningVersion });
  }
  function confirmRunning() {
    const pending = settings.data.updateJourney;
    if (!pending || !version(pending.targetVersion) || !isNewerVersion(runningVersion, pending.previousVersion) ||
        isNewerVersion(pending.targetVersion, runningVersion)) return;
    report('update-stage', { component: 'updater', stage: 'running', targetVersion: pending.targetVersion, previousVersion: pending.previousVersion });
    settings.patch({ updateJourney: null }); settings.flush();
  }
  return { record, confirmRunning };
}
module.exports = { createUpdateJourney, stages };
