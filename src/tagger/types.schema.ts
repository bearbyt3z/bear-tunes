import { z } from 'zod';

import {
  BeatportSearchResultArtistType,
} from './types.js';

/**
 * Runtime validation schema for raw `BeatportSearchResultArtistType` input.
 */
export const beatportSearchResultArtistTypeSchema = z.enum(BeatportSearchResultArtistType);

/**
 * Runtime validation schema for raw `BeatportSearchResultArtistInfo` input.
 */
export const beatportSearchResultArtistInfoSchema = z.object({
  artist_id: z.number(),
  artist_name: z.string(),
  artist_type_name: beatportSearchResultArtistTypeSchema,
});

/**
 * Runtime validation schema for raw `BeatportSearchResultLabelInfo` input.
 */
export const beatportSearchResultLabelInfoSchema = z.object({
  label_id: z.number(),
  label_name: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportSearchResultReleaseInfo` input.
 */
export const beatportSearchResultReleaseInfoSchema = z.object({
  release_id: z.number(),
  release_name: z.string(),
  release_image_url: z.string().optional(),
});

/**
 * Runtime validation schema for raw `BeatportSearchResultGenreInfo` input.
 */
export const beatportSearchResultGenreInfoSchema = z.object({
  genre_id: z.number(),
  genre_name: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportSearchResultTrackInfo` input.
 */
export const beatportSearchResultTrackInfoSchema = z.object({
  score: z.number(),
  artists: z.array(beatportSearchResultArtistInfoSchema),
  bpm: z.number(),
  catalog_number: z.string(),
  isrc: z.string(),
  key_id: z.number(),
  key_name: z.string(),
  label: beatportSearchResultLabelInfoSchema,
  length: z.number(),
  mix_name: z.string(),
  release: beatportSearchResultReleaseInfoSchema,
  release_date: z.string(),
  track_id: z.number(),
  track_name: z.string(),
  track_number: z.number(),
  track_image_uri: z.string(),
  genre: z.array(beatportSearchResultGenreInfoSchema),
});

/**
 * Runtime validation schema for raw `BeatportSearchResultTrackInfo[]` input.
 */
export const beatportSearchResultTrackInfoArraySchema = z.array(
  beatportSearchResultTrackInfoSchema,
);
