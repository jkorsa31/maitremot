// Dynamic part of the app configuration (app.json holds the rest).
// Adds the build identity, shown at the bottom of the home screen, so that
// players can check they all use the same, latest version:
// - commit: the git commit the app was built from (7 characters);
// - date: when it was built (or when the dev server started, with Expo Go).
const { execSync } = require('node:child_process');

function commit() {
  // Vercel and EAS give the commit of the build; locally, ask git.
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA || process.env.EAS_BUILD_GIT_COMMIT_HASH;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'inconnu';
  }
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    build: { commit: commit(), date: new Date().toISOString() },
  },
});
