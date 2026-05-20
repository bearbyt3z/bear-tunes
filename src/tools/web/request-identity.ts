import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import UserAgent from 'user-agents';

import {
  RequestIdentityType,
  BrowserUserAgentSource,
} from './request-identity.types.js';

import { identityCacheSchema } from './request-identity.schema.js';

import type { BrowserContextOptions } from 'playwright';

import type {
  BrowserIdentityCache,
  BrowserNavigatorContext,
  ClientDeviceProfile,
  FetchClientProfile,
  ClientRequestProfile,
  IdentityCache,
  UAProfile,
} from './request-identity.types.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULT_LOCALE = 'en-US';
const DEFAULT_TIMEZONE_ID = 'Europe/Warsaw';

/**
 * Supported User-Agent profile templates used to generate request identities.
 */
const UA_PROFILES: UAProfile[] = [
  {
    name: 'chrome-windows',
    match: /Chrome/,
    filter: { deviceCategory: 'desktop', platform: 'Win32' },
  },
  {
    name: 'firefox-windows',
    match: /Firefox/,
    filter: { deviceCategory: 'desktop', platform: 'Win32' },
  },
  {
    name: 'safari-macos',
    match: /Safari/,
    filter: { deviceCategory: 'desktop', platform: 'MacIntel' },
  },
  {
    name: 'chrome-mobile',
    match: /(Chrome|CriOS)/,
    filter: { deviceCategory: 'mobile' },
  },
  {
    name: 'safari-mobile',
    match: /Version\/.*Mobile\/.*Safari\//,
    filter: { deviceCategory: 'mobile' },
  },
];

/**
 * Returns a random integer from the inclusive range between `min` and `max`.
 *
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @returns Random integer from the inclusive range.
 * @throws {Error} When the bounds do not form a valid integer range.
 */
function randomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new Error(`Invalid randomInt range: min=${min}, max=${max}`);
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random cache lifetime in milliseconds for the inclusive day range.
 *
 * @param minDays - Inclusive lower bound expressed in days.
 * @param maxDays - Inclusive upper bound expressed in days.
 * @returns Random duration in milliseconds.
 */
function randomTtlMs(minDays = 3, maxDays = 10): number {
  const minMs = minDays * MILLISECONDS_PER_DAY;
  const maxMs = maxDays * MILLISECONDS_PER_DAY;
  return randomInt(minMs, maxMs);
}

/**
 * Selects one configured User-Agent profile template.
 *
 * @returns Selected User-Agent profile template.
 */
function pickRandomProfile(): UAProfile {
  return UA_PROFILES[randomInt(0, UA_PROFILES.length - 1)];
}

/**
 * Generates a concrete User-Agent string from a profile template.
 *
 * @param profile - User-Agent profile template used for generation.
 * @returns Generated User-Agent string.
 */
function generateUserAgent(profile: UAProfile): string {
  return new UserAgent([profile.match, profile.filter]).toString();
}

/**
 * Ensures that a directory exists.
 *
 * Missing parent directories are created recursively.
 *
 * @param dirPath - Directory path to ensure.
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Reads and parses a JSON file.
 *
 * The function returns `null` when the target file does not exist.
 *
 * @param filePath - Path to the JSON file.
 * @returns Parsed JSON value or `null` when the file is missing.
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/**
 * Writes a file atomically through a temporary sibling file.
 *
 * @param filePath - Target file path.
 * @param content - Final file content.
 */
async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const dirPath = path.dirname(filePath);
  const tempFilePath = path.join(
    dirPath,
    `.tmp-${path.basename(filePath)}-${process.pid}-${crypto.randomUUID()}`,
  );

  await ensureDir(dirPath);
  await fs.promises.writeFile(tempFilePath, content, 'utf8');
  await fs.promises.rename(tempFilePath, filePath);
}

/**
 * Reads the persisted request identity cache and validates its structure.
 *
 * Invalid or missing cache content is treated as an empty cache object.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @returns Parsed request identity cache object.
 */
async function readIdentityCache(
  userAgentCacheFile: string,
): Promise<IdentityCache> {
  const cached = await readJsonFile(userAgentCacheFile);
  const parsedCache = identityCacheSchema.safeParse(cached);

  return parsedCache.success ? parsedCache.data : {};
}

/**
 * Writes the persisted request identity cache to disk.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @param cache - Request identity cache content to persist.
 */
async function writeIdentityCache(
  userAgentCacheFile: string,
  cache: IdentityCache,
): Promise<void> {
  await writeFileAtomic(userAgentCacheFile, JSON.stringify(cache, null, 2));
}

/** Cache key representing one persisted request identity family. */
type IdentityCacheKey = keyof IdentityCache;

/** Non-null persisted cache entry type for a selected identity cache key. */
type IdentityCacheEntry<K extends IdentityCacheKey> = NonNullable<IdentityCache[K]>;

/**
 * Returns a non-expired persisted identity cache entry for the selected key.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @param key - Cache key identifying the requested identity family.
 * @param now - Timestamp used to evaluate cache expiration.
 * @returns Cached identity entry or `undefined` when missing or expired.
 */
async function getCachedIdentityEntry<K extends IdentityCacheKey>(
  userAgentCacheFile: string,
  key: K,
  now = Date.now(),
): Promise<IdentityCacheEntry<K> | undefined> {
  const cache = await readIdentityCache(userAgentCacheFile);
  const entry = cache[key];

  if (!entry || entry.expiresAt <= now) {
    return undefined;
  }

  return entry as IdentityCacheEntry<K>;
}

/**
 * Persists one identity cache entry under the selected cache key.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @param key - Cache key identifying the identity family to update.
 * @param entry - Cache entry to persist.
 * @returns The persisted cache entry.
 */
async function saveIdentityEntry<K extends IdentityCacheKey>(
  userAgentCacheFile: string,
  key: K,
  entry: IdentityCacheEntry<K>,
): Promise<IdentityCacheEntry<K>> {
  const cache = await readIdentityCache(userAgentCacheFile);

  const nextCache: IdentityCache = {
    ...cache,
    [key]: entry,
  };

  await writeIdentityCache(userAgentCacheFile, nextCache);

  return entry;
}

/**
 * Returns the cached browser User-Agent value when a non-expired browser
 * identity entry is available.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @returns Cached browser User-Agent string or `undefined`.
 */
export async function getCachedBrowserUserAgent(
  userAgentCacheFile: string,
): Promise<string | undefined> {
  const cachedEntry = await getCachedIdentityEntry(
    userAgentCacheFile,
    RequestIdentityType.Browser,
  );

  return cachedEntry?.userAgent;
}

/**
 * Returns the cached browser navigator context when a non-expired browser
 * identity entry is available.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @returns Cached browser navigator context or `undefined`.
 */
export async function getCachedBrowserNavigatorContext(
  userAgentCacheFile: string,
): Promise<BrowserNavigatorContext | undefined> {
  const cachedEntry = await getCachedIdentityEntry(
    userAgentCacheFile,
    RequestIdentityType.Browser,
  );

  if (!cachedEntry) {
    return undefined;
  }

  return {
    userAgent: cachedEntry.userAgent,
    platform: cachedEntry.platform,
    language: cachedEntry.language,
    vendor: cachedEntry.vendor,
  };
}

/**
 * Persists a browser navigator context together with its cache metadata.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @param context - Browser navigator context to persist.
 * @param source - Source assigned to the persisted browser identity.
 * @returns Persisted browser navigator context.
 */
export async function saveBrowserNavigatorContext(
  userAgentCacheFile: string,
  context: BrowserNavigatorContext,
  source: BrowserUserAgentSource,
): Promise<BrowserNavigatorContext> {
  const now = Date.now();

  const entry: BrowserIdentityCache = {
    userAgent: context.userAgent,
    platform: context.platform,
    language: context.language,
    vendor: context.vendor,
    source,
    createdAt: now,
    expiresAt: now + randomTtlMs(7, 14),
  };

  const savedEntry = await saveIdentityEntry(
    userAgentCacheFile,
    RequestIdentityType.Browser,
    entry,
  );

  return {
    userAgent: savedEntry.userAgent,
    platform: savedEntry.platform,
    language: savedEntry.language,
    vendor: savedEntry.vendor,
  };
}

/**
 * Returns a cached fetch User-Agent string or generates and persists a new one.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @returns Fetch User-Agent string.
 */
export async function getFetchUserAgent(
  userAgentCacheFile: string,
): Promise<string> {
  const now = Date.now();
  const cachedEntry = await getCachedIdentityEntry(
    userAgentCacheFile,
    RequestIdentityType.Fetch,
    now,
  );

  if (cachedEntry) {
    return cachedEntry.userAgent;
  }

  const profile = pickRandomProfile();
  const userAgent = generateUserAgent(profile);

  const entry = await saveIdentityEntry(
    userAgentCacheFile,
    RequestIdentityType.Fetch,
    {
      userAgent,
      profileName: profile.name,
      createdAt: now,
      expiresAt: now + randomTtlMs(7, 14),
    },
  );

  return entry.userAgent;
}

/**
 * Returns the default device profile used by generated client identities.
 *
 * @returns Default client device profile.
 */
function getDefaultDeviceProfile(): ClientDeviceProfile {
  return {
    viewport: { width: 1920, height: 915 },
    screen: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  };
}

/**
 * Returns the default request header profile used by generated client identities.
 *
 * @returns Default client request profile.
 */
function getDefaultRequestProfile(): ClientRequestProfile {
  return {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    connection: 'keep-alive',
    upgradeInsecureRequests: '1',
  };
}

/**
 * Returns the canonical fetch client profile containing identity, device, and
 * request header values.
 *
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @returns Complete fetch client profile.
 */
export async function getFetchClientProfile(
  userAgentCacheFile: string,
): Promise<FetchClientProfile> {
  const userAgent = await getFetchUserAgent(userAgentCacheFile);

  return {
    identity: {
      userAgent,
      locale: DEFAULT_LOCALE,
      timezoneId: DEFAULT_TIMEZONE_ID,
    },
    device: getDefaultDeviceProfile(),
    request: getDefaultRequestProfile(),
  };
}

/**
 * Builds HTTP request headers from a fetch client profile.
 *
 * @param profile - Fetch client profile providing identity and request settings.
 * @returns HTTP headers object ready for fetch requests.
 */
export function buildFetchHeaders(profile: FetchClientProfile): Record<string, string> {
  return {
    'User-Agent': profile.identity.userAgent,
    'Accept': profile.request.accept,
    'Accept-Language': profile.request.acceptLanguage,
    'Accept-Encoding': profile.request.acceptEncoding,
    'Connection': profile.request.connection,
    'Upgrade-Insecure-Requests': profile.request.upgradeInsecureRequests,
  };
}

/**
 * Builds browser-like HTTP headers for image download requests.
 *
 * The returned headers prefer image content types through the Accept header
 * and may include a Referer header when one is provided.
 *
 * @param profile - Client profile containing user agent and request preferences.
 * @param referer - Optional referrer URL to include in the Referer header.
 * @returns HTTP headers object ready for fetch requests.
 */
export function buildImageDownloadHeaders(
  profile: FetchClientProfile,
  referer?: URL,
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': profile.identity.userAgent,
    'Accept': 'image/jpeg,image/png,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
    'Accept-Language': profile.request.acceptLanguage,
    'Accept-Encoding': profile.request.acceptEncoding,
    'Connection': profile.request.connection,
  };

  if (referer) {
    headers.Referer = referer.toString();
  }

  return headers;
}

/**
 * Normalizes a runtime Chromium User-Agent string for browser automation.
 *
 * The normalization removes common headless markers and reduces the Chrome
 * version to the major-only format used by reduced User-Agent strings.
 *
 * @param userAgent - Runtime browser User-Agent string.
 * @returns Normalized User-Agent string suitable for browser requests.
 */
export function normalizeBrowserUserAgent(userAgent: string): string {
  return userAgent
    .replace('HeadlessChrome', 'Chrome')
    .replace(/Chrome\/(\d+)\.\d+\.\d+\.\d+/, 'Chrome/$1.0.0.0');
}

/**
 * Resolves the browser navigator context used for browser-based page fetches.
 *
 * A cached accepted navigator context may be reused when requested. Otherwise,
 * the runtime navigator context is normalized and returned.
 *
 * @param runtimeNavigator - Navigator context read from the live browser.
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @param preferCached - Whether a cached accepted browser navigator context should be preferred.
 * @returns Browser navigator context used for the browser request flow.
 */
export async function resolveBrowserNavigatorContext(
  runtimeNavigator: BrowserNavigatorContext,
  userAgentCacheFile: string,
  preferCached: boolean,
): Promise<BrowserNavigatorContext> {
  if (preferCached) {
    const cachedContext = await getCachedBrowserNavigatorContext(userAgentCacheFile);

    if (cachedContext) {
      return cachedContext;
    }
  }

  return {
    userAgent: normalizeBrowserUserAgent(runtimeNavigator.userAgent),
    platform: runtimeNavigator.platform,
    language: runtimeNavigator.language,
    vendor: runtimeNavigator.vendor,
  };
}

/**
 * Normalizes and persists an accepted browser navigator context.
 *
 * @param runtimeNavigator - Navigator context read from the live browser.
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @returns Persisted accepted browser navigator context.
 */
export async function saveAcceptedBrowserNavigatorContext(
  runtimeNavigator: BrowserNavigatorContext,
  userAgentCacheFile: string,
): Promise<BrowserNavigatorContext> {
  const normalizedUserAgent = normalizeBrowserUserAgent(runtimeNavigator.userAgent);

  return saveBrowserNavigatorContext(
    userAgentCacheFile,
    {
      userAgent: normalizedUserAgent,
      platform: runtimeNavigator.platform,
      language: runtimeNavigator.language,
      vendor: runtimeNavigator.vendor,
    },
    BrowserUserAgentSource.HeadfulObserved,
  );
}

/**
 * Returns the default Playwright browser context options derived from the
 * canonical client device and request profiles.
 *
 * @returns Browser context options for browser-based page fetches.
 */
export function getBrowserContextOptions(): BrowserContextOptions {
  const device = getDefaultDeviceProfile();
  const request = getDefaultRequestProfile();

  return {
    viewport: device.viewport,
    screen: device.screen,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    timezoneId: DEFAULT_TIMEZONE_ID,
    extraHTTPHeaders: {
      'Accept-Language': request.acceptLanguage,
    },
  };
}
