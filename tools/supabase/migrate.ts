/**
 * Applies the SQL files of supabase/migrations that have not been applied yet
 * (tracked in the table public.schema_migrations).
 *
 *   npm run supabase:migrate -w @maitremot/tools
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from './api';

const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

await sql(`create table if not exists public.schema_migrations (
  name text primary key, applied_at timestamptz not null default now());
  alter table public.schema_migrations enable row level security;`);
const applied = new Set(
  ((await sql('select name from public.schema_migrations')) as { name: string }[]).map(
    (r) => r.name,
  ),
);

for (const file of readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  if (applied.has(file)) continue;
  const body = readFileSync(dir + file, 'utf8');
  // One transaction per file: all or nothing.
  await sql(
    `begin;\n${body}\ninsert into public.schema_migrations (name) values ('${file}');\ncommit;`,
  );
  console.log(`applied ${file}`);
}
console.log('database up to date');
