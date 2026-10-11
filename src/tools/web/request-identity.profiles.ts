import UserAgent from 'user-agents';

import { generateRandomInteger } from '../utils/random.js';

import type { UAProfile } from './request-identity.types.js';

/**
 * User-Agent patterns identifying Microsoft Edge variants across desktop,
 * Android, and iOS.
 */
const EDGE_USER_AGENT_PATTERNS: RegExp[] = [
  /EdgA?\//,
  /Edge\//,
  /EdgiOS\//,
];

/**
 * User-Agent patterns identifying Opera variants on desktop, Android, and iOS.
 */
const OPERA_USER_AGENT_PATTERNS: RegExp[] = [
  /OPR\//,
  /OPT\//,
];

/**
 * User-Agent patterns identifying Samsung Internet Browser.
 */
const SAMSUNG_BROWSER_USER_AGENT_PATTERNS: RegExp[] = [
  /SamsungBrowser\//,
];

/**
 * User-Agent pattern identifying Chrome on iOS.
 */
const CHROME_IOS_USER_AGENT_PATTERNS: RegExp[] = [
  /CriOS\//,
];

/**
 * User-Agent pattern identifying Firefox on iOS.
 */
const FIREFOX_IOS_USER_AGENT_PATTERNS: RegExp[] = [
  /FxiOS\//,
];

/**
 * Supported User-Agent profile templates used to generate request identities.
 */
export const UA_PROFILES: UAProfile[] = [
  {
    name: 'chrome-windows',
    match: /Chrome\//,
    exclude: [
      ...EDGE_USER_AGENT_PATTERNS,
      ...OPERA_USER_AGENT_PATTERNS,
      ...SAMSUNG_BROWSER_USER_AGENT_PATTERNS,
    ],
    filter: { deviceCategory: 'desktop', platform: 'Win32' },
  },
  {
    name: 'firefox-windows',
    match: /Firefox/,
    filter: { deviceCategory: 'desktop', platform: 'Win32' },
  },
  {
    name: 'safari-macos',
    match: /Version\/[\d.]+ Safari\//,
    filter: { deviceCategory: 'desktop', platform: 'MacIntel' },
  },
  {
    name: 'chrome-mobile',
    match: /Chrome\/|CriOS\//,
    exclude: [
      ...EDGE_USER_AGENT_PATTERNS,
      ...OPERA_USER_AGENT_PATTERNS,
      ...SAMSUNG_BROWSER_USER_AGENT_PATTERNS,
      ...FIREFOX_IOS_USER_AGENT_PATTERNS,
    ],
    filter: { deviceCategory: 'mobile' },
  },
  {
    name: 'safari-mobile',
    match: /Version\/.*Mobile\/.*Safari\//,
    exclude: [
      ...EDGE_USER_AGENT_PATTERNS,
      ...OPERA_USER_AGENT_PATTERNS,
      ...SAMSUNG_BROWSER_USER_AGENT_PATTERNS,
      ...CHROME_IOS_USER_AGENT_PATTERNS,
      ...FIREFOX_IOS_USER_AGENT_PATTERNS,
    ],
    filter: { deviceCategory: 'mobile' },
  },
];

/**
 * Selects one configured User-Agent profile template.
 *
 * @returns Selected User-Agent profile template.
 */
export function pickRandomProfile(): UAProfile {
  return UA_PROFILES[generateRandomInteger(0, UA_PROFILES.length - 1)];
}

/**
 * Generates a User-Agent string matching the profile's selection criteria.
 *
 * Applies the profile's match pattern and device filters while excluding
 * candidates that match any of the profile's exclusion patterns.
 *
 * @param profile - User-Agent profile template defining the selection criteria.
 * @returns Generated User-Agent string matching the profile criteria.
 */
export function generateUserAgent(profile: UAProfile): string {
  const excludedPatterns = profile.exclude ?? [];

  return new UserAgent([
    profile.match,
    profile.filter,
    (data: { userAgent: string }): boolean =>
      !excludedPatterns.some((pattern) => pattern.test(data.userAgent)),
  ]).toString();
}
