import { z } from 'zod';

import { BrowserUserAgentSource } from './request-identity.types.js';

/**
 * Validates a non-negative integer timestamp in milliseconds since the Unix epoch.
 */
const timestampMsSchema = z.number().int().nonnegative();

/**
 * Validates the common fields shared by persisted request identity cache entries.
 *
 * Requires a non-empty User-Agent and non-negative integer timestamps in
 * milliseconds since the Unix epoch.
 */
export const fingerprintCacheEntrySchema = z.object({
  userAgent: z.string().min(1),
  createdAt: timestampMsSchema,
  expiresAt: timestampMsSchema,
});

/**
 * Validates a persisted cache entry used for non-browser fetch identity data.
 */
export const fetchIdentityCacheSchema = fingerprintCacheEntrySchema.extend({
  profileName: z.string().min(1),
});

/**
 * Validates a persisted cache entry used for browser navigator identity data.
 */
export const browserIdentityCacheSchema = fingerprintCacheEntrySchema.extend({
  source: z.enum(BrowserUserAgentSource),
  platform: z.string(),
  language: z.string(),
  vendor: z.string(),
});

/**
 * Validates the persisted container holding cached request identities by transport type.
 */
export const identityCacheSchema = z.object({
  fetch: fetchIdentityCacheSchema.optional(),
  browser: browserIdentityCacheSchema.optional(),
});
