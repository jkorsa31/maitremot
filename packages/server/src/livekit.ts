/**
 * Access tokens for LiveKit (audio / video calls).
 *
 * LiveKit relays the calls; to join a "room" a client needs a token signed
 * with the project's API secret. The secret stays on the server: the `game`
 * function signs a token only for players of the game, valid for the room of
 * that game only, for a few hours.
 *
 * A LiveKit token is a standard JWT signed with HMAC-SHA256; it is built here
 * with the Web Crypto API (available in Deno and Node), without a dependency.
 */

export interface LiveKitConfig {
  readonly apiKey: string;
  readonly apiSecret: string;
}

const encoder = new TextEncoder();

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createCallToken(
  config: LiveKitConfig,
  options: { identity: string; name: string; room: string; ttlSeconds?: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: config.apiKey,
    sub: options.identity,
    name: options.name,
    nbf: now - 10,
    exp: now + (options.ttlSeconds ?? 6 * 3600),
    video: {
      room: options.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned)));
  return `${unsigned}.${base64url(signature)}`;
}
