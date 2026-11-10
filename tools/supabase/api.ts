/**
 * Minimal client for the Supabase Management API (https://api.supabase.com).
 *
 * Authentication: a personal access token in SUPABASE_ACCESS_TOKEN. (In the
 * Claude Code cloud environment the token is injected by the network proxy, so
 * the variable may be absent there.)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const project = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../supabase/project.json', import.meta.url)), 'utf8'),
) as { ref: string; url: string; publishableKey: string };

const BASE = `https://api.supabase.com/v1/projects/${project.ref}`;

export async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Runs SQL on the project's database. */
export function sql(query: string): Promise<unknown> {
  return api('/database/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}
