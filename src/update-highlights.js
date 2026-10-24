'use strict';
const bundled = require('./update-highlights.json');
const { isNewerVersion } = require('./updates');

function releaseVersion(value) {
  const match = typeof value === 'string' && value.match(/^(\d+)\.(\d+)\.(\d+)(?:\.\d+)?$/);
  return match ? match.slice(1, 4).map(Number).join('.') : '';
}
function validateHighlights(items) {
  if (!Array.isArray(items) || !items.length || items.length > 8 || items.some(item => !item ||
      typeof item.title !== 'string' || !item.title.trim() || item.title.length > 80 ||
      typeof item.body !== 'string' || !item.body.trim() || item.body.length > 600)) throw Error('Invalid update highlights');
  return items.map(({ title, body }) => ({ title, body }));
}

// Separate the acknowledgement from lastRunVersion: a crash or closing the
// window before OK must not silently consume this release's announcement.
function createUpdateHighlights({ settings, version, enabled = false, items = bundled }) {
  const current = releaseVersion(version), highlights = validateHighlights(items);
  const acknowledged = () => releaseVersion(settings.data.acknowledgedUpdateVersion);
  const alreadyAcknowledged = () => acknowledged() && !isNewerVersion(current, acknowledged());
  if (enabled && current) {
    const previous = releaseVersion(settings.data.lastRunVersion || settings.data.telemetryVersion);
    if (previous && isNewerVersion(current, previous) && !alreadyAcknowledged()) {
      settings.patch({ pendingUpdateVersion: current }); settings.flush();
    }
  }
  const pending = () => !!enabled && !!current && releaseVersion(settings.data.pendingUpdateVersion) === current && !alreadyAcknowledged();
  return {
    pending,
    view: () => ({ version: current, preview: !enabled, items: highlights.map(item => ({ ...item })) }),
    acknowledge() {
      if (!pending()) return false;
      const previous = { acknowledgedUpdateVersion: settings.data.acknowledgedUpdateVersion, pendingUpdateVersion: settings.data.pendingUpdateVersion };
      settings.patch({ acknowledgedUpdateVersion: current, pendingUpdateVersion: null });
      if (settings.flush() === false) { settings.patch(previous); return false; }
      return true;
    }
  };
}
module.exports = { createUpdateHighlights, releaseVersion, validateHighlights };
