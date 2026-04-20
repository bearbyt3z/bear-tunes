import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import UserAgent from 'user-agents';

import type { BrowserContextOptions } from 'playwright';

import type { UACache, UAProfile, ClientProfile } from './request-identity.types.js';

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

/** Checks whether parsed JSON has the expected cached User-Agent shape. */
function isValidUACache(value: unknown): value is UACache {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const cache = value as Record<string, unknown>;

  return (
    typeof cache.userAgent === 'string' &&
    cache.userAgent.length > 0 &&
    typeof cache.profileName === 'string' &&
    typeof cache.createdAt === 'number' &&
    Number.isFinite(cache.createdAt) &&
    typeof cache.expiresAt === 'number' &&
    Number.isFinite(cache.expiresAt)
  );
}

/**
 * Returns the current cached User-Agent string or generates a new one.
 *
 * The generated value is persisted on disk and reused until its cache entry
 * expires. This keeps repeated requests within a short time window consistent
 * instead of rotating the User-Agent on every fetch.
 *
 * @returns A cached or newly generated User-Agent string.
 */
export async function getUserAgent(): Promise<string> {
  const now = Date.now();
  const cached = await readJsonFile<unknown>(UA_CACHE_FILE);

  if (isValidUACache(cached) && cached.expiresAt > now) {
    return cached.userAgent;
  }

  const profile = pickRandomProfile();
  const userAgent = generateUserAgent(profile);

  const cache: UACache = {
    userAgent,
    profileName: profile.name,
    createdAt: now,
    expiresAt: now + randomTtlMs(7, 14),
  };

  await writeFileAtomic(UA_CACHE_FILE, JSON.stringify(cache, null, 2));

  return cache.userAgent;
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
    locale: profile.identity.locale,
    timezoneId: profile.identity.timezoneId,
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
