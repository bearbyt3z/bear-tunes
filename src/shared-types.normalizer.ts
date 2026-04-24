import {
  isObjectRecord,
  tryParsePositiveInteger,
  tryParsePositiveNumber,
  tryParseUrl,
} from '#tools';

/**
 * Sets a normalized field value on an object or removes the field when the
 * normalized value is `undefined`.
 *
 * This helper is intended for object copies used during normalization, where
 * invalid raw values should be dropped instead of preserved.
 *
 * @param obj - Object copy being normalized.
 * @param key - Field name to update.
 * @param value - Normalized field value.
 */
function setOrDeleteNormalizedField(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    delete obj[key];
    return;
  }

  obj[key] = value;
}

/**
 * Normalizes a raw string value.
 *
 * Trims whitespace and returns `undefined` for empty strings after trimming.
 *
 * @param value - Raw value to normalize.
 * @returns Trimmed string, or `undefined` when the input is invalid.
 */
function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalizes a raw string array value.
 *
 * Trims each string element and filters out empty strings. Returns `undefined`
 * when the input is not an array or the normalized array is empty.
 *
 * @param value - Raw value to normalize.
 * @returns Array of trimmed strings, or `undefined` when the input is invalid.
 */
function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map(normalizeString)
    .filter((item): item is string => item !== undefined);

    return normalized.length > 0 ? normalized : undefined;
}

/**
 * Normalizes a raw positive numeric value.
 *
 * Parses a string or number into a positive number and returns `undefined`
 * when the input is not a string, not a number, or cannot be parsed as a
 * positive finite number.
 *
 * @param value - Raw value to normalize.
 * @returns Parsed positive number, or `undefined` when the input is invalid.
 */
function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  return tryParsePositiveNumber(value);
}

/**
 * Normalizes a raw positive integer value.
 *
 * Parses a string or number into a positive integer and returns `undefined`
 * when the input is not a string, not a number, or cannot be parsed as a
 * positive finite integer.
 *
 * @param value - Raw value to normalize.
 * @returns Parsed positive integer, or `undefined` when the input is invalid.
 */
function normalizePositiveInteger(value: unknown): number | undefined {
  const numberResult = normalizePositiveNumber(value);
  return tryParsePositiveInteger(numberResult);
}

/**
 * Normalizes a raw URL value into a parsed URL instance.
 *
 * @param value - Raw URL value to normalize.
 * @returns Parsed URL instance, or `undefined` when the input is invalid.
 */
function normalizeUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return tryParseUrl(value);
}

/**
 * Normalizes a raw date value.
 *
 * Parses a string into a valid `Date` instance, or returns an existing valid
 * `Date` instance unchanged. Returns `undefined` when the input is not a
 * string, not a `Date`, or cannot be parsed into a valid date.
 *
 * @param value - Raw value to normalize.
 * @returns Parsed `Date` instance, or `undefined` when the input is invalid.
 */
function normalizeDate(value: unknown): Date | undefined {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } else if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  return undefined;
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

  setOrDeleteNormalizedField(normalizedAlbum, 'artists', normalizeStringArray(album.artists));
  setOrDeleteNormalizedField(normalizedAlbum, 'title', normalizeString(album.title));
  setOrDeleteNormalizedField(normalizedAlbum, 'catalogNumber', normalizeString(album.catalogNumber));

  setOrDeleteNormalizedField(normalizedAlbum, 'trackNumber', normalizePositiveInteger(album.trackNumber));
  setOrDeleteNormalizedField(normalizedAlbum, 'trackTotal', normalizePositiveInteger(album.trackTotal));

  setOrDeleteNormalizedField(normalizedAlbum, 'url', normalizeUrl(album.url));
  setOrDeleteNormalizedField(normalizedAlbum, 'artwork', normalizeUrl(album.artwork));

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

  setOrDeleteNormalizedField(normalizedPublisher, 'url', normalizeUrl(publisher.url));
  setOrDeleteNormalizedField(normalizedPublisher, 'logotype', normalizeUrl(publisher.logotype));

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

  setOrDeleteNormalizedField(normalizedTrackInfo, 'url', normalizeUrl(trackInfo.url));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'artists', normalizeStringArray(trackInfo.artists));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'title', normalizeString(trackInfo.title));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'remixers', normalizeStringArray(trackInfo.remixers));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'released', normalizeDate(trackInfo.released));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'year', normalizePositiveInteger(trackInfo.year));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'genre', normalizeString(trackInfo.genre));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'bpm', normalizePositiveNumber(trackInfo.bpm));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'key', normalizeString(trackInfo.key));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'isrc', normalizeString(trackInfo.isrc));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'ufid', normalizeString(trackInfo.ufid));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'waveform', normalizeUrl(trackInfo.waveform));

  setOrDeleteNormalizedField(normalizedTrackInfo, 'album', normalizeAlbumInfo(trackInfo.album));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'publisher', normalizePublisherInfo(trackInfo.publisher));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'details', normalizeTrackDetails(trackInfo.details));

  return normalizedTrackInfo;
}
