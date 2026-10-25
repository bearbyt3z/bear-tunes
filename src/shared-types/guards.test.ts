import { describe, expect, it } from 'vitest';

import {
  getBasicTrackIdentificationStatus,
  hasBasicTrackIdentificationData,
} from './guards.js';

describe('getBasicTrackIdentificationStatus', () => {
  it.each([
    {
      description: 'a title and artists',
      track: {
        title: 'Track Title',
        artists: ['Artist One'],
      },
      expected: {
        hasTitle: true,
        hasArtists: true,
      },
    },
    {
      description: 'a missing title',
      track: {
        artists: ['Artist One'],
      },
      expected: {
        hasTitle: false,
        hasArtists: true,
      },
    },
    {
      description: 'an empty title',
      track: {
        title: '',
        artists: ['Artist One'],
      },
      expected: {
        hasTitle: false,
        hasArtists: true,
      },
    },
    {
      description: 'a whitespace-only title',
      track: {
        title: '  \t\n ',
        artists: ['Artist One'],
      },
      expected: {
        hasTitle: false,
        hasArtists: true,
      },
    },
    {
      description: 'a missing artists array',
      track: {
        title: 'Track Title',
      },
      expected: {
        hasTitle: true,
        hasArtists: false,
      },
    },
    {
      description: 'an empty artists array',
      track: {
        title: 'Track Title',
        artists: [],
      },
      expected: {
        hasTitle: true,
        hasArtists: false,
      },
    },
    {
      description: 'a missing title and an empty artists array',
      track: {
        artists: [],
      },
      expected: {
        hasTitle: false,
        hasArtists: false,
      },
    },
  ])('reports the correct status for $description', ({ track, expected }) => {
    expect(getBasicTrackIdentificationStatus(track)).toEqual(expected);
  });
});

describe('hasBasicTrackIdentificationData', () => {
  it('returns true when the title and artists are present', () => {
    expect(
      hasBasicTrackIdentificationData({
        title: 'Track Title',
        artists: ['Artist One'],
      }),
    ).toBe(true);
  });

  it.each([
    {
      description: 'the title is missing',
      track: {
        artists: ['Artist One'],
      },
    },
    {
      description: 'the title is empty',
      track: {
        title: '',
        artists: ['Artist One'],
      },
    },
    {
      description: 'the title contains only whitespace',
      track: {
        title: '  ',
        artists: ['Artist One'],
      },
    },
    {
      description: 'the artists array is missing',
      track: {
        title: 'Track Title',
      },
    },
    {
      description: 'the artists array is empty',
      track: {
        title: 'Track Title',
        artists: [],
      },
    },
  ])('returns false when $description', ({ track }) => {
    expect(hasBasicTrackIdentificationData(track)).toBe(false);
  });
});
