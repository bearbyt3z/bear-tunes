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

/** Supported User-Agent profile templates used for cached identity rotation. */
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

/** Returns a random integer from the inclusive range between min and max, or throws for an invalid range. */
function randomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new Error(`Invalid randomInt range: min=${min}, max=${max}`);
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Returns a random duration in milliseconds for the given day range. */
function randomTtlMs(minDays = 3, maxDays = 10): number {
  const minMs = minDays * MILLISECONDS_PER_DAY;
  const maxMs = maxDays * MILLISECONDS_PER_DAY;
  return randomInt(minMs, maxMs);
}

/** Selects one of the configured User-Agent profile templates. */
function pickRandomProfile(): UAProfile {
  return UA_PROFILES[randomInt(0, UA_PROFILES.length - 1)];
}

/** Generates a concrete User-Agent string for the selected profile template. */
function generateUserAgent(profile: UAProfile): string {
  return new UserAgent([profile.match, profile.filter]).toString();
}

/** Ensures that the target directory exists, creating it recursively if needed. */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/** Reads and parses a JSON file, returning null when the file does not exist. */
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

/** Writes a file through a temporary sibling file to avoid partial cache writes. */
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

async function readIdentityCache(
  userAgentCacheFile: string,
): Promise<IdentityCache> {
  const cached = await readJsonFile(userAgentCacheFile);
  const parsedCache = identityCacheSchema.safeParse(cached);

  return parsedCache.success ? parsedCache.data : {};
}

async function writeIdentityCache(
  userAgentCacheFile: string,
  cache: IdentityCache,
): Promise<void> {
  await writeFileAtomic(userAgentCacheFile, JSON.stringify(cache, null, 2));
}

type IdentityCacheKey = keyof IdentityCache;
type IdentityCacheEntry<K extends IdentityCacheKey> = NonNullable<IdentityCache[K]>;

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

export async function getCachedBrowserUserAgent(
  userAgentCacheFile: string,
): Promise<string | undefined> {
  const cachedEntry = await getCachedIdentityEntry(
    userAgentCacheFile,
    RequestIdentityType.Browser,
  );

  return cachedEntry?.userAgent;
}

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

function getDefaultDeviceProfile(): ClientDeviceProfile {
  return {
    viewport: { width: 1920, height: 915 },
    screen: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  };
}

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
 * Builds the canonical fetch client profile containing identity, device, and request values.
 *
 * The returned profile contains a complete set of client settings for regular HTTP requests.
 *
 * @returns A complete fetch client profile.
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
 * Builds HTTP request headers from a client profile.
 *
 * @returns A headers object ready to be passed to fetch().
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
 * @param profile - Client profile containing user agent and request preferences.
 * @param referer - Optional referrer URL to include in the Referer header.
 * @returns HTTP headers object ready for fetch() requests.
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

export async function resolveBrowserNavigatorContext(
  runtimeNavigator: BrowserNavigatorContext,
  userAgentCacheFile: string,
): Promise<BrowserNavigatorContext> {
  const cachedContext = await getCachedBrowserNavigatorContext(userAgentCacheFile);

  if (cachedContext) {
    return cachedContext;
  }

  const normalizedUserAgent = normalizeBrowserUserAgent(runtimeNavigator.userAgent);
  const source: BrowserUserAgentSource = runtimeNavigator.userAgent.includes('HeadlessChrome')
    ? BrowserUserAgentSource.HeadlessNormalized
    : BrowserUserAgentSource.HeadfulObserved;

  return saveBrowserNavigatorContext(
    userAgentCacheFile,
    {
      userAgent: normalizedUserAgent,
      platform: runtimeNavigator.platform,
      language: runtimeNavigator.language,
      vendor: runtimeNavigator.vendor,
    },
    source,
  );
}

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
