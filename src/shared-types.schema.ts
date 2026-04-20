import { z } from 'zod';

/**
 * Runtime validation schema for normalized `TrackInfo` input.
 */
export const trackInfoSchema = z.looseObject({
  details: z.looseObject({
    duration: z.number().positive(),
  }).optional(),
});
