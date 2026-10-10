import { describe, expect, it } from 'vitest';

import {
  browserIdentityCacheSchema,
  fetchIdentityCacheSchema,
  fingerprintCacheEntrySchema,
  identityCacheSchema,
} from './request-identity.schema.js';

import { BrowserUserAgentSource } from './request-identity.types.js';

const validFingerprintCacheEntry = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  createdAt: 1_700_000_000_000,
  expiresAt: 1_700_604_800_000,
};

const validFetchIdentityCache = {
  ...validFingerprintCacheEntry,
  profileName: 'chrome-windows',
};

const validBrowserIdentityCache = {
  ...validFingerprintCacheEntry,
  source: BrowserUserAgentSource.HeadfulObserved,
  platform: 'Win32',
  language: 'en-US',
  vendor: 'Google Inc.',
};

describe('fingerprintCacheEntrySchema', () => {
  it('accepts valid common cache entry fields', () => {
    expect(
      fingerprintCacheEntrySchema.parse(validFingerprintCacheEntry),
    ).toEqual(validFingerprintCacheEntry);
  });

  it('rejects an empty User-Agent', () => {
    expect(
      fingerprintCacheEntrySchema.safeParse({
        ...validFingerprintCacheEntry,
        userAgent: '',
      }).success,
    ).toBe(false);
  });

  it('rejects a missing User-Agent', () => {
    const entry: Record<string, unknown> = {
      createdAt: validFingerprintCacheEntry.createdAt,
      expiresAt: validFingerprintCacheEntry.expiresAt,
    };

    expect(fingerprintCacheEntrySchema.safeParse(entry).success).toBe(false);
  });

  it.each(['createdAt', 'expiresAt'] as const)(
    'rejects a missing %s timestamp',
    (field) => {
      const entry: Record<string, unknown> = {
        ...validFingerprintCacheEntry,
      };

      delete entry[field];

      expect(fingerprintCacheEntrySchema.safeParse(entry).success).toBe(false);
    },
  );

  it.each([
    ['createdAt', -1],
    ['createdAt', 1.5],
    ['createdAt', Number.NaN],
    ['createdAt', Number.POSITIVE_INFINITY],
    ['expiresAt', -1],
    ['expiresAt', 1.5],
    ['expiresAt', Number.NaN],
    ['expiresAt', Number.POSITIVE_INFINITY],
  ])(
    'rejects invalid %s timestamp value %s',
    (field, value) => {
      const entry = {
        ...validFingerprintCacheEntry,
        [field]: value,
      };

      expect(fingerprintCacheEntrySchema.safeParse(entry).success).toBe(false);
    },
  );

  it('rejects timestamp values provided as strings', () => {
    expect(
      fingerprintCacheEntrySchema.safeParse({
        ...validFingerprintCacheEntry,
        createdAt: String(validFingerprintCacheEntry.createdAt),
      }).success,
    ).toBe(false);
  });
});

describe('fetchIdentityCacheSchema', () => {
  it('accepts a valid fetch identity cache entry', () => {
    expect(
      fetchIdentityCacheSchema.parse(validFetchIdentityCache),
    ).toEqual(validFetchIdentityCache);
  });

  it('rejects an empty profile name', () => {
    expect(
      fetchIdentityCacheSchema.safeParse({
        ...validFetchIdentityCache,
        profileName: '',
      }).success,
    ).toBe(false);
  });

  it('rejects a missing profile name', () => {
    const entry: Record<string, unknown> = {
      ...validFingerprintCacheEntry,
    };

    expect(fetchIdentityCacheSchema.safeParse(entry).success).toBe(false);
  });

  it('rejects a fetch identity entry with an invalid timestamp', () => {
    expect(
      fetchIdentityCacheSchema.safeParse({
        ...validFetchIdentityCache,
        expiresAt: 1.5,
      }).success,
    ).toBe(false);
  });
});

describe('browserIdentityCacheSchema', () => {
  it('accepts a valid browser identity cache entry', () => {
    expect(
      browserIdentityCacheSchema.parse(validBrowserIdentityCache),
    ).toEqual(validBrowserIdentityCache);
  });

  it.each(Object.values(BrowserUserAgentSource))(
    'accepts the "%s" browser identity source',
    (source) => {
      expect(
        browserIdentityCacheSchema.safeParse({
          ...validBrowserIdentityCache,
          source,
        }).success,
      ).toBe(true);
    },
  );

  it('rejects an unsupported browser identity source', () => {
    expect(
      browserIdentityCacheSchema.safeParse({
        ...validBrowserIdentityCache,
        source: 'unknown-source',
      }).success,
    ).toBe(false);
  });

  it.each(['platform', 'language', 'vendor'] as const)(
    'rejects a missing %s field',
    (field) => {
      const entry: Record<string, unknown> = {
        ...validBrowserIdentityCache,
      };

      delete entry[field];

      expect(browserIdentityCacheSchema.safeParse(entry).success).toBe(false);
    },
  );

  it('rejects a missing source field', () => {
    const entry: Record<string, unknown> = {
      ...validFingerprintCacheEntry,
      platform: validBrowserIdentityCache.platform,
      language: validBrowserIdentityCache.language,
      vendor: validBrowserIdentityCache.vendor,
    };

    expect(browserIdentityCacheSchema.safeParse(entry).success).toBe(false);
  });

  it('rejects browser identity fields with incorrect types', () => {
    expect(
      browserIdentityCacheSchema.safeParse({
        ...validBrowserIdentityCache,
        platform: 123,
      }).success,
    ).toBe(false);
  });
});

describe('identityCacheSchema', () => {
  it('accepts an empty cache', () => {
    expect(identityCacheSchema.parse({})).toEqual({});
  });

  it('accepts a cache containing only a fetch identity', () => {
    expect(
      identityCacheSchema.parse({
        fetch: validFetchIdentityCache,
      }),
    ).toEqual({
      fetch: validFetchIdentityCache,
    });
  });

  it('accepts a cache containing only a browser identity', () => {
    expect(
      identityCacheSchema.parse({
        browser: validBrowserIdentityCache,
      }),
    ).toEqual({
      browser: validBrowserIdentityCache,
    });
  });

  it('accepts a cache containing both identity types', () => {
    const cache = {
      fetch: validFetchIdentityCache,
      browser: validBrowserIdentityCache,
    };

    expect(identityCacheSchema.parse(cache)).toEqual(cache);
  });

  it('rejects a cache containing an invalid fetch entry', () => {
    expect(
      identityCacheSchema.safeParse({
        fetch: {
          ...validFetchIdentityCache,
          profileName: '',
        },
        browser: validBrowserIdentityCache,
      }).success,
    ).toBe(false);
  });

  it('rejects a cache containing an invalid browser entry', () => {
    expect(
      identityCacheSchema.safeParse({
        fetch: validFetchIdentityCache,
        browser: {
          ...validBrowserIdentityCache,
          source: 'invalid-source',
        },
      }).success,
    ).toBe(false);
  });

  it.each([null, [], 'invalid-cache', 42])(
    'rejects an invalid cache container: %j',
    (cache) => {
      expect(identityCacheSchema.safeParse(cache).success).toBe(false);
    },
  );
});
