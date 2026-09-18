import { randomBytes } from 'node:crypto';

/**
 * Generates a cryptographically secure random hexadecimal string.
 *
 * This helper uses `randomBytes()` from Node.js `node:crypto` to produce
 * random bytes and encodes them as a lowercase hexadecimal string.
 *
 * It is useful for generating random values such as temporary filenames,
 * identifiers, or cache keys, where a sufficiently large `byteLength` can
 * provide a low probability of collisions.
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
 * @returns A random lowercase hexadecimal string of length `byteLength * 2`.
 * @throws {RangeError} If `byteLength` is not a non-negative integer.
 */
export function generateRandomHexString(byteLength = 20): string {
  if (!Number.isInteger(byteLength) || byteLength < 0) {
    throw new RangeError('byteLength must be a non-negative integer.');
  }

  return randomBytes(byteLength).toString('hex');
}
