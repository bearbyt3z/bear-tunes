import { z } from 'zod';

import {
  trackKeyPattern,
} from '#normalizer';

/**
 * Runtime validation schema for normalized `AlbumInfo` input.
 */
export const albumInfoSchema = z.looseObject({
  artists: z.array(z.string()).optional(),
  title: z.string(),
  catalogNumber: z.string().optional(),
  trackNumber: z.number().int().positive().optional(),
  trackTotal: z.number().int().positive().optional(),
  url: z.instanceof(URL).optional(),
  artwork: z.instanceof(URL).optional(),
});

/**
 * Runtime validation schema for normalized `PublisherInfo` input.
 */
export const publisherInfoSchema = z.looseObject({
  name: z.string(),
  url: z.instanceof(URL).optional(),
  logotype: z.instanceof(URL).optional(),
});

/**
 * Runtime validation schema for normalized `TrackDetails` input.
 */
export const trackDetailsSchema = z.looseObject({
  duration: z.number().positive(),
});

/**
 * Runtime validation schema for normalized `TrackInfo` input.
 */
export const trackInfoSchema = z.looseObject({
  url: z.instanceof(URL).optional(),
  artists: z.array(z.string()).optional(),
  title: z.string().optional(),
  remixers: z.array(z.string()).optional(),
  released: z.instanceof(Date).optional(),
  year: z.number().int().positive().optional(),
  genre: z.string().optional(),
  subgenre: z.string().optional(),
  bpm: z.number().positive().optional(),
  key: z.string().regex(trackKeyPattern, 'Invalid canonical track key format').optional(),
  isrc: z.string().optional(),
  ufid: z.string().optional(),
  waveform: z.instanceof(URL).optional(),

  album: albumInfoSchema.optional(),

  publisher: publisherInfoSchema.optional(),

  details: trackDetailsSchema.optional(),
});
