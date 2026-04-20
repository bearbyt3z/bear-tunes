import {
  isObjectRecord,
  tryParsePositiveNumber,
} from '#tools';

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
    details: normalizeTrackDetails(trackInfo.details),
  };
}
