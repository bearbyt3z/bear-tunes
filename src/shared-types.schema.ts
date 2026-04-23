import { z } from 'zod';

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
  bpm: z.number().positive().optional(),
  key: z.string().optional(),
  isrc: z.string().optional(),
  ufid: z.string().optional(),
  waveform: z.instanceof(URL).optional(),

  album: z.looseObject({
    artists: z.array(z.string()).optional(),
    title: z.string().optional(),
    catalogNumber: z.string().optional(),
    trackNumber: z.number().int().positive().optional(),
    trackTotal: z.number().int().positive().optional(),
    url: z.instanceof(URL).optional(),
    artwork: z.instanceof(URL).optional(),
  }).optional(),

  publisher: z.looseObject({
    name: z.string(),
    url: z.instanceof(URL).optional(),
    logotype: z.instanceof(URL).optional(),
  }).optional(),

  details: z.looseObject({
    duration: z.number().positive(),
  }).optional(),
});
