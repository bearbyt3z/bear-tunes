import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import UserAgent from 'user-agents';

import type { BrowserContextOptions } from 'playwright';

import type {
  BrowserIdentityCache,
  ClientProfile,
  FetchIdentityCache,
  FingerprintCacheEntry,
  IdentityCache,
  UAProfile,
} from './request-identity.types.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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

const CACHE_DIR = path.join(process.cwd(), '.cache');
const UA_CACHE_FILE = path.join(CACHE_DIR, 'user-agent.json');

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

/** Checks whether parsed JSON has the expected shared fingerprint cache entry shape. */
function isValidFingerprintCacheEntry(value: unknown): value is FingerprintCacheEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'userAgent' in value &&
    typeof value.userAgent === 'string' &&
    value.userAgent.length > 0 &&
    'createdAt' in value &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt)
  );
}

/** Checks whether parsed JSON has the expected fetch identity cache shape. */
function isValidFetchIdentityCache(value: unknown): value is FetchIdentityCache {
  return (
    isValidFingerprintCacheEntry(value) &&
    'profileName' in value &&
    typeof value.profileName === 'string' &&
    value.profileName.length > 0
  );
}

/** Checks whether parsed JSON has the expected browser identity cache shape. */
function isValidBrowserIdentityCache(value: unknown): value is BrowserIdentityCache {
  return (
    isValidFingerprintCacheEntry(value) &&
    'source' in value &&
    (value.source === 'headful-observed' ||
      value.source === 'headless-normalized')
  );
}

/** Checks whether parsed JSON has the expected identity cache container shape. */
function isValidIdentityCache(value: unknown): value is IdentityCache {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if ('fetch' in value && value.fetch !== undefined && !isValidFetchIdentityCache(value.fetch)) {
    return false;
  }

  if ('browser' in value && value.browser !== undefined && !isValidBrowserIdentityCache(value.browser)) {
    return false;
  }

  return true;
}

export async function getUserAgent(): Promise<string> {
  const now = Date.now();
  const cached = await readJsonFile<IdentityCache>(UA_CACHE_FILE);

  if (isValidIdentityCache(cached) && cached.fetch && cached.fetch.expiresAt > now) {
    return cached.fetch.userAgent;
  }

  const profile = pickRandomProfile();
  const userAgent = generateUserAgent(profile);

  const nextCache: IdentityCache = isValidIdentityCache(cached) ? cached : {};

  nextCache.fetch = {
    userAgent,
    profileName: profile.name,
    createdAt: now,
    expiresAt: now + randomTtlMs(7, 14),
  };

  await writeFileAtomic(UA_CACHE_FILE, JSON.stringify(nextCache, null, 2));

  return nextCache.fetch.userAgent;
}

/**
 * Builds the canonical client profile containing identity, device, and request values.
 *
 * The returned profile contains a complete set of client settings.
 *
 * @returns A complete client profile.
 */
export async function getClientProfile(): Promise<ClientProfile> {
  const userAgent = await getUserAgent();

  return {
    identity: {
      userAgent,
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
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      acceptLanguage: 'en-US,en;q=0.9',
      acceptEncoding: 'gzip, deflate, br',
      connection: 'keep-alive',
      upgradeInsecureRequests: '1',
    },
  };
}

/**
 * Builds HTTP request headers from a client profile.
 *
 * @returns A headers object ready to be passed to fetch().
 */
export function buildFetchHeaders(profile: ClientProfile): Record<string, string> {
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
 * Builds Playwright browser context options from a client profile.
 *
 * @returns A Playwright browser context options object.
 */
export function buildPlaywrightContextOptions(profile: ClientProfile): BrowserContextOptions {
  return {
    viewport: profile.device.viewport,
    screen: profile.device.screen,
    deviceScaleFactor: profile.device.deviceScaleFactor,
    isMobile: profile.device.isMobile,
    hasTouch: profile.device.hasTouch,
    // Locale is intentionally left unset because it triggers a Cloudflare captcha loop.
    // locale: profile.identity.locale,
    timezoneId: profile.identity.timezoneId,
    extraHTTPHeaders: {
      'Accept-Language': profile.request.acceptLanguage,
    },
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
  profile: ClientProfile,
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
 * Resolves the browser User-Agent to use for automated browser requests.
 *
 * @param runtimeUserAgent - Runtime User-Agent reported by the browser.
 * @returns Browser User-Agent string to apply before navigation.
 */
export function resolveBrowserUserAgent(runtimeUserAgent: string): string {
  return normalizeBrowserUserAgent(runtimeUserAgent);
}
