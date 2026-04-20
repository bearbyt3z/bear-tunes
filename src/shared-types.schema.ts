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
});
