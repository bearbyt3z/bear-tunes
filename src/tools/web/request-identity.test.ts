import * as nodeFs from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFetchHeaders,
  buildImageDownloadHeaders,
  getBrowserContextOptions,
  getCachedBrowserNavigatorContext,
  getCachedBrowserUserAgent,
  getFetchClientProfile,
  getFetchUserAgent,
  normalizeBrowserUserAgent,
  resolveBrowserNavigatorContext,
  saveAcceptedBrowserNavigatorContext,
  saveBrowserNavigatorContext,
} from './request-identity.js';

import { UA_PROFILES } from './request-identity.profiles.js';

import { identityCacheSchema } from './request-identity.schema.js';

import {
  BrowserUserAgentSource,
  type BrowserIdentityCache,
  type BrowserNavigatorContext,
  type FetchClientProfile,
  type FetchIdentityCache,
  type IdentityCache,
} from './request-identity.types.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const FIXED_NOW = new Date('2026-10-13T12:00:00.000Z');

const CACHED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

const HEADLESS_CHROME_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/131.0.6778.86 Safari/537.36';

const HEADLESS_CHROME_USER_AGENT_WITH_WEBKIT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.6778.86 Safari/537.36';

let tempDirectory = '';
let cacheFilePath = '';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'request-identity-'),
  );
  cacheFilePath = path.join(tempDirectory, 'identity-cache.json');
});

afterEach(async () => {
  vi.useRealTimers();

  if (tempDirectory.length > 0) {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }

  tempDirectory = '';
  cacheFilePath = '';
});

function createBrowserCacheEntry(
  overrides: Partial<BrowserIdentityCache> = {},
): BrowserIdentityCache {
  return {
    ...createBrowserNavigatorContext(overrides),
    source:
      overrides.source ?? BrowserUserAgentSource.HeadfulObserved,
    createdAt: overrides.createdAt ?? Date.now() - 60_000,
    expiresAt: overrides.expiresAt ?? Date.now() + 60_000,
  };
}

function createFetchIdentityCacheEntry(
  overrides: Partial<FetchIdentityCache> = {},
): FetchIdentityCache {
  return {
    userAgent:
      overrides.userAgent ?? 'Mozilla/5.0 Cached Fetch Client',
    profileName: overrides.profileName ?? 'chrome-windows',
    createdAt:
      overrides.createdAt ?? FIXED_NOW.getTime() - 60_000,
    expiresAt:
      overrides.expiresAt ?? FIXED_NOW.getTime() + 60_000,
  };
}

async function writeIdentityCache(cache: IdentityCache): Promise<void> {
  await fs.writeFile(cacheFilePath, JSON.stringify(cache), 'utf8');
}

async function readPersistedIdentityCache(): Promise<IdentityCache> {
  const raw = await fs.readFile(cacheFilePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  return identityCacheSchema.parse(parsed);
}

function createFetchClientProfile(): FetchClientProfile {
  return {
    identity: {
      userAgent: 'TestBrowser/123.0',
      locale: 'pl-PL',
      timezoneId: 'Europe/Warsaw',
    },
    device: {
      viewport: { width: 1280, height: 720 },
      screen: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    request: {
      accept: 'application/json',
      acceptLanguage: 'pl-PL,pl;q=0.9',
      acceptEncoding: 'gzip, deflate',
      connection: 'keep-alive',
      upgradeInsecureRequests: '1',
    },
  };
}

function createBrowserNavigatorContext(
  overrides: Partial<BrowserNavigatorContext> = {},
): BrowserNavigatorContext {
  return {
    userAgent: overrides.userAgent ?? CACHED_USER_AGENT,
    platform: overrides.platform ?? 'Win32',
    language: overrides.language ?? 'en-US',
    vendor: overrides.vendor ?? 'Google Inc.',
  };
}

function createRuntimeNavigatorContext(
  overrides: Partial<BrowserNavigatorContext> = {},
): BrowserNavigatorContext {
  return createBrowserNavigatorContext({
    userAgent: HEADLESS_CHROME_USER_AGENT,
    platform: 'Linux x86_64',
    language: 'pl-PL',
    vendor: 'Runtime Vendor',
    ...overrides,
  });
}

describe('getCachedBrowserUserAgent', () => {
  it('returns the User-Agent from a valid, non-expired browser cache entry', async () => {
    await writeIdentityCache({
      browser: createBrowserCacheEntry({
        expiresAt: Date.now() + 60_000,
      }),
    });

    await expect(
      getCachedBrowserUserAgent(cacheFilePath),
    ).resolves.toBe(CACHED_USER_AGENT);
  });

  it('returns undefined when the cache file does not exist', async () => {
    await expect(
      getCachedBrowserUserAgent(cacheFilePath),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when the browser cache entry has expired', async () => {
    await writeIdentityCache({
      browser: createBrowserCacheEntry({
        expiresAt: Date.now() - 1,
      }),
    });

    await expect(
      getCachedBrowserUserAgent(cacheFilePath),
    ).resolves.toBeUndefined();
  });

  it('treats malformed cache JSON as an empty cache', async () => {
    await fs.writeFile(cacheFilePath, '{"browser":', 'utf8');

    await expect(
      getCachedBrowserUserAgent(cacheFilePath),
    ).resolves.toBeUndefined();
  });

  it('treats a browser cache entry with an invalid structure as missing', async () => {
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify({
        browser: {
          userAgent: CACHED_USER_AGENT,
          expiresAt: Date.now() + 60_000,
        },
      }),
      'utf8',
    );

    await expect(
      getCachedBrowserUserAgent(cacheFilePath),
    ).resolves.toBeUndefined();
  });

  it('propagates cache read errors other than missing files', async () => {
    const blockingFilePath = path.join(tempDirectory, 'not-a-directory');

    await fs.writeFile(blockingFilePath, 'regular file', 'utf8');

    const invalidCachePath = path.join(
      blockingFilePath,
      'identity-cache.json',
    );

    await expect(
      getCachedBrowserUserAgent(invalidCachePath),
    ).rejects.toMatchObject({
      code: 'ENOTDIR',
    });
  });

  it('propagates read errors that do not have a string error code', async () => {
    const error = new Error('Unexpected read failure');
    const readFileSpy = vi
      .spyOn(nodeFs.promises, 'readFile')
      .mockRejectedValueOnce(error);

    try {
      await expect(
        getCachedBrowserUserAgent(cacheFilePath),
      ).rejects.toBe(error);

      expect(readFileSpy).toHaveBeenCalledWith(cacheFilePath, 'utf8');
    } finally {
      readFileSpy.mockRestore();
    }
  });
});

describe('getCachedBrowserNavigatorContext', () => {
  it('returns the navigator context from a valid browser cache entry', async () => {
    await writeIdentityCache({
      browser: createBrowserCacheEntry({
        expiresAt: Date.now() + 60_000,
      }),
    });

    await expect(
      getCachedBrowserNavigatorContext(cacheFilePath),
    ).resolves.toStrictEqual({
      userAgent: CACHED_USER_AGENT,
      platform: 'Win32',
      language: 'en-US',
      vendor: 'Google Inc.',
    });
  });

  it('returns undefined when the browser cache entry is missing', async () => {
    await writeIdentityCache({});

    await expect(
      getCachedBrowserNavigatorContext(cacheFilePath),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when the browser cache entry has expired', async () => {
    await writeIdentityCache({
      browser: createBrowserCacheEntry({
        expiresAt: Date.now() - 1,
      }),
    });

    await expect(
      getCachedBrowserNavigatorContext(cacheFilePath),
    ).resolves.toBeUndefined();
  });
});

describe('saveBrowserNavigatorContext', () => {
  it.each([
    BrowserUserAgentSource.HeadfulObserved,
    BrowserUserAgentSource.HeadlessNormalized,
  ])(
    'persists the navigator context with source "%s" and valid cache metadata',
    async (source) => {
      const context: BrowserNavigatorContext = {
        userAgent: CACHED_USER_AGENT,
        platform: 'Win32',
        language: 'en-US',
        vendor: 'Google Inc.',
      };

      await expect(
        saveBrowserNavigatorContext(cacheFilePath, context, source),
      ).resolves.toStrictEqual(context);

      const cache = await readPersistedIdentityCache();
      const browserEntry = cache.browser;

      if (!browserEntry) {
        throw new Error('Expected a browser identity cache entry.');
      }

      expect(browserEntry).toMatchObject({
        ...context,
        source,
        createdAt: FIXED_NOW.getTime(),
      });

      expect(browserEntry.expiresAt).toBeGreaterThanOrEqual(
        FIXED_NOW.getTime() + 7 * MILLISECONDS_PER_DAY,
      );
      expect(browserEntry.expiresAt).toBeLessThanOrEqual(
        FIXED_NOW.getTime() + 14 * MILLISECONDS_PER_DAY,
      );
    },
  );

  it.each([
    { randomValue: 0, expectedDays: 7 },
    { randomValue: 1 - Number.EPSILON, expectedDays: 14 },
  ])(
    'uses the inclusive $expectedDays-day TTL boundary when Math.random() returns $randomValue',
    async ({ randomValue, expectedDays }) => {
      const randomSpy = vi
        .spyOn(Math, 'random')
        .mockReturnValueOnce(randomValue);

      try {
        await saveBrowserNavigatorContext(
          cacheFilePath,
          createBrowserNavigatorContext(),
          BrowserUserAgentSource.HeadfulObserved,
        );

        const cache = await readPersistedIdentityCache();
        const entry = cache.browser;

        if (!entry) {
          throw new Error('Expected a persisted browser identity entry.');
        }

        expect(entry.createdAt).toBe(FIXED_NOW.getTime());
        expect(entry.expiresAt).toBe(
          FIXED_NOW.getTime() + expectedDays * MILLISECONDS_PER_DAY,
        );
      } finally {
        randomSpy.mockRestore();
      }
    },
  );

  it('replaces the browser entry while preserving the existing fetch entry', async () => {
    const existingFetchEntry = createFetchIdentityCacheEntry({
      userAgent: 'Mozilla/5.0 Existing Fetch Client',
    });

    const existingBrowserEntry = createBrowserCacheEntry({
      expiresAt: FIXED_NOW.getTime() + 60_000,
      userAgent: 'Mozilla/5.0 Existing Browser Client',
    });

    await writeIdentityCache({
      fetch: existingFetchEntry,
      browser: existingBrowserEntry,
    });

    const updatedContext: BrowserNavigatorContext = {
      userAgent: CACHED_USER_AGENT,
      platform: 'Win32',
      language: 'pl-PL',
      vendor: 'Google Inc.',
    };

    await saveBrowserNavigatorContext(
      cacheFilePath,
      updatedContext,
      BrowserUserAgentSource.HeadfulObserved,
    );

    const cache = await readPersistedIdentityCache();

    expect(cache.fetch).toStrictEqual(existingFetchEntry);

    const browserEntry = cache.browser;

    if (!browserEntry) {
      throw new Error('Expected the updated browser cache entry.');
    }

    expect(browserEntry).toMatchObject({
      ...updatedContext,
      source: BrowserUserAgentSource.HeadfulObserved,
      createdAt: FIXED_NOW.getTime(),
    });

    expect(browserEntry.userAgent).not.toBe(existingBrowserEntry.userAgent);
  });

  it('creates missing parent directories when saving the cache', async () => {
    const nestedCacheFilePath = path.join(
      tempDirectory,
      'nested',
      'cache',
      'identity-cache.json',
    );

    const context: BrowserNavigatorContext = {
      userAgent: CACHED_USER_AGENT,
      platform: 'Win32',
      language: 'en-US',
      vendor: 'Google Inc.',
    };

    await expect(
      saveBrowserNavigatorContext(
        nestedCacheFilePath,
        context,
        BrowserUserAgentSource.HeadfulObserved,
      ),
    ).resolves.toStrictEqual(context);

    await expect(
      fs.access(nestedCacheFilePath),
    ).resolves.toBeUndefined();
  });

  it('propagates a directory creation error', async () => {
    const error = new Error('Unable to create cache directory');
    const mkdirSpy = vi
      .spyOn(nodeFs.promises, 'mkdir')
      .mockRejectedValueOnce(error);

    try {
      await expect(
        saveBrowserNavigatorContext(
          cacheFilePath,
          createBrowserNavigatorContext(),
          BrowserUserAgentSource.HeadfulObserved,
        ),
      ).rejects.toBe(error);

      expect(mkdirSpy).toHaveBeenCalledWith(tempDirectory, {
        recursive: true,
      });
    } finally {
      mkdirSpy.mockRestore();
    }
  });

  it('preserves the write error when temporary-file cleanup also fails', async () => {
    const writeError = new Error('Unable to write temporary file');
    const cleanupError = new Error('Unable to remove temporary file');

    const writeFileSpy = vi
      .spyOn(nodeFs.promises, 'writeFile')
      .mockRejectedValueOnce(writeError);

    const cleanupSpy = vi
      .spyOn(nodeFs.promises, 'rm')
      .mockRejectedValueOnce(cleanupError);

    try {
      await expect(
        saveBrowserNavigatorContext(
          cacheFilePath,
          createBrowserNavigatorContext(),
          BrowserUserAgentSource.HeadfulObserved,
        ),
      ).rejects.toBe(writeError);

      expect(writeFileSpy).toHaveBeenCalledTimes(1);

      expect(cleanupSpy).toHaveBeenCalledWith(
        expect.stringContaining('.tmp-identity-cache.json-'),
        { force: true },
      );
    } finally {
      cleanupSpy.mockRestore();
      writeFileSpy.mockRestore();
    }
  });

  it('removes the temporary file and propagates an atomic rename error', async () => {
    const context: BrowserNavigatorContext = {
      userAgent: CACHED_USER_AGENT,
      platform: 'Win32',
      language: 'en-US',
      vendor: 'Google Inc.',
    };
    const renameError = new Error('Simulated atomic rename failure');
    const renameSpy = vi.spyOn(nodeFs.promises, 'rename')
      .mockRejectedValue(renameError);

    try {
      await expect(
        saveBrowserNavigatorContext(
          cacheFilePath,
          context,
          BrowserUserAgentSource.HeadfulObserved,
        ),
      ).rejects.toBe(renameError);

      await expect(fs.readdir(tempDirectory)).resolves.toStrictEqual([]);
      expect(renameSpy).toHaveBeenCalledTimes(1);
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('preserves the original rename error when temporary file cleanup fails', async () => {
    const context: BrowserNavigatorContext = {
      userAgent: CACHED_USER_AGENT,
      platform: 'Win32',
      language: 'en-US',
      vendor: 'Google Inc.',
    };
    const renameError = new Error('Simulated atomic rename failure');
    const cleanupError = new Error('Simulated temporary file cleanup failure');

    const renameSpy = vi.spyOn(nodeFs.promises, 'rename')
      .mockRejectedValue(renameError);
    const cleanupSpy = vi.spyOn(nodeFs.promises, 'rm')
      .mockRejectedValue(cleanupError);

    try {
      await expect(
        saveBrowserNavigatorContext(
          cacheFilePath,
          context,
          BrowserUserAgentSource.HeadfulObserved,
        ),
      ).rejects.toBe(renameError);

      expect(renameSpy).toHaveBeenCalledTimes(1);
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    } finally {
      cleanupSpy.mockRestore();
      renameSpy.mockRestore();
    }
  });
});

describe('getFetchUserAgent', () => {
  it('returns the cached User-Agent when a valid fetch entry exists', async () => {
    const cachedEntry = createFetchIdentityCacheEntry();

    await writeIdentityCache({ fetch: cachedEntry });

    await expect(getFetchUserAgent(cacheFilePath)).resolves.toBe(
      cachedEntry.userAgent,
    );

    await expect(readPersistedIdentityCache()).resolves.toStrictEqual({
      fetch: cachedEntry,
    });
  });

  it.each(
    UA_PROFILES.map((profile, index) => ({
      profile,
      profileName: profile.name,
      index,
    })),
  )(
    'generates and persists a User-Agent for the $profileName profile',
    async ({ profile, index }) => {
      vi.spyOn(Math, 'random').mockReturnValueOnce(
        (index + 0.5) / UA_PROFILES.length,
      );

      const userAgent = await getFetchUserAgent(cacheFilePath);
      const cache = await readPersistedIdentityCache();
      const entry = cache.fetch;

      if (!entry) {
        throw new Error('Expected a persisted fetch identity entry.');
      }

      expect(userAgent).toBeTruthy();
      expect(entry.profileName).toBe(profile.name);
      expect(entry.userAgent).toBe(userAgent);
      expect(entry.createdAt).toBe(FIXED_NOW.getTime());

      expect(entry.expiresAt).toBeGreaterThanOrEqual(
        FIXED_NOW.getTime() + 7 * MILLISECONDS_PER_DAY,
      );
      expect(entry.expiresAt).toBeLessThanOrEqual(
        FIXED_NOW.getTime() + 14 * MILLISECONDS_PER_DAY,
      );

      expect(profile.match.test(userAgent)).toBe(true);

      for (const pattern of profile.exclude ?? []) {
        expect(userAgent).not.toMatch(pattern);
      }
    },
  );

  it('regenerates an expired User-Agent and preserves the browser cache entry', async () => {
    const expiredFetchEntry = createFetchIdentityCacheEntry({
      userAgent: 'Expired Cached Fetch Client',
      createdAt: FIXED_NOW.getTime() - 2 * MILLISECONDS_PER_DAY,
      expiresAt: FIXED_NOW.getTime(),
    });

    const browserEntry = createBrowserCacheEntry({
      expiresAt: FIXED_NOW.getTime() + MILLISECONDS_PER_DAY,
    });

    await writeIdentityCache({
      fetch: expiredFetchEntry,
      browser: browserEntry,
    });

    const userAgent = await getFetchUserAgent(cacheFilePath);

    expect(userAgent).toBeTruthy();
    expect(userAgent).not.toBe(expiredFetchEntry.userAgent);

    const cache = await readPersistedIdentityCache();
    const entry = cache.fetch;

    if (!entry) {
      throw new Error('Expected the regenerated fetch identity entry.');
    }

    expect(entry.userAgent).toBe(userAgent);
    expect(entry.createdAt).toBe(FIXED_NOW.getTime());
    expect(entry.expiresAt).toBeGreaterThan(FIXED_NOW.getTime());
    expect(cache.browser).toStrictEqual(browserEntry);
  });

  it('recovers from malformed cache JSON and persists a new identity', async () => {
    await fs.writeFile(cacheFilePath, '{"fetch":', 'utf8');

    const userAgent = await getFetchUserAgent(cacheFilePath);

    expect(userAgent).toBeTruthy();

    const cache = await readPersistedIdentityCache();

    expect(cache.fetch?.userAgent).toBe(userAgent);
    expect(cache.fetch?.createdAt).toBe(FIXED_NOW.getTime());
  });

  it('recovers from a fetch cache entry that fails schema validation and persists a new identity', async () => {
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify({
        fetch: {
          userAgent: '',
          profileName: '',
          createdAt: -1,
          expiresAt: 0,
        },
      }),
      'utf8',
    );

    const userAgent = await getFetchUserAgent(cacheFilePath);

    expect(userAgent).toBeTruthy();

    const cache = await readPersistedIdentityCache();
    const entry = cache.fetch;

    if (!entry) {
      throw new Error('Expected a regenerated fetch identity entry.');
    }

    expect(entry.userAgent).toBe(userAgent);
    expect(entry.profileName).not.toBe('');
    expect(UA_PROFILES.map((profile) => profile.name)).toContain(
      entry.profileName,
    );
    expect(entry.createdAt).toBe(FIXED_NOW.getTime());
    expect(entry.expiresAt).toBeGreaterThan(FIXED_NOW.getTime());
  });
});

describe('getFetchClientProfile', () => {
  it('returns the canonical client profile using the cached fetch User-Agent', async () => {
    const cachedEntry = createFetchIdentityCacheEntry();

    await writeIdentityCache({ fetch: cachedEntry });

    await expect(
      getFetchClientProfile(cacheFilePath),
    ).resolves.toStrictEqual({
      identity: {
        userAgent: cachedEntry.userAgent,
        locale: 'en-US',
        timezoneId: 'Europe/Warsaw',
      },
      device: {
        viewport: { width: 1920, height: 915 },
        screen: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      request: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        acceptLanguage: 'en-US,en;q=0.9',
        acceptEncoding: 'gzip, deflate, br',
        connection: 'keep-alive',
        upgradeInsecureRequests: '1',
      },
    });
  });

  it('generates and persists a User-Agent when the fetch cache is missing', async () => {
    const profile = await getFetchClientProfile(cacheFilePath);

    expect(profile.identity.userAgent).toBeTruthy();

    const cache = await readPersistedIdentityCache();

    expect(cache.fetch?.userAgent).toBe(profile.identity.userAgent);
    expect(cache.fetch?.profileName).toBeTruthy();
    expect(cache.fetch?.createdAt).toBe(FIXED_NOW.getTime());
  });
});

describe('buildFetchHeaders', () => {
  it('maps the fetch client profile to the expected HTTP headers', () => {
    const profile: FetchClientProfile = createFetchClientProfile();

    expect(buildFetchHeaders(profile)).toStrictEqual({
      'User-Agent': 'TestBrowser/123.0',
      'Accept': 'application/json',
      'Accept-Language': 'pl-PL,pl;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });
  });
});

describe('buildImageDownloadHeaders', () => {
  it('builds image download headers without a Referer', () => {
    const profile = createFetchClientProfile();

    expect(buildImageDownloadHeaders(profile)).toStrictEqual({
      'User-Agent': 'TestBrowser/123.0',
      'Accept':
        'image/jpeg,image/png,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
      'Accept-Language': 'pl-PL,pl;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    });
  });

  it('includes the serialized Referer URL when provided', () => {
    const profile = createFetchClientProfile();
    const referer = new URL(
      'https://example.test/articles/42?source=page',
    );

    expect(
      buildImageDownloadHeaders(profile, referer),
    ).toStrictEqual({
      'User-Agent': 'TestBrowser/123.0',
      'Accept':
        'image/jpeg,image/png,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
      'Accept-Language': 'pl-PL,pl;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Referer': referer.toString(),
    });
  });
});

describe('normalizeBrowserUserAgent', () => {
  it('replaces HeadlessChrome and normalizes the Chrome version', () => {
    const userAgent = HEADLESS_CHROME_USER_AGENT_WITH_WEBKIT;

    expect(normalizeBrowserUserAgent(userAgent)).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
  });

  it('normalizes a regular Chrome version while preserving other tokens', () => {
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.86 Safari/537.36';

    expect(normalizeBrowserUserAgent(userAgent)).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
  });

  it('leaves a three-part Chrome version unchanged', () => {
    const userAgent = 'Mozilla/5.0 Chrome/124.2.3 Safari/537.36';

    expect(normalizeBrowserUserAgent(userAgent)).toBe(userAgent);
  });

  it('leaves a Firefox User-Agent unchanged', () => {
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

    expect(normalizeBrowserUserAgent(userAgent)).toBe(userAgent);
  });

  it('replaces HeadlessChrome when its version does not have four components', () => {
    const userAgent =
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/131.0 Safari/537.36';

    expect(normalizeBrowserUserAgent(userAgent)).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0 Safari/537.36',
    );
  });
});

describe('resolveBrowserNavigatorContext', () => {
  it('returns the cached context when preferCached is true and a valid entry exists', async () => {
    await writeIdentityCache({
      browser: createBrowserCacheEntry({
        expiresAt: Date.now() + 60_000,
      }),
    });

    const runtimeNavigator = createRuntimeNavigatorContext();

    await expect(
      resolveBrowserNavigatorContext(
        runtimeNavigator,
        cacheFilePath,
        true,
      ),
    ).resolves.toStrictEqual({
      userAgent: CACHED_USER_AGENT,
      platform: 'Win32',
      language: 'en-US',
      vendor: 'Google Inc.',
    });
  });

  it('uses the normalized runtime context when preferCached is false', async () => {
    await writeIdentityCache({
      browser: createBrowserCacheEntry({
        expiresAt: Date.now() + 60_000,
      }),
    });

    const runtimeNavigator = createRuntimeNavigatorContext();

    await expect(
      resolveBrowserNavigatorContext(
        runtimeNavigator,
        cacheFilePath,
        false,
      ),
    ).resolves.toStrictEqual({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0 Safari/537.36',
      platform: 'Linux x86_64',
      language: 'pl-PL',
      vendor: 'Runtime Vendor',
    });
  });

  it('uses the normalized runtime context when the preferred cache entry is missing', async () => {
    const runtimeNavigator = createRuntimeNavigatorContext();

    await expect(
      resolveBrowserNavigatorContext(
        runtimeNavigator,
        cacheFilePath,
        true,
      ),
    ).resolves.toStrictEqual({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0 Safari/537.36',
      platform: 'Linux x86_64',
      language: 'pl-PL',
      vendor: 'Runtime Vendor',
    });
  });

  it('uses the normalized runtime context when the preferred cache entry has expired', async () => {
    await writeIdentityCache({
      browser: createBrowserCacheEntry({
        expiresAt: Date.now(),
      }),
    });

    const runtimeNavigator = createRuntimeNavigatorContext();

    await expect(
      resolveBrowserNavigatorContext(
        runtimeNavigator,
        cacheFilePath,
        true,
      ),
    ).resolves.toStrictEqual({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0 Safari/537.36',
      platform: 'Linux x86_64',
      language: 'pl-PL',
      vendor: 'Runtime Vendor',
    });
  });
});

describe('saveAcceptedBrowserNavigatorContext', () => {
  it('normalizes and persists the accepted navigator context', async () => {
    const runtimeNavigator = createRuntimeNavigatorContext({
      userAgent: HEADLESS_CHROME_USER_AGENT_WITH_WEBKIT,
      vendor: 'Google Inc.',
    });

    const expectedContext: BrowserNavigatorContext = {
      ...runtimeNavigator,
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };

    await expect(
      saveAcceptedBrowserNavigatorContext(
        runtimeNavigator,
        cacheFilePath,
      ),
    ).resolves.toStrictEqual(expectedContext);

    const cache = await readPersistedIdentityCache();
    const browserEntry = cache.browser;

    if (!browserEntry) {
      throw new Error('Expected a persisted browser identity entry.');
    }

    expect(browserEntry).toMatchObject({
      ...expectedContext,
      source: BrowserUserAgentSource.HeadfulObserved,
      createdAt: FIXED_NOW.getTime(),
    });

    expect(browserEntry.expiresAt).toBeGreaterThanOrEqual(
      FIXED_NOW.getTime() + 7 * MILLISECONDS_PER_DAY,
    );
    expect(browserEntry.expiresAt).toBeLessThanOrEqual(
      FIXED_NOW.getTime() + 14 * MILLISECONDS_PER_DAY,
    );
  });

  it('preserves the existing fetch identity when saving the accepted browser context', async () => {
    const fetchEntry = createFetchIdentityCacheEntry({
      userAgent: 'Mozilla/5.0 Existing Fetch Client',
    });

    await writeIdentityCache({ fetch: fetchEntry });

    const runtimeNavigator = createRuntimeNavigatorContext({
      vendor: 'Google Inc.',
    });

    await saveAcceptedBrowserNavigatorContext(
      runtimeNavigator,
      cacheFilePath,
    );

    const cache = await readPersistedIdentityCache();

    expect(cache.fetch).toStrictEqual(fetchEntry);
    expect(cache.browser?.source).toBe(
      BrowserUserAgentSource.HeadfulObserved,
    );
  });
});

describe('getBrowserContextOptions', () => {
  it('returns the expected Playwright browser context options', () => {
    expect(getBrowserContextOptions()).toStrictEqual({
      viewport: {
        width: 1920,
        height: 915,
      },
      screen: {
        width: 1920,
        height: 1080,
      },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      timezoneId: 'Europe/Warsaw',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  });
});
