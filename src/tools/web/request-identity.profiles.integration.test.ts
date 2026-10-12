import { describe, expect, it } from 'vitest';

import {
  generateUserAgent,
  UA_PROFILES,
} from './request-identity.profiles.js';

describe('generateUserAgent integration', () => {
  it.each(UA_PROFILES)(
    'generates a valid User-Agent for the "$name" profile',
    (profile) => {
      const candidate = generateUserAgent(profile);

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
    },
  );
});
