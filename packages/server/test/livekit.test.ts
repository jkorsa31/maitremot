import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCallToken } from '../src/livekit';

describe('LiveKit token', () => {
  it('is a valid HS256 JWT granting access to one room', async () => {
    const token = await createCallToken(
      { apiKey: 'APIkey', apiSecret: 'secret-123' },
      { identity: 'user-1', name: 'Alice', room: 'game-42', ttlSeconds: 60 },
    );
    const [header, payload, signature] = token.split('.');
    const expected = createHmac('sha256', 'secret-123')
      .update(`${header}.${payload}`)
      .digest('base64url');
    expect(signature).toBe(expected);
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    expect(claims).toMatchObject({
      iss: 'APIkey',
      sub: 'user-1',
      name: 'Alice',
      video: { room: 'game-42', roomJoin: true, canPublish: true, canSubscribe: true },
    });
    expect(claims.exp - claims.nbf).toBe(70);
  });
});
