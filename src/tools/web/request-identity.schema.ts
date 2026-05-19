import { z } from 'zod';

import { BrowserUserAgentSource } from './request-identity.types.js';

export const fingerprintCacheEntrySchema = z.object({
  userAgent: z.string().min(1),
  createdAt: z.number(),
  expiresAt: z.number(),
});

export const fetchIdentityCacheSchema = fingerprintCacheEntrySchema.extend({
  profileName: z.string().min(1),
});

export const browserIdentityCacheSchema = fingerprintCacheEntrySchema.extend({
  source: z.enum(BrowserUserAgentSource),
  platform: z.string(),
  language: z.string(),
  vendor: z.string(),
});

export const identityCacheSchema = z.object({
  fetch: fetchIdentityCacheSchema.optional(),
  browser: browserIdentityCacheSchema.optional(),
});
