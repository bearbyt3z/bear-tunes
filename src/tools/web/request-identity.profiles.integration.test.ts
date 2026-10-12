import { describe, expect, it } from 'vitest';

import type { UserAgentData } from 'user-agents';

import {
  generateUserAgent,
  getTopUserAgentCandidates,
  UA_PROFILES,
} from './request-identity.profiles.js';

import type { UAProfile } from './request-identity.types.js';

function expectCandidateToMatchProfile(
  candidate: UserAgentData,
  profile: UAProfile,
): void {
  expect(candidate.userAgent).toBeTruthy();
  expect(profile.match.test(candidate.userAgent)).toBe(true);

  // `user-agents` does not declare `deviceCategory` in its `UserAgentData` type,
  // so verify the runtime property with `toHaveProperty` instead of dot notation.
  expect(candidate).toHaveProperty(
    'deviceCategory',
    profile.filter.deviceCategory,
  );

  if (profile.filter.platform !== undefined) {
    expect(candidate.platform).toBe(profile.filter.platform);
  }

  for (const pattern of profile.exclude ?? []) {
    expect(candidate.userAgent).not.toMatch(pattern);
  }
}

type CandidateTestCase =
  | {
    profile: UAProfile;
    candidates: UserAgentData[];
    candidateCount: number;
    uniqueCandidateCount: number;
  }
  | {
    profile: UAProfile;
    candidateCount: 'unavailable';
    uniqueCandidateCount: 'unavailable';
    error: unknown;
  };

// Vitest resolves test titles during collection, so candidate counts must
// be determined before the parameterized tests are registered.
const candidateTestCases: CandidateTestCase[] = UA_PROFILES.map(
  (profile): CandidateTestCase => {
    try {
      const candidates = getTopUserAgentCandidates(profile);
      const uniqueCandidateCount = new Set(
        candidates.map(({ userAgent }) => userAgent),
      ).size;

      return {
        profile,
        candidates,
        candidateCount: candidates.length,
        uniqueCandidateCount,
      };
    } catch (error: unknown) {
      return {
        profile,
        candidateCount: 'unavailable',
        uniqueCandidateCount: 'unavailable',
        error,
      };
    }
  },
);

describe('getTopUserAgentCandidates integration', () => {
  it.each(candidateTestCases)(
    'returns $candidateCount valid candidates ($uniqueCandidateCount unique User-Agent strings) for the "$profile.name" profile',
    (testCase) => {
      if ('error' in testCase) {
        throw testCase.error;
      }

      const {
        profile,
        candidates,
        candidateCount,
        uniqueCandidateCount,
      } = testCase;

      expect(candidates).toHaveLength(candidateCount);
      expect(candidateCount).toBeGreaterThan(0);
      expect(uniqueCandidateCount).toBe(candidateCount);

      for (const candidate of candidates) {
        expectCandidateToMatchProfile(candidate, profile);
      }
    },
  );
});

describe('generateUserAgent integration', () => {
  it.each(UA_PROFILES)(
    'generates a valid User-Agent for the "$name" profile',
    (profile) => {
      const candidate = generateUserAgent(profile);

      expectCandidateToMatchProfile(candidate, profile);
    },
  );
});
