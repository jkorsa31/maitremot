// Supabase Edge Function "game" (Deno). The logic lives in packages/server;
// this entry is bundled with it by tools/supabase/deploy.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRequestHandler } from '../../../packages/server/src/edge.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const livekitKey = Deno.env.get('LIVEKIT_API_KEY');
const livekitSecret = Deno.env.get('LIVEKIT_API_SECRET');

Deno.serve(
  createRequestHandler(createClient as never, {
    url: Deno.env.get('SUPABASE_URL')!,
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    // Calls are enabled once the LiveKit secrets are set on the project.
    livekit:
      livekitKey && livekitSecret ? { apiKey: livekitKey, apiSecret: livekitSecret } : undefined,
  }),
);
