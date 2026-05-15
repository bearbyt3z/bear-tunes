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
  bpm: z.number().optional(),
  catalog_number: z.string().optional(),
  isrc: z.string().optional(),
  key_id: z.number().optional(),
  key_name: z.string().optional(),
  label: beatportSearchResultLabelInfoSchema,
  length: z.number(),
  mix_name: z.string(),
  release: beatportSearchResultReleaseInfoSchema,
  release_date: z.string(),
  track_id: z.number(),
  track_name: z.string(),
  track_number: z.number(),
  track_image_uri: z.string().optional(),
  genre: z.array(beatportSearchResultGenreInfoSchema),
});

/**
 * Runtime validation schema for raw `BeatportSearchResultTrackInfo[]` input.
 */
export const beatportSearchResultTrackInfoArraySchema = z.array(
  beatportSearchResultTrackInfoSchema,
);

/**
 * Runtime validation schema for raw `BeatportArtistInfo` input.
 */
export const beatportArtistInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportGenreInfo` input.
 */
export const beatportGenreInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportSubGenreInfo` input.
 */
export const beatportSubGenreInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportImageInfo` input.
 */
export const beatportImageInfoSchema = z.object({
  id: z.number(),
  uri: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportLabelInfo` input.
 */
export const beatportLabelInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  image: beatportImageInfoSchema,
  slug: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportKeyInfo` input.
 */
export const beatportKeyInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportReleaseInfo` input.
 */
export const beatportReleaseInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  image: beatportImageInfoSchema,
  label: beatportLabelInfoSchema,
  slug: z.string(),
});

/**
 * Runtime validation schema for raw `BeatportTrackInfo` input.
 */
export const beatportTrackInfoSchema = z.object({
  artists: z.array(beatportArtistInfoSchema),
  bpm: z.number().optional(),
  catalog_number: z.string().optional(),
  genre: beatportGenreInfoSchema,
  id: z.number(),
  image: beatportImageInfoSchema,
  isrc: z.string().optional(),
  key: beatportKeyInfoSchema,
  length: z.string(),
  length_ms: z.number(),
  mix_name: z.string(),
  name: z.string(),
  new_release_date: z.string(),
  number: z.number(),
  release: beatportReleaseInfoSchema,
  remixers: z.array(beatportArtistInfoSchema),
  slug: z.string(),
  sub_genre: beatportSubGenreInfoSchema.nullable(),
});

/**
 * Runtime validation schema for raw `BeatportAlbumInfo` input.
 */
export const beatportAlbumInfoSchema = z.object({
  artists: z.array(beatportArtistInfoSchema),
  bpm_range: z.object({
    min: z.number(),
    max: z.number(),
  }),
  catalog_number: z.string().optional(),
  id: z.number(),
  image: beatportImageInfoSchema,
  label: beatportLabelInfoSchema,
  name: z.string(),
  new_release_date: z.string(),
  remixers: z.array(beatportArtistInfoSchema),
  slug: z.string(),
  tracks: z.array(z.string()),
  track_count: z.number(),
});

/**
 * Runtime validation schema for raw `BeatportPublisherInfo` input.
 */
export const beatportPublisherInfoSchema = z.object({
  id: z.number(),
  image: beatportImageInfoSchema,
  name: z.string(),
  slug: z.string(),
});
