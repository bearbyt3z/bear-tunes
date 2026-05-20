import { z } from 'zod';

import { BrowserUserAgentSource } from './request-identity.types.js';

/**
 * Validates the common persisted fields shared by request identity cache entries.
 */
export const fingerprintCacheEntrySchema = z.object({
  userAgent: z.string().min(1),
  createdAt: z.number(),
  expiresAt: z.number(),
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
