import {
  isObjectRecord,
  tryParsePositiveInteger,
  tryParsePositiveNumber,
  tryParseUrl,
} from '#tools';

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
 * @param album - Raw `album` value to normalize.
 * @returns The normalized `album` object, or the original input when it cannot be normalized.
 */
function normalizeAlbumInfo(album: unknown): unknown {
  if (!isObjectRecord(album)) {
    return album;
  }

  const rawTrackNumber = album.trackNumber;
  const trackNumber = normalizePositiveInteger(rawTrackNumber);

  const rawTrackTotal = album.trackTotal;
  const trackTotal = normalizePositiveInteger(rawTrackTotal);

  const url = normalizeUrl(album.url);
  const artwork = normalizeUrl(album.artwork);

  return {
    ...album,
    trackNumber,
    trackTotal,
    url,
    artwork,
  };
}

/**
 * Normalizes the `TrackInfo.publisher` object.
 *
 * Parses `url` and `logotype` fields from string values into `URL` instances.
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

  const url = normalizeUrl(publisher.url);
  const logotype = normalizeUrl(publisher.logotype);

  return {
    ...publisher,
    name,
    url,
    logotype,
  };
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

  const rawDuration = details.duration;
  const duration = normalizePositiveNumber(rawDuration);

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
 * @param trackInfo - Raw track info value to normalize.
 * @returns A normalized track info value, or the original input when it cannot be normalized.
 */
export function normalizeTrackInfo(trackInfo: unknown): unknown {
  if (!isObjectRecord(trackInfo)) {
    return trackInfo;
  }

  return {
    ...trackInfo,
    album: normalizeAlbumInfo(trackInfo.album),
    publisher: normalizePublisherInfo(trackInfo.publisher),
    details: normalizeTrackDetails(trackInfo.details),
  };
}
