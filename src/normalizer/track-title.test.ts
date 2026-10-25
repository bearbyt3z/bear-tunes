import { describe, expect, it } from 'vitest';

import {
  forceTrackTitleRadioEdit,
  normalizeTrackTitle,
} from './track-title.js';

describe('normalizeTrackTitle', () => {
  it.each([
    undefined,
    '',
    '   ',
    '\t\n',
  ])('returns an empty string for a missing or blank title (%j)', (title) => {
    expect(normalizeTrackTitle(title)).toBe('');
  });

  it('trims the title and appends a normalized mix name', () => {
    expect(
      normalizeTrackTitle('  Track Title  ', '  original  '),
    ).toBe('Track Title (Original Mix)');
  });

  describe('featuring notation', () => {
    it('normalizes the feat marker and wraps it in parentheses', () => {
      expect(
        normalizeTrackTitle('Title of a Track feat Someone'),
      ).toBe('Title of a Track (feat. Someone)');
    });

    it('normalizes feat capitalization, punctuation, and whitespace', () => {
      expect(
        normalizeTrackTitle('Title FEAT.\tSomeone'),
      ).toBe('Title (feat. Someone)');
    });

    it('preserves existing featuring parentheses', () => {
      expect(
        normalizeTrackTitle('Title (Feat Someone)'),
      ).toBe('Title (feat. Someone)');
    });

    it('handles whitespace before an already parenthesized feat marker', () => {
      expect(
        normalizeTrackTitle('Title (  Feat  Someone )'),
      ).toBe('Title (feat. Someone)');
    });

    it('leaves an incomplete feat marker unchanged', () => {
      expect(
        normalizeTrackTitle('Title feat'),
      ).toBe('Title feat');
    });

    it.each([
      {
        input: 'Title feat. Guest One feat. Guest Two',
        expected: 'Title (feat. Guest One, Guest Two)',
      },
      {
        input: 'Title feat Guest One feat Guest Two',
        expected: 'Title (feat. Guest One, Guest Two)',
      },
      {
        input: 'Title feat. Guest One feat Guest Two feat. Guest Three',
        expected: 'Title (feat. Guest One, Guest Two, Guest Three)',
      },
      {
        input: 'Title feat Guest One feat. Guest Two feat Guest Three',
        expected: 'Title (feat. Guest One, Guest Two, Guest Three)',
      },
    ])(
      'combines multiple featuring markers in "$input"',
      ({ input, expected }) => {
        expect(normalizeTrackTitle(input)).toBe(expected);
      },
    );

    it('combines multiple featuring markers inside existing parentheses', () => {
      expect(
        normalizeTrackTitle('Title (feat. Guest One feat Guest Two)'),
      ).toBe('Title (feat. Guest One, Guest Two)');
    });

    it('preserves already normalized featuring notation with multiple artists', () => {
      const title = 'Title (feat. Guest One, Guest Two)';

      expect(normalizeTrackTitle(title)).toBe(title);
    });
  });

  describe('spacing and parentheses', () => {
    it('collapses repeated whitespace and normalizes spaces around parentheses', () => {
      expect(
        normalizeTrackTitle('Track   Name (  One  )(  Two  )'),
      ).toBe('Track Name (One) (Two)');
    });

    it('converts separate square-bracketed fragments to parentheses', () => {
      expect(
        normalizeTrackTitle(
          'Track   Name [Artist Extended Remix] [Radio Edit]',
        ),
      ).toBe('Track Name (Artist Extended Remix) (Radio Edit)');
    });

    it('collapses doubled parentheses around separate fragments', () => {
      expect(
        normalizeTrackTitle(
          'Track ((Artist Extended Remix)) ((Radio Edit))',
        ),
      ).toBe('Track (Artist Extended Remix) (Radio Edit)');
    });
  });

  describe('mix and remix names', () => {
    it.each([
      {
        input: 'Track Title (Original)',
        expected: 'Track Title (Original Mix)',
      },
      {
        input: 'Track Title (Extended)',
        expected: 'Track Title (Extended Mix)',
      },
      {
        input: 'Track Title (Instrumental)',
        expected: 'Track Title (Instrumental Mix)',
      },
      {
        input: 'Track Title (Dub)',
        expected: 'Track Title (Dub Mix)',
      },
    ])('adds the missing Mix suffix to "$input"', ({ input, expected }) => {
      expect(normalizeTrackTitle(input)).toBe(expected);
    });

    it('replaces the RMX shorthand inside parentheses with Remix', () => {
      expect(
        normalizeTrackTitle('SWEAT DREAMS (Artist RMX)'),
      ).toBe('SWEAT DREAMS (Artist Remix)');
    });

    it('preserves the RMX shorthand in the track title', () => {
      expect(
        normalizeTrackTitle('SWEAT DREAMS RMX (Original Mix)'),
      ).toBe('SWEAT DREAMS RMX (Original Mix)');
    });

    it('removes a duplicated mix fragment', () => {
      expect(
        normalizeTrackTitle('Track Title (Original Mix)', 'Original'),
      ).toBe('Track Title (Original Mix)');
    });

    it('simplifies an artist remix followed by Original Mix', () => {
      expect(
        normalizeTrackTitle(
          'Track Title - Artist Remix (Original Mix)',
        ),
      ).toBe('Track Title (Artist Remix)');
    });

    it('separates nested remix parentheses', () => {
      expect(
        normalizeTrackTitle(
          'Track Title (FirstArtist Remix (SecondArtist Re-Edit))',
        ),
      ).toBe(
        'Track Title (FirstArtist Remix) (SecondArtist Re-Edit)',
      );
    });
  });

  it.each([
    {
      input: 'Track Title (original mix)',
      expected: 'Track Title (Original Mix)',
    },
    {
      input: 'Track Title (extended mix)',
      expected: 'Track Title (Extended Mix)',
    },
    {
      input: 'Track Title (instrumental mix)',
      expected: 'Track Title (Instrumental Mix)',
    },
    {
      input: 'Track Title (dub mix)',
      expected: 'Track Title (Dub Mix)',
    },
    {
      input: 'Track Title (radio edit)',
      expected: 'Track Title (Radio Edit)',
    },
    {
      input: 'Track Title (Artist remix)',
      expected: 'Track Title (Artist Remix)',
    },
    {
      input: 'Track Title (demo)',
      expected: 'Track Title (Demo)',
    },
    {
      input: 'Track Title (tape)',
      expected: 'Track Title (Tape)',
    },
  ])(
    'normalizes keyword capitalization in "$input"',
    ({ input, expected }) => {
      expect(normalizeTrackTitle(input)).toBe(expected);
    },
  );

  it('normalizes supported typographic characters', () => {
    expect(
      normalizeTrackTitle('Artist’s Song – Live'),
    ).toBe("Artist's Song - Live");
  });

  it('does not append a mix name when it is blank', () => {
    expect(
      normalizeTrackTitle('Track Title', '   '),
    ).toBe('Track Title');
  });
});

describe('forceTrackTitleRadioEdit', () => {
  it('returns the title unchanged when Radio Edit is already present', () => {
    const title = 'Track Title (Radio Edit)';

    expect(forceTrackTitleRadioEdit(title)).toBe(title);
  });

  it.each([
    {
      input: 'Track Title (Original Mix)',
      expected: 'Track Title (Radio Edit)',
    },
    {
      input: 'Track Title (Extended Mix)',
      expected: 'Track Title (Radio Edit)',
    },
  ])('replaces the mix marker in "$input"', ({ input, expected }) => {
    expect(forceTrackTitleRadioEdit(input)).toBe(expected);
  });

  it('appends Radio Edit when no replaceable mix marker is present', () => {
    expect(
      forceTrackTitleRadioEdit('Track Title'),
    ).toBe('Track Title (Radio Edit)');
  });

  it('appends Radio Edit when a different mix marker is present', () => {
    expect(
      forceTrackTitleRadioEdit('Track Title (Instrumental Mix)'),
    ).toBe('Track Title (Instrumental Mix) (Radio Edit)');
  });
});
