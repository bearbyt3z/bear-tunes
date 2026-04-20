import {
  isObjectRecord,
  tryParsePositiveNumber,
  tryParseUrl,
} from '#tools';

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
  const duration = (
    typeof rawDuration === 'string' || typeof rawDuration === 'number'
  )
    ? tryParsePositiveNumber(rawDuration)
    : undefined;

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
 * Normalizes the nested `details` object.
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
    publisher: normalizePublisherInfo(trackInfo.publisher),
    details: normalizeTrackDetails(trackInfo.details),
  };
}
