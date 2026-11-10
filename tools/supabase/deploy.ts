/**
 * Bundles and deploys the `game` Edge Function.
 *
 * The function's code lives in packages/server and uses the engine and the
 * dictionary; esbuild bundles everything into one ES module (supabase-js is
 * left as an `npm:` import, resolved by the Deno runtime), which is uploaded
 * with the Management API.
 *
 *   npm run supabase:deploy -w @maitremot/tools
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { api } from './api';

const entry = fileURLToPath(new URL('../../supabase/functions/game/index.ts', import.meta.url));
const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: ['npm:*'],
  mainFields: ['module', 'main'],
  write: false,
  legalComments: 'none',
});
const code = result.outputFiles[0]!.text;
console.log(`bundle: ${(code.length / 1e6).toFixed(2)} MB`);

const form = new FormData();
form.append(
  'metadata',
  JSON.stringify({ name: 'game', entrypoint_path: 'index.js', verify_jwt: false }),
);
form.append('file', new Blob([code], { type: 'application/javascript' }), 'index.js');
const deployed = (await api('/functions/deploy?slug=game', { method: 'POST', body: form })) as {
  slug: string;
  version: number;
  status: string;
};
console.log(`deployed ${deployed.slug} v${deployed.version} (${deployed.status})`);
