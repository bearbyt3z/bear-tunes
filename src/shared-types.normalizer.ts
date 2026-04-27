import {
  normalizeDate,
  normalizePositiveInteger,
  normalizePositiveNumber,
  normalizeString,
  normalizeStringArray,
  normalizeTrackArtists,
  normalizeTrackTitle,
  normalizeUrl,
} from '#normalizer';

import {
  buildKeyTag,
  isObjectRecord,
  setOrDeleteObjectField,
} from '#tools';

/**
 * Normalizes a raw musical key value.
 *
 * Trims the input string and converts it into the canonical key tag
 * representation used by `TrackInfo.key`.
 *
 * Returns `undefined` when the input is invalid or when the key cannot be
 * converted into a canonical key tag.
 *
 * @param value - Raw key value to normalize.
 * @returns Canonical key tag string, or `undefined` when the input is invalid.
 */
function normalizeKey(value: unknown): string | undefined {
  const normalizedString = normalizeString(value);

  if (!normalizedString) {
    return undefined;
  }

  try {
    return buildKeyTag(normalizedString);
  } catch {
    return undefined;
  }
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
 * then delegates artist-specific normalization to `buildArtistArray()`.
 *
 * When `title` is provided, artists already mentioned in the featured-artist
 * part of the title may be excluded from the returned array.
 *
 * @param value - Raw artist array value to normalize.
 * @param title - Optional normalized track title used to filter featured artists.
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
 * Parses `trackNumber` and `trackTotal` into positive integers, and `url` and
 * `artwork` into `URL` instances.
 *
 * Invalid raw values for normalized optional fields are removed from the
 * returned object.
 *
 * @param album - Raw `album` value to normalize.
 * @returns The normalized `album` object, or `undefined` when the input is invalid or cannot be normalized.
 */
function normalizeAlbumInfo(album: unknown): unknown {
  if (!isObjectRecord(album)) {
    return undefined;
  }

  const normalizedAlbum: Record<string, unknown> = { ...album };

  setOrDeleteObjectField(normalizedAlbum, 'artists', normalizeArtistArray(album.artists));
  setOrDeleteObjectField(normalizedAlbum, 'title', normalizeString(album.title));
  setOrDeleteObjectField(normalizedAlbum, 'catalogNumber', normalizeString(album.catalogNumber));

  setOrDeleteObjectField(normalizedAlbum, 'trackNumber', normalizePositiveInteger(album.trackNumber));
  setOrDeleteObjectField(normalizedAlbum, 'trackTotal', normalizePositiveInteger(album.trackTotal));

  setOrDeleteObjectField(normalizedAlbum, 'url', normalizeUrl(album.url));
  setOrDeleteObjectField(normalizedAlbum, 'artwork', normalizeUrl(album.artwork));

  return normalizedAlbum;
}

/**
 * Normalizes the `TrackInfo.publisher` object.
 *
 * Parses `url` and `logotype` fields from string values into `URL` instances.
 *
 * Invalid raw values for normalized optional fields are removed from the
 * returned object.
 *
 * @param publisher - Raw `publisher` value to normalize.
 * @returns The normalized `publisher` object, or `undefined` when the input is invalid or cannot be normalized.
 */
function normalizePublisherInfo(publisher: unknown): unknown {
  if (!isObjectRecord(publisher)) {
    return undefined;
  }

  const normalizedName = normalizeString(publisher.name);

  if (!normalizedName) {
    return undefined;
  }

  const normalizedPublisher: Record<string, unknown> = {
    ...publisher,
    name: normalizedName,
  };

  setOrDeleteObjectField(normalizedPublisher, 'url', normalizeUrl(publisher.url));
  setOrDeleteObjectField(normalizedPublisher, 'logotype', normalizeUrl(publisher.logotype));

  return normalizedPublisher;
}

/**
 * Normalizes the `TrackInfo.details` object.
 *
 * Converts the `duration` field from a positive numeric string or number into a
 * positive number.
 *
 * @param details - Raw `details` value to normalize.
 * @returns The normalized `details` object, or `undefined` when the input is invalid or cannot be normalized.
 */
function normalizeTrackDetails(details: unknown): unknown {
  if (!isObjectRecord(details)) {
    return undefined;
  }

  const duration = normalizePositiveNumber(details.duration);
  if (duration === undefined) {
    return undefined;
  }

  return {
    ...details,
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
 * @returns A normalized track info value, or the original input when it cannot be normalized.
 */
export function normalizeTrackInfo(trackInfo: unknown): unknown {
  if (!isObjectRecord(trackInfo)) {
    return trackInfo;
  }

  const normalizedTrackInfo: Record<string, unknown> = { ...trackInfo };

  const normalizedTitle = normalizeTitle(trackInfo.title);

  setOrDeleteObjectField(normalizedTrackInfo, 'url', normalizeUrl(trackInfo.url));
  setOrDeleteObjectField(normalizedTrackInfo, 'artists', normalizeArtistArray(trackInfo.artists, normalizedTitle));
  setOrDeleteObjectField(normalizedTrackInfo, 'title', normalizedTitle);
  setOrDeleteObjectField(normalizedTrackInfo, 'remixers', normalizeArtistArray(trackInfo.remixers));
  setOrDeleteObjectField(normalizedTrackInfo, 'released', normalizeDate(trackInfo.released));
  setOrDeleteObjectField(normalizedTrackInfo, 'year', normalizePositiveInteger(trackInfo.year));

  const normalizedGenreInfo = normalizeGenreInfo(trackInfo.genre, trackInfo.subgenre);

  setOrDeleteObjectField(normalizedTrackInfo, 'genre', normalizedGenreInfo.genre);
  setOrDeleteObjectField(normalizedTrackInfo, 'subgenre', normalizedGenreInfo.subgenre);

  setOrDeleteObjectField(normalizedTrackInfo, 'bpm', normalizePositiveNumber(trackInfo.bpm));
  setOrDeleteObjectField(normalizedTrackInfo, 'key', normalizeKey(trackInfo.key));
  setOrDeleteObjectField(normalizedTrackInfo, 'isrc', normalizeString(trackInfo.isrc));
  setOrDeleteObjectField(normalizedTrackInfo, 'ufid', normalizeString(trackInfo.ufid));
  setOrDeleteObjectField(normalizedTrackInfo, 'waveform', normalizeUrl(trackInfo.waveform));

  setOrDeleteObjectField(normalizedTrackInfo, 'album', normalizeAlbumInfo(trackInfo.album));
  setOrDeleteObjectField(normalizedTrackInfo, 'publisher', normalizePublisherInfo(trackInfo.publisher));
  setOrDeleteObjectField(normalizedTrackInfo, 'details', normalizeTrackDetails(trackInfo.details));

  return normalizedTrackInfo;
}
