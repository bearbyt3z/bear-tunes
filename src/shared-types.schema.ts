import { z } from 'zod';

/**
 * Runtime validation schema for normalized `TrackInfo` input.
 */
export const trackInfoSchema = z.looseObject({
  details: z.looseObject({
    duration: z.number().positive(),
  }).optional(),
  publisher: z.looseObject({
    name: z.string(),
    url: z.instanceof(URL).optional(),
    logotype: z.instanceof(URL).optional(),
  }).optional(),
  album: z.looseObject({
    artists: z.array(z.string()).optional(),
    title: z.string().optional(),
    catalogNumber: z.string().optional(),
    trackNumber: z.number().int().positive().optional(),
    trackTotal: z.number().int().positive().optional(),
    url: z.instanceof(URL).optional(),
    artwork: z.instanceof(URL).optional(),
  }).optional(),
});
