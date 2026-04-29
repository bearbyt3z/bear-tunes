/**
 * Canonical track key format used by `TrackInfo.key`.
 *
 * Accepts a note letter from `A` to `G`, an optional flat/sharp accidental,
 * and an optional `m` suffix for minor keys.
 */
export const trackKeyPattern = /^[A-G](?:#|b)?m?$/;

/**
 * Normalizes a raw track key value into the canonical representation used by `TrackInfo.key`.
 *
 * The returned value uses a compact key notation without whitespace, for example
 * `C`, `G#m`, `Bb`, or `Cbm`. Flat and sharp symbols are normalized to `b`
 * and `#`, and major/minor suffixes are converted to the canonical form.
 *
 * Returns `undefined` when no key value is provided or when the input cannot be
 * converted into a valid canonical track key.
 *
 * @param keyString - Raw track key value to normalize, for example `C Major`.
 * @returns Canonical normalized track key, or `undefined` when the input is
 * missing or invalid.
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
    .replace(/maj(or)?/i, '')
    .replace(/min(or)?/i, 'm')
    .replaceAll(/\s+/g, '');

  return trackKeyPattern.test(keyTag) ? keyTag : undefined;
}
