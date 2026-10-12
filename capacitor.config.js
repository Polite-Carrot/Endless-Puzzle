'use strict';
/* Capacitor loads this by requiring it, so the side effect below runs before
 * every `cap` command that reads the config — sync, copy, update, open, run.
 * That keeps `npx cap sync` honest: www/ is rebuilt from the current sources
 * first, so a file newly added to index.html can't be left out of the app.
 * (The same arrangement as Color Match & Merge.) */
const path = require('path');
const { execFileSync } = require('child_process');

try {
  execFileSync(process.execPath, [path.join(__dirname, 'sync-web.js')], { stdio: 'inherit', cwd: __dirname });
} catch (err) {
  console.error('capacitor.config.js: sync-web.js failed:', err && err.message);
  process.exit(1);
}

module.exports = {
  appId: 'com.politecarrot.endlessquiz',
  appName: 'Endless Quiz',
  webDir: 'www',
  plugins: {
    LocalNotifications: {
      // the sky blue of the game, for Android's notification accent
      iconColor: '#3b9fd8',
    },
  },
};
