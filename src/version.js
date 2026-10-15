'use strict';

// electron-builder deliberately removes its `build` configuration from the
// package.json inside app.asar, so packaged builds must not require it.
function displayVersion(pkg) {
  return (pkg && pkg.build && pkg.build.buildVersion) || `${pkg.version}.0`;
}

module.exports = { displayVersion };
