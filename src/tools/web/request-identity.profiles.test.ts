import { beforeEach, describe, expect, it, vi } from 'vitest';

import UserAgent, {
  type Filter,
  type UserAgentData,
} from 'user-agents';

import { generateRandomInteger } from '../utils/random.js';

import {
  generateUserAgent,
  getTopUserAgentCandidates,
  pickRandomProfile,
  UA_PROFILES,
} from './request-identity.profiles.js';

import type { UAProfile } from './request-identity.types.js';

vi.mock('user-agents', () => ({
  default: {
    top: vi.fn(),
  },
}));

vi.mock('../utils/random.js', () => ({
  generateRandomInteger: vi.fn(),
}));

const mockedUserAgentTop = vi.mocked(UserAgent.top);
const mockedGenerateRandomInteger = vi.mocked(generateRandomInteger);

const WINDOWS_CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const WINDOWS_FIREFOX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const MACOS_SAFARI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_CHROME_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const IOS_CHROME_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1';
const IOS_SAFARI_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

const MATCHING_USER_AGENT_CASES = [
  {
    profileName: 'chrome-windows',
    userAgent: WINDOWS_CHROME_USER_AGENT,
  },
  {
    profileName: 'firefox-windows',
    userAgent: WINDOWS_FIREFOX_USER_AGENT,
  },
  {
    profileName: 'safari-macos',
    userAgent: MACOS_SAFARI_USER_AGENT,
  },
  {
    profileName: 'chrome-mobile',
    userAgent: ANDROID_CHROME_USER_AGENT,
  },
  {
    profileName: 'chrome-mobile',
    userAgent: IOS_CHROME_USER_AGENT,
  },
  {
    profileName: 'safari-mobile',
    userAgent: IOS_SAFARI_USER_AGENT,
  },
] satisfies { profileName: string; userAgent: string }[];

const EXCLUDED_USER_AGENT_CASES = [
  {
    profileName: 'chrome-windows',
    userAgent: `${WINDOWS_CHROME_USER_AGENT} Edg/131.0.0.0`,
  },
  {
    profileName: 'chrome-windows',
    userAgent: `${WINDOWS_CHROME_USER_AGENT} Edge/18.19041`,
  },
  {
    profileName: 'chrome-windows',
    userAgent: `${WINDOWS_CHROME_USER_AGENT} OPR/117.0.0.0`,
  },
  {
    profileName: 'chrome-windows',
    userAgent: `${WINDOWS_CHROME_USER_AGENT} SamsungBrowser/28.0`,
  },
  {
    profileName: 'chrome-mobile',
    userAgent: `${ANDROID_CHROME_USER_AGENT} EdgA/131.0.0.0`,
  },
  {
    profileName: 'chrome-mobile',
    userAgent: `${ANDROID_CHROME_USER_AGENT} OPT/86.0.0.0`,
  },
  {
    profileName: 'chrome-mobile',
    userAgent: `${ANDROID_CHROME_USER_AGENT} SamsungBrowser/28.0`,
  },
  {
    profileName: 'chrome-mobile',
    userAgent: `${IOS_CHROME_USER_AGENT} FxiOS/131.0`,
  },
  {
    profileName: 'safari-mobile',
    userAgent: `${IOS_SAFARI_USER_AGENT} EdgiOS/131.0.0.0`,
  },
  {
    profileName: 'safari-mobile',
    userAgent: `${IOS_SAFARI_USER_AGENT} OPR/86.0.0.0`,
  },
  {
    profileName: 'safari-mobile',
    userAgent: `${IOS_SAFARI_USER_AGENT} SamsungBrowser/28.0`,
  },
  {
    profileName: 'safari-mobile',
    userAgent: `${IOS_SAFARI_USER_AGENT} CriOS/131.0.0.0`,
  },
  {
    profileName: 'safari-mobile',
    userAgent: `${IOS_SAFARI_USER_AGENT} FxiOS/131.0`,
  },
] satisfies { profileName: string; userAgent: string }[];

function getProfile(name: string): UAProfile {
  const profile = UA_PROFILES.find((item) => item.name === name);

  if (!profile) {
    throw new Error(`Unknown User-Agent profile: "${name}".`);
  }

  return profile;
}

function createUserAgentData(userAgent: string): UserAgentData {
  return {
    appName: 'Netscape',
    connection: {
      downlink: 10,
      effectiveType: '4g',
      rtt: 50,
    },
    platform: 'Win32',
    pluginsLength: 3,
    screenHeight: 1080,
    screenWidth: 1920,
    userAgent,
    vendor: 'Google Inc.',
    weight: 1,
  };
}

function isFilterArray(
  filter: Filter<UserAgentData> | undefined,
): filter is Filter<UserAgentData>[] {
  return Array.isArray(filter);
}

function getLastTopCall(): {
  count: number | undefined;
  filters: Filter<UserAgentData>[];
} {
  const call = mockedUserAgentTop.mock.calls.at(-1);

  if (!call || !isFilterArray(call[1])) {
    throw new Error('UserAgent.top was not called with a filter array.');
  }

  return {
    count: call[0],
    filters: call[1],
  };
}

function isUserAgentPredicate(
  filter: Filter<UserAgentData>,
): filter is (data: UserAgentData) => boolean {
  return typeof filter === 'function';
}

function getExclusionPredicate(
  profile: UAProfile,
): (data: UserAgentData) => boolean {
  mockedUserAgentTop.mockReturnValue([
    createUserAgentData('Mozilla/5.0 ExampleBrowser/1.0'),
  ]);
  mockedGenerateRandomInteger.mockReturnValue(0);

  generateUserAgent(profile);

  const predicate = getLastTopCall().filters.find(isUserAgentPredicate);

  if (!predicate) {
    throw new Error('No User-Agent exclusion predicate was configured.');
  }

  return predicate;
}

beforeEach(() => {
  mockedUserAgentTop.mockReset();
  mockedGenerateRandomInteger.mockReset();

  mockedUserAgentTop.mockReturnValue([]);
  mockedGenerateRandomInteger.mockReturnValue(0);
});

describe('UA_PROFILES', () => {
  it('defines profiles with unique names', () => {
    const names = UA_PROFILES.map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
  });

  it.each(MATCHING_USER_AGENT_CASES)(
    'matches the expected User-Agent for the $profileName profile',
    ({ profileName, userAgent }) => {
      expect(getProfile(profileName).match.test(userAgent)).toBe(true);
      expect(getProfile(profileName).match.test('ExampleBrowser/1.0')).toBe(
        false,
      );
    },
  );
});

describe('pickRandomProfile', () => {
  it.each(
    UA_PROFILES.map((profile, index) => ({ profile, index })),
  )('returns the profile at selected index $index', ({ profile, index }) => {
    mockedGenerateRandomInteger.mockReturnValue(index);

    expect(pickRandomProfile()).toBe(profile);
    expect(mockedGenerateRandomInteger).toHaveBeenCalledWith(
      0,
      UA_PROFILES.length - 1,
    );
    expect(mockedGenerateRandomInteger).toHaveBeenCalledTimes(1);
  });
});

describe('User-Agent filters', () => {
  it.each(UA_PROFILES)(
    'passes the configured filters to UserAgent.top for the $name profile',
    (profile) => {
      mockedUserAgentTop.mockReturnValue([
        createUserAgentData('Mozilla/5.0 ExampleBrowser/1.0'),
      ]);

      generateUserAgent(profile);

      const { count, filters } = getLastTopCall();

      expect(count).toBeUndefined();
      expect(filters).toContain(profile.match);
      expect(filters).toContainEqual({
        deviceCategory: profile.filter.deviceCategory,
      });

      if (profile.filter.platform !== undefined) {
        expect(filters).toContainEqual({
          platform: profile.filter.platform,
        });
      }

      expect(filters).toHaveLength(
        profile.filter.platform === undefined ? 3 : 4,
      );
      expect(filters.filter(isUserAgentPredicate)).toHaveLength(1);
      expect(mockedUserAgentTop).toHaveBeenCalledTimes(1);
    },
  );
});

describe('User-Agent exclusion filters', () => {
  it.each(EXCLUDED_USER_AGENT_CASES)(
    'rejects an excluded browser candidate for the $profileName profile',
    ({ profileName, userAgent }) => {
      const predicate = getExclusionPredicate(getProfile(profileName));

      expect(predicate(createUserAgentData(userAgent))).toBe(false);
    },
  );

  it.each(UA_PROFILES)(
    'allows a candidate without an excluded browser token for the $name profile',
    (profile) => {
      const predicate = getExclusionPredicate(profile);

      expect(
        predicate(createUserAgentData('Mozilla/5.0 ExampleBrowser/1.0')),
      ).toBe(true);
    },
  );

  it('allows Chrome on iOS in the Chrome mobile profile', () => {
    const profile = getProfile('chrome-mobile');
    const candidate = createUserAgentData(IOS_CHROME_USER_AGENT);

    expect(getExclusionPredicate(profile)(candidate)).toBe(true);
  });
});

describe('getTopUserAgentCandidates', () => {
  it('returns unique candidates in frequency order up to the requested count', () => {
    const candidates = [
      createUserAgentData('First/1.0'),
      createUserAgentData('First/1.0'),
      createUserAgentData('Second/2.0'),
      createUserAgentData('Third/3.0'),
    ];

    mockedUserAgentTop.mockReturnValue(candidates);

    const result = getTopUserAgentCandidates(
      getProfile('chrome-windows'),
      2,
    );

    expect(result.map(({ userAgent }) => userAgent)).toEqual([
      'First/1.0',
      'Second/2.0',
    ]);

    expect(mockedUserAgentTop).toHaveBeenCalledWith(
      undefined,
      expect.any(Array),
    );
  });

  it.each([-1, 1.5])(
    'throws a RangeError when the candidate count is %s',
    (count) => {
      expect(() =>
        getTopUserAgentCandidates(getProfile('chrome-windows'), count),
      ).toThrow(RangeError);

      expect(mockedUserAgentTop).not.toHaveBeenCalled();
    },
  );

  it('returns an empty array when the candidate count is zero', () => {
    expect(
      getTopUserAgentCandidates(getProfile('chrome-windows'), 0),
    ).toEqual([]);

    expect(mockedUserAgentTop).not.toHaveBeenCalled();
  });
});

describe('generateUserAgent', () => {
  it.each([0, 1, 2])(
    'returns the candidate selected at index %i',
    (index) => {
      const candidates = [
        createUserAgentData('First/1.0'),
        createUserAgentData('Second/2.0'),
        createUserAgentData('Third/3.0'),
      ];
      const profile = getProfile('chrome-windows');

      mockedUserAgentTop.mockReturnValue(candidates);
      mockedGenerateRandomInteger.mockReturnValue(index);

      expect(generateUserAgent(profile)).toBe(candidates[index]);
      expect(mockedUserAgentTop).toHaveBeenCalledWith(
        undefined,
        expect.any(Array),
      );
      expect(mockedUserAgentTop).toHaveBeenCalledTimes(1);
      expect(mockedGenerateRandomInteger).toHaveBeenCalledWith(
        0,
        candidates.length - 1,
      );
      expect(mockedGenerateRandomInteger).toHaveBeenCalledTimes(1);
    },
  );

  it('throws when no matching candidates are available', () => {
    const profile = getProfile('chrome-windows');

    mockedUserAgentTop.mockReturnValue([]);

    expect(() => generateUserAgent(profile)).toThrow(
      'No User-Agent candidates found for profile "chrome-windows".',
    );
    expect(mockedGenerateRandomInteger).not.toHaveBeenCalled();
  });

  it('throws when the selected index does not identify a candidate', () => {
    const profile = getProfile('firefox-windows');

    mockedUserAgentTop.mockReturnValue([
      createUserAgentData('Only/1.0'),
    ]);
    mockedGenerateRandomInteger.mockReturnValue(1);

    expect(() => generateUserAgent(profile)).toThrow(
      'Failed to select a User-Agent for profile "firefox-windows".',
    );
    expect(mockedGenerateRandomInteger).toHaveBeenCalledWith(0, 0);
    expect(mockedGenerateRandomInteger).toHaveBeenCalledTimes(1);
  });
});
