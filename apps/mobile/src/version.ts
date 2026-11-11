/**
 * Version of the app as shown to players: version number, git commit and build
 * date (see app.config.js). Comparing the commit tells whether two players use
 * the same version.
 */

import Constants from 'expo-constants';

interface BuildInfo {
  readonly commit: string;
  readonly date: string;
}

const config = Constants.expoConfig;
const build = (config?.extra as { build?: BuildInfo } | undefined)?.build;

export const APP_VERSION = config?.version ?? '?';

/** "Version 1.0.0 · c5d7dc0 · 11/11/2026" */
export function versionLabel(): string {
  const parts = [`Version ${APP_VERSION}`];
  if (build) {
    parts.push(build.commit);
    const date = new Date(build.date);
    if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString('fr-FR'));
  }
  return parts.join(' · ');
}
