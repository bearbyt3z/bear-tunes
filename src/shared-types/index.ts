/**
 * Public API for shared BearTunes types, schemas, and normalization helpers.
 *
 * This module provides the canonical metadata types used across the application
 * (such as {@link TrackInfo}, {@link AlbumInfo}, and {@link PublisherInfo}),
 * together with Zod schemas for runtime validation and normalization functions
 * that transform raw or source-specific payloads into the canonical shapes.
 *
 * Re-exported members:
 * - Normalization helpers from {@link ./normalizer}
 * - Zod schemas from {@link ./schema}
 * - Canonical type definitions from {@link ./types}
 *
 * @module shared-types
 */

export {
  normalizeAlbumInfo,
  normalizePublisherInfo,
  normalizeTrackDetails,
  normalizeTrackInfo,
} from './normalizer.js';

export {
  albumInfoSchema,
  publisherInfoSchema,
  trackDetailsSchema,
  trackInfoSchema,
} from './schema.js';

export type {
  AlbumInfo,
  PublisherInfo,
  TrackDetails,
  TrackInfo,
} from './types.js';
