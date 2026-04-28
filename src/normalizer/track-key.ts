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
  if (!keyString) return undefined;

  const keyTag = keyString.trim()
    .replaceAll(/♭\s*/g, 'b')
    .replaceAll(/♯\s*/g, '#')
    .replace(/maj(or)?/i, '')
    .replace(/min(or)?/i, 'm')
    .replaceAll(/\s+/g, ''); // key signatures do not contain whitespace, e.g. Cbm, G#m, B#, B

  return keyTag.length <= 3 ? keyTag : undefined;
}
