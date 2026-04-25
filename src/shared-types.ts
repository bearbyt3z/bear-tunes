/**
 * Canonical internal representation of audio track metadata used across the application.
 *
 * `TrackInfo` is source-independent: regardless of whether metadata comes from Beatport API,
 * ID3 tags, FLAC tags, or another source, it must be normalized to this shared shape before use.
 *
 * Canonical rules:
 * - Plain string fields are trimmed; empty strings are treated as missing values.
 * - `title` uses the canonical title form produced by the shared title-normalization rules.
 * - Artist arrays contain normalized, non-empty, deduplicated artist names.
 * - `artists` must not include artists already present in the track title as featured artists
 *   (for example `feat.` / `ft.` in the title).
 * - `remixers` and `album.artists` are normalized artist arrays too, but they do not remove
 *   artists based on the track title.
 * - URL fields such as `url`, `waveform`, `album.url`, `album.artwork`, `publisher.url`,
 *   and `publisher.logotype` use `URL` instances in the canonical representation.
 * - `released` represents a release date value; when serialized outside runtime objects,
 *   it should be formatted as a date-only value.
 * - `year` and `released` may coexist and are not auto-corrected against each other.
 * - Numeric counters such as `album.trackNumber` and `album.trackTotal` are positive integers.
 * - `bpm` is a positive number.
 * - `key` uses the canonical key tag representation produced by `buildKeyTag()`.
 * - `publisher` is present only when it contains at least a valid normalized `name`.
 * - `details` is present only when it contains a valid positive `duration`.
 *
 * This type is intended to represent already-normalized metadata, not raw source payloads.
 */
export interface TrackInfo {
  url?: URL,
  artists?: string[],
  title?: string,
  remixers?: string[],
  released?: Date,
  year?: number,
  genre?: string,
  bpm?: number,
  key?: string,
  isrc?: string,
  ufid?: string,
  waveform?: URL,
  album?: AlbumInfo,
  publisher?: PublisherInfo,
  details?: TrackDetails,
}

/**
 * Canonical album metadata associated with {@link TrackInfo}.
 *
 * This type is source-independent and represents album data after normalization.
 *
 * Canonical rules:
 * - Plain string fields are trimmed; empty strings are treated as missing values.
 * - `artists` is a normalized artist array: non-empty, deduplicated, and cleaned.
 * - `trackNumber` and `trackTotal` are positive integers when present.
 * - `trackNumber` may be validated against `trackTotal`, but conflicting values are
 *   not auto-corrected during normalization.
 * - `url` and `artwork` are normalized `URL` values.
 */
export interface AlbumInfo {
  artists?: string[],
  title?: string,
  catalogNumber?: string,
  trackNumber?: number,
  trackTotal?: number,
  url?: URL,
  artwork?: URL,
}

/**
 * Canonical publisher / label metadata associated with {@link TrackInfo}.
 *
 * This type is source-independent and represents publisher data after normalization.
 *
 * Canonical rules:
 * - `name` is a required, non-empty normalized string.
 * - `url` and `logotype` are normalized `URL` values.
 * - The whole object is omitted from canonical `TrackInfo` when `name` cannot be normalized.
 */
export interface PublisherInfo {
  name: string,
  url?: URL,
  logotype?: URL,
}

/**
 * Canonical technical details associated with {@link TrackInfo}.
 *
 * This type is source-independent and represents normalized technical metadata for a track.
 *
 * Canonical rules:
 * - `duration` is a required positive number expressed in seconds and may be fractional.
 * - The whole object is omitted from canonical `TrackInfo` when `duration` cannot be normalized.
 */
export interface TrackDetails {
  duration: number,
}
