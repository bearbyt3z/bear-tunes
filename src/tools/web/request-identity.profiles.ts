import UserAgent from 'user-agents';

import { generateRandomInteger } from '../utils/random.js';

import type { UAProfile } from './request-identity.types.js';

/**
 * Supported User-Agent profile templates used to generate request identities.
 */
export const UA_PROFILES: UAProfile[] = [
  {
    name: 'chrome-windows',
    match: /Chrome\/(?!.*(?:EdgA?|Edge|OPR|SamsungBrowser)\/)/,
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
    match: /(?:Chrome|CriOS)\/(?!.*(?:EdgA?|Edge|OPR|SamsungBrowser)\/)/,
    filter: { deviceCategory: 'mobile' },
  },
  {
    name: 'safari-mobile',
    match: /^(?!.*(?:EdgiOS|CriOS|FxiOS|OPT)\/).*Version\/.*Mobile\/.*Safari\//,
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
 * Generates a concrete User-Agent string from a profile template.
 *
 * @param profile - User-Agent profile template used for generation.
 * @returns Generated User-Agent string.
 */
export function generateUserAgent(profile: UAProfile): string {
  return new UserAgent([profile.match, profile.filter]).toString();
}
