import { randomBytes } from 'node:crypto';

/**
 * Generates a cryptographically secure random hexadecimal string.
 *
 * This helper uses `randomBytes()` from Node.js `node:crypto` to produce
 * random bytes and encodes them as a hexadecimal string.
 *
 * It is useful for generating collision-resistant values such as temporary
 * filenames, identifiers, or cache keys.
 *
 * The returned string length is always `byteLength * 2`, because each byte
 * is encoded as two hexadecimal characters.
 *
 * @example
 * ```ts
 * generateRandomHexString(); // 40 hex characters
 * generateRandomHexString(10); // 20 hex characters
 * ```
 *
 * @param byteLength - Number of random bytes to generate. Defaults to `20`.
 * @returns A random hexadecimal string of length `byteLength * 2`.
 */
export function generateRandomHexString(byteLength = 20): string {
  return randomBytes(byteLength).toString('hex');
}
