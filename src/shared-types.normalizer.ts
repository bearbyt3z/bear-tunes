import {
  normalizeDate,
  normalizePositiveInteger,
  normalizePositiveNumber,
  normalizeString,
  normalizeStringArray,
  normalizeTrackArtists,
  normalizeTrackKey,
  normalizeTrackTitle,
  normalizeUrl,
} from '#normalizer';

import {
  isObjectRecord,
  removeUndefinedObjectFields,
} from '#tools';

import type {
  AlbumInfo,
  PublisherInfo,
  TrackDetails,
  TrackInfo,
} from '#shared-types';

/**
 * Normalizes a raw track key value into the canonical representation used by `TrackInfo.key`.
 *
 * Returns `undefined` when the input is invalid or when the key cannot be
 * converted into a valid canonical track key.
 *
 * @param value - Raw key value to normalize.
 * @returns Canonical normalized track key, or `undefined` when the input is invalid.
 */
function normalizeKey(value: unknown): string | undefined {
  const normalizedString = normalizeString(value);

  if (!normalizedString) {
    return undefined;
  }

  return normalizeTrackKey(normalizedString);
}

/**
 * Normalizes a raw track title value.
 *
 * Trims the input string, applies the shared title-normalization rules from
 * `normalizeTrackTitle()`, and returns `undefined` when the input is invalid
 * or the normalized title is empty.
 *
 * @param value - Raw title value to normalize.
 * @returns Canonical normalized title, or `undefined` when the input is invalid.
 */
function normalizeTitle(value: unknown): string | undefined {
  const normalizedString = normalizeString(value);

  if (!normalizedString) {
    return undefined;
  }

  const normalizedTitle = normalizeTrackTitle(normalizedString);

  return normalizedTitle || undefined;
}

/**
 * Normalizes a raw artist array value.
 *
 * Accepts either a comma-separated string or an array of strings, converts the
 * input into an array form, applies generic string-array normalization, and
 * then applies track-artist normalization rules.
 *
 * When `title` is provided, artists already mentioned in the featured-artist
 * part of the title may be excluded from the returned array.
 *
 * @param value - Raw artist array value to normalize.
 * @param title - Optional track title used to filter featured artists.
 * @returns Array of normalized artist names, or `undefined` when the input is invalid.
 */
function normalizeArtistArray(value: unknown, title?: string): string[] | undefined {
  const rawArtistArray = (typeof value === 'string') ? value.split(',') : value;

  const normalizedStringArray = normalizeStringArray(rawArtistArray);

  if (!normalizedStringArray) {
    return undefined;
  }

  const normalizedArtistArray = normalizeTrackArtists(normalizedStringArray, title);

  return normalizedArtistArray.length > 0 ? normalizedArtistArray : undefined;
}

/**
 * Normalizes raw genre and subgenre values into canonical `genre` and `subgenre` fields.
 *
 * The canonical model requires a valid main `genre` before `subgenre` can be kept.
 * When `genre` contains the `|` separator used by genre tag builders, that split
 * takes precedence over the standalone `subgenre` input.
 *
 * @param genreValue - Raw genre value to normalize.
 * @param subgenreValue - Raw subgenre value to normalize.
 * @returns Object containing normalized `genre` and optional `subgenre`.
 */
function normalizeGenreInfo(
  genreValue: unknown,
  subgenreValue: unknown,
): { genre?: string, subgenre?: string } {
  const normalizedGenreValue = normalizeString(genreValue);

  if (!normalizedGenreValue) {
    return {};
  }

  if (normalizedGenreValue.includes('|')) {
    const [rawGenre, ...rawSubgenreParts] = normalizedGenreValue.split('|');

    const genre = normalizeString(rawGenre);
    const subgenre = normalizeString(rawSubgenreParts.join('|'));

    return genre ? { genre, subgenre } : {};
  }

  const normalizedSubgenreValue = normalizeString(subgenreValue);

  return {
    genre: normalizedGenreValue,
    subgenre: normalizedSubgenreValue,
  };
}

/**
 * Normalizes the `TrackInfo.album` object.
 *
 * Requires a valid normalized `title`; when `title` cannot be normalized,
 * the whole album object is omitted.
 *
 * Parses `trackNumber` and `trackTotal` into positive integers, and `url` and
 * `artwork` into `URL` instances.
 *
 * Invalid raw values for normalized optional fields are removed from the
 * returned object.
 *
 * @param album - Raw `album` value to normalize.
 * @returns The normalized `album` object, or `undefined` when the input is
 * invalid or when `title` cannot be normalized.
 */
export function normalizeAlbumInfo(album: unknown): AlbumInfo | undefined {
  if (!isObjectRecord(album)) {
    return undefined;
  }

  const title = normalizeString(album.title);
  if (!title) {
    return undefined;
  }

  return removeUndefinedObjectFields<AlbumInfo>({
    title,
    artists: normalizeArtistArray(album.artists),
    catalogNumber: normalizeString(album.catalogNumber),
    trackNumber: normalizePositiveInteger(album.trackNumber),
    trackTotal: normalizePositiveInteger(album.trackTotal),
    url: normalizeUrl(album.url),
    artwork: normalizeUrl(album.artwork),
  });
}

/**
 * Normalizes the `TrackInfo.publisher` object.
 *
 * Requires a valid normalized `name`; when `name` cannot be normalized,
 * the whole publisher object is omitted.
 *
 * Parses `url` and `logotype` fields from string values into `URL` instances.
 *
 * Invalid raw values for normalized optional fields are removed from the
 * returned object.
 *
 * @param publisher - Raw `publisher` value to normalize.
 * @returns The normalized `publisher` object, or `undefined` when the input is
 * invalid or when `name` cannot be normalized.
 */
export function normalizePublisherInfo(publisher: unknown): PublisherInfo | undefined {
  if (!isObjectRecord(publisher)) {
    return undefined;
  }

  const name = normalizeString(publisher.name);
  if (!name) {
    return undefined;
  }

  return removeUndefinedObjectFields<PublisherInfo>({
    name,
    url: normalizeUrl(publisher.url),
    logotype: normalizeUrl(publisher.logotype),
  });
}

/**
 * Normalizes the `TrackInfo.details` object.
 *
 * Requires a valid positive normalized `duration`; when `duration` cannot be
 * normalized, the whole details object is omitted.
 *
 * Converts the `duration` field from a positive numeric string or number into a
 * positive number.
 *
 * @param details - Raw `details` value to normalize.
 * @returns The normalized `details` object, or `undefined` when the input is
 * invalid or when `duration` cannot be normalized.
 */
export function normalizeTrackDetails(details: unknown): TrackDetails | undefined {
  if (!isObjectRecord(details)) {
    return undefined;
  }

  const duration = normalizePositiveNumber(details.duration);
  if (duration === undefined) {
    return undefined;
  }

  return {
    duration,
  };
}

/**
 * Normalizes a raw `TrackInfo`-like input before schema validation.
 *
 * Normalizes all top-level fields in interface order plus nested `album`,
 * `publisher`, and `details` objects.
 *
 * Invalid or unnormalized fields are removed from the returned object.
 *
 * @param trackInfo - Raw track info value to normalize.
 * @returns A normalized `TrackInfo` object, or `undefined` when the input is invalid.
 */
export function normalizeTrackInfo(trackInfo: unknown): TrackInfo | undefined {
  if (!isObjectRecord(trackInfo)) {
    return undefined;
  }

  const title = normalizeTitle(trackInfo.title);
  const genreInfo = normalizeGenreInfo(trackInfo.genre, trackInfo.subgenre);

  return removeUndefinedObjectFields({
    url: normalizeUrl(trackInfo.url),
    artists: normalizeArtistArray(trackInfo.artists, title),
    title,
    remixers: normalizeArtistArray(trackInfo.remixers),
    released: normalizeDate(trackInfo.released),
    year: normalizePositiveInteger(trackInfo.year),
    genre: genreInfo.genre,
    subgenre: genreInfo.subgenre,
    bpm: normalizePositiveNumber(trackInfo.bpm),
    key: normalizeKey(trackInfo.key),
    isrc: normalizeString(trackInfo.isrc),
    ufid: normalizeString(trackInfo.ufid),
    waveform: normalizeUrl(trackInfo.waveform),

    album: normalizeAlbumInfo(trackInfo.album),
    publisher: normalizePublisherInfo(trackInfo.publisher),
    details: normalizeTrackDetails(trackInfo.details),
  });
}
