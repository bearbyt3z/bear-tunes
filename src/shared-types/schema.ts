import { z } from 'zod';

import {
  trackKeyPattern,
} from '#normalizer';

/**
 * Validates a non-empty string without leading or trailing whitespace.
 *
 * Rejects empty strings and strings that have not been trimmed.
 * Validates the input without modifying or transforming it.
 */
const nonEmptyTrimmedStringSchema = z
  .string()
  .min(1, 'Expected a non-empty string')
  .refine((value) => value.trim() === value, {
    message: 'String must not contain leading or trailing whitespace',
  });

/**
 * Validates a non-empty array of trimmed, non-empty, unique artist names.
 *
 * Duplicate matching is case-insensitive. The schema validates the input
 * without transforming or reordering array entries.
 */
const nonEmptyUniqueArtistArraySchema = z
  .array(nonEmptyTrimmedStringSchema)
  .min(1, 'Expected at least one artist')
  .refine(
    (artists) => new Set(artists.map((artist) => artist.toLowerCase())).size === artists.length,
    { message: 'Artist names must be unique, ignoring case' },
  );

/**
 * Runtime validation schema for normalized `AlbumInfo` input.
 */
export const albumInfoSchema = z.strictObject({
  artists: nonEmptyUniqueArtistArraySchema.optional(),
  title: nonEmptyTrimmedStringSchema,
  catalogNumber: nonEmptyTrimmedStringSchema.optional(),
  trackNumber: z.number().int().positive().optional(),
  trackTotal: z.number().int().positive().optional(),
  url: z.instanceof(URL).optional(),
  artwork: z.instanceof(URL).optional(),
});

/**
 * Runtime validation schema for normalized `PublisherInfo` input.
 */
export const publisherInfoSchema = z.strictObject({
  name: nonEmptyTrimmedStringSchema,
  url: z.instanceof(URL).optional(),
  logotype: z.instanceof(URL).optional(),
});

/**
 * Runtime validation schema for normalized `TrackDetails` input.
 */
export const trackDetailsSchema = z.strictObject({
  duration: z.number().positive(),
});

/**
 * Runtime validation schema for normalized `TrackInfo` input.
 */
export const trackInfoSchema = z.strictObject({
  url: z.instanceof(URL).optional(),
  artists: nonEmptyUniqueArtistArraySchema.optional(),
  title: nonEmptyTrimmedStringSchema.optional(),
  remixers: nonEmptyUniqueArtistArraySchema.optional(),
  released: z.date().optional(),
  year: z.number().int().positive().optional(),
  genre: nonEmptyTrimmedStringSchema.optional(),
  subgenre: nonEmptyTrimmedStringSchema.optional(),
  bpm: z.number().positive().optional(),
  key: z.string().regex(trackKeyPattern, 'Invalid canonical track key format').optional(),
  isrc: nonEmptyTrimmedStringSchema.optional(),
  ufid: nonEmptyTrimmedStringSchema.optional(),
  waveform: z.instanceof(URL).optional(),

  album: albumInfoSchema.optional(),
  publisher: publisherInfoSchema.optional(),
  details: trackDetailsSchema.optional(),
});
