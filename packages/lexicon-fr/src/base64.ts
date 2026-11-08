/**
 * Base64 → bytes decoder. Written by hand because `Buffer` only exists in Node
 * and `atob` returns a string; this works identically in every JS runtime.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUES = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) VALUES[ALPHABET.charCodeAt(i)] = i;

export function decodeBase64(text: string): Uint8Array {
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length * 3) / 4 - padding);
  let out = 0;
  // Every 4 characters (4 × 6 bits) encode 3 bytes (3 × 8 bits).
  for (let i = 0; i < text.length; i += 4) {
    const chunk =
      (VALUES[text.charCodeAt(i)]! << 18) |
      (VALUES[text.charCodeAt(i + 1)]! << 12) |
      (VALUES[text.charCodeAt(i + 2)]! << 6) |
      VALUES[text.charCodeAt(i + 3)]!;
    if (out < bytes.length) bytes[out++] = (chunk >> 16) & 0xff;
    if (out < bytes.length) bytes[out++] = (chunk >> 8) & 0xff;
    if (out < bytes.length) bytes[out++] = chunk & 0xff;
  }
  return bytes;
}
