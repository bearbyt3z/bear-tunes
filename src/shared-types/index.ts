/**
 * Public API for shared BearTunes types, schemas, guards, and normalization helpers.
 *
 * This module provides the canonical metadata types used across the application
 * (such as {@link TrackInfo}, {@link AlbumInfo}, and {@link PublisherInfo}),
 * together with Zod schemas for runtime validation, guards for checking basic
 * track identification data, and normalization functions that transform raw
 * or source-specific payloads into the canonical shapes.
 *
 * Re-exported members:
 * - Identification guards from `./guards.ts`
 * - Normalization helpers from `./normalizer.ts`
 * - Zod schemas from `./schema.ts`
 * - Canonical type definitions from `./types.ts`
 *
 * @module shared-types
 */

export {
  hasBasicTrackIdentificationData,
  getBasicTrackIdentificationStatus,
} from './guards.js';

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
  BasicTrackIdentificationStatus,
  PublisherInfo,
  TrackDetails,
  TrackInfo,
} from './types.js';
