import UserAgent, {
  type Filter,
  type UserAgentData,
} from 'user-agents';

import { generateRandomInteger } from '../utils/random.js';

import type { UAProfile } from './request-identity.types.js';

/**
 * Default maximum number of top-ranked User-Agent candidates to consider.
 */
const TOP_USER_AGENT_CANDIDATES_COUNT = 10;

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
 * Returns the most common unique User-Agent candidates matching the profile.
 *
 * Candidates are ordered by frequency. Duplicate User-Agent strings are
 * removed, and the result is limited to the specified number of candidates.
 *
 * @param profile - User-Agent profile defining the selection criteria.
 * @param count - Maximum number of unique candidates to return. Defaults to
 *   {@link TOP_USER_AGENT_CANDIDATES_COUNT}.
 * @returns Unique User-Agent candidates ordered by frequency.
 */
export function getTopUserAgentCandidates(
  profile: UAProfile,
  count = TOP_USER_AGENT_CANDIDATES_COUNT,
): UserAgentData[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('Candidate count must be a non-negative integer.');
  }

  if (count === 0) {
    return [];
  }

  // Passing undefined as count returns all entries matching the supplied filters.
  const candidates = UserAgent.top(
    undefined,
    toUserAgentFilters(profile),
  );

  const uniqueCandidates = new Map<string, UserAgentData>();

  for (const candidate of candidates) {
    if (!uniqueCandidates.has(candidate.userAgent)) {
      uniqueCandidates.set(candidate.userAgent, candidate);
    }

    if (uniqueCandidates.size >= count) {
      break;
    }
  }

  return [...uniqueCandidates.values()];
}

/**
 * Randomly selects a User-Agent candidate matching the supplied profile.
 *
 * Selection is uniform across the candidates returned by
 * {@link getTopUserAgentCandidates}.
 *
 * @param profile - User-Agent profile defining the selection criteria.
 * @returns Randomly selected User-Agent candidate.
 * @throws {Error} If no matching candidates are found or a candidate
 *   cannot be selected.
 */
export function generateUserAgent(profile: UAProfile): UserAgentData {
  const candidates = getTopUserAgentCandidates(profile);

  if (candidates.length === 0) {
    throw new Error(
      `No User-Agent candidates found for profile "${profile.name}".`,
    );
  }

  const index = generateRandomInteger(0, candidates.length - 1);
  const candidate = candidates[index];

  if (!candidate) {
    throw new Error(
      `Failed to select a User-Agent for profile "${profile.name}".`,
    );
  }

  return candidate;
}
