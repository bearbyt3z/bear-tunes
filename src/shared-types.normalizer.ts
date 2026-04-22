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
 */
function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalizes top-level TrackInfo URL fields.
 */
function normalizeTopLevelUrls(trackInfo: Record<string, unknown>): void {
  setOrDeleteNormalizedField(trackInfo, 'url', normalizeUrl(trackInfo.url));
  setOrDeleteNormalizedField(trackInfo, 'waveform', normalizeUrl(trackInfo.waveform));
}

/**
 * Normalizes a raw string array value.
 *
 * Trims each string element and filters out empty strings. Returns `undefined`
 * when the input is not an array or the normalized array is empty.
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
 * Normalizes top-level TrackInfo string fields.
 */
function normalizeTopLevelStrings(trackInfo: Record<string, unknown>): void {
  setOrDeleteNormalizedField(trackInfo, 'title', normalizeString(trackInfo.title));
  setOrDeleteNormalizedField(trackInfo, 'genre', normalizeString(trackInfo.genre));
  setOrDeleteNormalizedField(trackInfo, 'key', normalizeString(trackInfo.key));
  setOrDeleteNormalizedField(trackInfo, 'isrc', normalizeString(trackInfo.isrc));
  setOrDeleteNormalizedField(trackInfo, 'ufid', normalizeString(trackInfo.ufid));

  setOrDeleteNormalizedField(trackInfo, 'artists', normalizeStringArray(trackInfo.artists));
  setOrDeleteNormalizedField(trackInfo, 'remixers', normalizeStringArray(trackInfo.remixers));
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
 * Normalizes the `TrackInfo.album` object.
 *
 * Parses `trackNumber` and `trackTotal` into positive integers, and `url` and
 * `artwork` into `URL` instances.
 *
 * Invalid raw values for normalized optional fields are removed from the
 * returned object.
 *
 * @param album - Raw `album` value to normalize.
 * @returns The normalized `album` object, or the original input when it cannot be normalized.
 */
function normalizeAlbumInfo(album: unknown): unknown {
  if (!isObjectRecord(album)) {
    return album;
  }

  const normalizedAlbum: Record<string, unknown> = { ...album };

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
 * @returns The normalized `publisher` object, or the original input when it cannot be normalized.
 */
function normalizePublisherInfo(publisher: unknown): unknown {
  if (!isObjectRecord(publisher)) {
    return publisher;
  }

  const name = publisher.name;

  if (typeof name !== 'string') {
    return publisher;
  }

  const normalizedPublisher: Record<string, unknown> = {
    ...publisher,
    name,
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
 * @returns The normalized `details` object, or the original input when it cannot be normalized.
 */
function normalizeTrackDetails(details: unknown): unknown {
  if (!isObjectRecord(details)) {
    return details;
  }

  const duration = normalizePositiveNumber(details.duration);
  if (duration === undefined) {
    return details;
  }

  return {
    ...details,
    duration,
  };
}

/**
 * Normalizes a raw `TrackInfo`-like input before schema validation.
 *
 * Normalizes the nested `album`, `publisher`, and `details` objects.
 *
 * Nested fields whose normalized value is `undefined` are removed from the
 * returned object.
 *
 * @param trackInfo - Raw track info value to normalize.
 * @returns A normalized track info value, or the original input when it cannot be normalized.
 */
export function normalizeTrackInfo(trackInfo: unknown): unknown {
  if (!isObjectRecord(trackInfo)) {
    return trackInfo;
  }

  const normalizedTrackInfo: Record<string, unknown> = { ...trackInfo };

  normalizeTopLevelStrings(normalizedTrackInfo);
  normalizeTopLevelUrls(normalizedTrackInfo);

  setOrDeleteNormalizedField(normalizedTrackInfo, 'album', normalizeAlbumInfo(trackInfo.album));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'publisher', normalizePublisherInfo(trackInfo.publisher));
  setOrDeleteNormalizedField(normalizedTrackInfo, 'details', normalizeTrackDetails(trackInfo.details));

  return normalizedTrackInfo;
}
