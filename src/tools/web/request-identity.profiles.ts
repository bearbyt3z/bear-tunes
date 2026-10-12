import UserAgent, {
  type Filter,
  type UserAgentData,
} from 'user-agents';

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
 * Converts a User-Agent profile into filters supported by `user-agents`.
 *
 * The resulting filters require a candidate to match `profile.match`, belong
 * to the configured device category, optionally use the configured platform,
 * and not match any configured exclusion pattern.
 *
 * @param profile - User-Agent profile template to convert.
 * @returns Filters accepted by the `UserAgent` constructor.
 */
function toUserAgentFilters(profile: UAProfile): Filter<UserAgentData>[] {
  const excludedPatterns = profile.exclude ?? [];

  const filters: Filter<UserAgentData>[] = [
    profile.match,
    {
      deviceCategory: profile.filter.deviceCategory,
    },
  ];

  if (profile.filter.platform !== undefined) {
    filters.push({
      platform: profile.filter.platform,
    });
  }

  filters.push(
    (data: UserAgentData): boolean =>
      !excludedPatterns.some((pattern) => pattern.test(data.userAgent)),
  );

  return filters;
}

/**
 * Creates a reusable User-Agent generator configured for the supplied profile.
 *
 * The generator applies the profile's match pattern and device filters while
 * excluding candidates that match any of the profile's exclusion patterns.
 *
 * @param profile - User-Agent profile template defining the selection criteria.
 * @returns Configured User-Agent generator.
 */
export function createUserAgentGenerator(profile: UAProfile): UserAgent {
  return new UserAgent(toUserAgentFilters(profile));
}

/**
 * Generates a User-Agent string matching the profile's selection criteria.
 *
 * @param profile - User-Agent profile template defining the selection criteria.
 * @returns Generated User-Agent string matching the profile criteria.
 */
export function generateUserAgent(profile: UAProfile): string {
  return createUserAgentGenerator(profile).toString();
}
