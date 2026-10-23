/**
 * Canonical track key format used by `TrackInfo.key`.
 *
 * Requires an uppercase note letter from `A` to `G`, an optional flat (`b`)
 * or sharp (`#`) accidental, and an optional lowercase `m` suffix for minor
 * keys. Use `normalizeTrackKey()` to normalize non-canonical input values.
 */
export const trackKeyPattern = /^[A-G](?:#|b)?m?$/;

/**
 * Normalizes a value into the canonical track key representation used by `TrackInfo.key`.
 *
 * Trims whitespace, removes internal whitespace, and accepts lowercase note
 * letters, Unicode flat and sharp symbols, and common major/minor suffixes.
 * Note letters are converted to uppercase, flat and sharp symbols to `b` and
 * `#`, and major/minor suffixes to their canonical representation.
 *
 * Returns `undefined` when the input is empty or cannot be normalized into
 * a valid canonical track key.
 *
 * @param keyString - Value to normalize, for example `c major` or `G♯ minor`.
 * @returns Canonical normalized track key, or `undefined` when the input is invalid.
 *
 * @see {@link https://mutagen-specs.readthedocs.io/en/latest/id3/id3v2.2.html | Mutagen ID3 specification}
 * @see {@link https://docs.mp3tag.de/mapping/ | Mp3tag field mappings}
 */
export function normalizeTrackKey(keyString?: string): string | undefined {
  const normalizedKeyString = keyString?.trim();

  if (!normalizedKeyString) return undefined;

  const keyTag = normalizedKeyString
    .replaceAll(/♭\s*/g, 'b')
    .replaceAll(/♯\s*/g, '#')
    .replace(/maj(or)?$/i, '')
    .replace(/min(or)?$/i, 'm')
    .replaceAll(/\s+/g, '')
    .replace(/^[a-g]/, (note) => note.toUpperCase());

  return trackKeyPattern.test(keyTag) ? keyTag : undefined;
}
