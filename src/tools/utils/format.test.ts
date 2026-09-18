import { describe, expect, it } from 'vitest';

import {
  formatCommandArgumentForLogging,
  formatCommandArgumentsForLogging,
  formatLocalDateToIsoDateString,
  getFirstLine,
  roundToDecimalPlaces,
  secondsToTimeFormat,
  slugify,
} from '#tools';

describe('formatLocalDateToIsoDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const date = new Date(2024, 6, 15, 12, 30, 45);

    expect(formatLocalDateToIsoDateString(date)).toBe('2024-07-15');
  });

  it('zero-pads years to four digits', () => {
    const date = new Date(0);
    date.setFullYear(5, 0, 1);

    expect(formatLocalDateToIsoDateString(date)).toBe('0005-01-01');
  });

  it('zero-pads single-digit months and days', () => {
    const date = new Date(2024, 0, 5, 12, 30, 45);

    expect(formatLocalDateToIsoDateString(date)).toBe('2024-01-05');
  });

  it('uses the date values from the local time zone', () => {
    const date = new Date(2024, 11, 31, 23, 59, 59);

    expect(formatLocalDateToIsoDateString(date)).toBe('2024-12-31');
  });

  it('formats leap day correctly', () => {
    const date = new Date(2024, 1, 29, 12, 30, 45);

    expect(formatLocalDateToIsoDateString(date)).toBe('2024-02-29');
  });

  it('throws a TypeError for an invalid date', () => {
    expect(() => formatLocalDateToIsoDateString(new Date(NaN))).toThrow(
      new TypeError('date must be a valid Date.'),
    );
  });
});

describe('formatCommandArgumentForLogging', () => {
  it('returns arguments without special characters unchanged', () => {
    expect(formatCommandArgumentForLogging('artist-name')).toBe('artist-name');
    expect(formatCommandArgumentForLogging('/music/artist/album')).toBe(
      '/music/artist/album',
    );
    expect(formatCommandArgumentForLogging('track_01.flac')).toBe(
      'track_01.flac',
    );
  });

  it('JSON-serializes arguments containing whitespace', () => {
    expect(formatCommandArgumentForLogging('Artist Name')).toBe(
      '"Artist Name"',
    );
    expect(formatCommandArgumentForLogging('Artist\tName')).toBe(
      '"Artist\\tName"',
    );
    expect(formatCommandArgumentForLogging('Artist\nName')).toBe(
      '"Artist\\nName"',
    );
  });

  it('JSON-serializes arguments containing quotation marks', () => {
    expect(formatCommandArgumentForLogging('Artist "Name"')).toBe(
      String.raw`"Artist \"Name\""`,
    );
    expect(formatCommandArgumentForLogging(String.raw`Artist 'Name'`)).toBe(
      String.raw`"Artist 'Name'"`,
    );
  });

  it('JSON-serializes arguments containing backslashes', () => {
    expect(formatCommandArgumentForLogging(String.raw`Artist\Album`)).toBe(
      String.raw`"Artist\\Album"`,
    );
  });

  it('preserves special characters in the JSON representation', () => {
    const argument = String.raw`Artist "Name"\Album`;

    expect(formatCommandArgumentForLogging(argument)).toBe(
      JSON.stringify(argument),
    );
  });
});

describe('formatCommandArgumentsForLogging', () => {
  it('returns an empty string for an empty argument list', () => {
    expect(formatCommandArgumentsForLogging([])).toBe('');
  });

  it('joins arguments with spaces', () => {
    expect(
      formatCommandArgumentsForLogging(['ffmpeg', '-i', 'input.flac']),
    ).toBe('ffmpeg -i input.flac');
  });

  it('formats each argument independently before joining', () => {
    expect(
      formatCommandArgumentsForLogging([
        'ffmpeg',
        'Artist Name',
        String.raw`Artist\Name`,
        'Track "Name"',
      ]),
    ).toBe(
      String.raw`ffmpeg "Artist Name" "Artist\\Name" "Track \"Name\""`,
    );
  });
});

describe('secondsToTimeFormat', () => {
  it('formats zero seconds', () => {
    expect(secondsToTimeFormat(0)).toBe('0:00');
  });

  it('formats durations shorter than one hour as m:ss', () => {
    expect(secondsToTimeFormat(73)).toBe('1:13');
    expect(secondsToTimeFormat(253)).toBe('4:13');
    expect(secondsToTimeFormat(3599)).toBe('59:59');
  });

  it('zero-pads seconds', () => {
    expect(secondsToTimeFormat(60)).toBe('1:00');
    expect(secondsToTimeFormat(61)).toBe('1:01');
    expect(secondsToTimeFormat(69)).toBe('1:09');
  });

  it('formats durations of at least one hour as h:mm:ss', () => {
    expect(secondsToTimeFormat(3600)).toBe('1:00:00');
    expect(secondsToTimeFormat(3853)).toBe('1:04:13');
    expect(secondsToTimeFormat(3661)).toBe('1:01:01');
  });

  it('zero-pads minutes when hours are present', () => {
    expect(secondsToTimeFormat(3600 + 5)).toBe('1:00:05');
    expect(secondsToTimeFormat(3600 + 59)).toBe('1:00:59');
    expect(secondsToTimeFormat(3600 + 60)).toBe('1:01:00');
    expect(secondsToTimeFormat(3600 + 10 * 60)).toBe('1:10:00');
  });

  it('supports durations longer than one day', () => {
    expect(secondsToTimeFormat(24 * 3600)).toBe('24:00:00');
    expect(secondsToTimeFormat(25 * 3600 + 61)).toBe('25:01:01');
  });

  it('rounds fractional seconds to the nearest whole second', () => {
    expect(secondsToTimeFormat(1.4)).toBe('0:01');
    expect(secondsToTimeFormat(1.5)).toBe('0:02');
    expect(secondsToTimeFormat(59.5)).toBe('1:00');
    expect(secondsToTimeFormat(3599.5)).toBe('1:00:00');
  });

  it('throws a TypeError for invalid input', () => {
    expect(() => secondsToTimeFormat(Number.NaN)).toThrow(
      new TypeError('inputSeconds must be a non-negative finite number.'),
    );
    expect(() => secondsToTimeFormat(Number.POSITIVE_INFINITY)).toThrow(
      new TypeError('inputSeconds must be a non-negative finite number.'),
    );
    expect(() => secondsToTimeFormat(Number.NEGATIVE_INFINITY)).toThrow(
      new TypeError('inputSeconds must be a non-negative finite number.'),
    );
    expect(() => secondsToTimeFormat(-1)).toThrow(
      new TypeError('inputSeconds must be a non-negative finite number.'),
    );
  });
});

describe('roundToDecimalPlaces', () => {
  it('rounds to zero decimal places by default', () => {
    expect(roundToDecimalPlaces(1.4)).toBe(1);
    expect(roundToDecimalPlaces(1.5)).toBe(2);
    expect(roundToDecimalPlaces(1.6)).toBe(2);
  });

  it('rounds to the specified number of decimal places', () => {
    expect(roundToDecimalPlaces(1.2345, 2)).toBe(1.23);
    expect(roundToDecimalPlaces(1.2355, 2)).toBe(1.24);
    expect(roundToDecimalPlaces(1.2345, 3)).toBe(1.235);
  });

  it('handles values that already have the requested precision', () => {
    expect(roundToDecimalPlaces(1.23, 2)).toBe(1.23);
    expect(roundToDecimalPlaces(1, 3)).toBe(1);
  });

  it('reduces floating-point rounding errors for decimal values', () => {
    expect(roundToDecimalPlaces(1.005, 2)).toBe(1.01);
  });

  it('rounds negative numbers symmetrically', () => {
    expect(roundToDecimalPlaces(-1.2345, 2)).toBe(-1.23);
    expect(roundToDecimalPlaces(-1.2355, 2)).toBe(-1.24);
    expect(roundToDecimalPlaces(-1.005, 2)).toBe(-1.01);
    expect(roundToDecimalPlaces(-2.675, 2)).toBe(-2.68);
    expect(roundToDecimalPlaces(-1.335, 2)).toBe(-1.34);
  });

  it('returns the input unchanged when decimal scaling would overflow', () => {
    expect(roundToDecimalPlaces(2.5, 308)).toBe(2.5);
    expect(roundToDecimalPlaces(-2.5, 308)).toBe(-2.5);
    expect(roundToDecimalPlaces(Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
    expect(roundToDecimalPlaces(-Number.MAX_VALUE)).toBe(-Number.MAX_VALUE);
  });

  it('throws a TypeError for non-finite numbers', () => {
    expect(() => roundToDecimalPlaces(Number.NaN)).toThrow(
      new TypeError('num must be a finite number.'),
    );
    expect(() => roundToDecimalPlaces(Number.POSITIVE_INFINITY)).toThrow(
      new TypeError('num must be a finite number.'),
    );
    expect(() => roundToDecimalPlaces(Number.NEGATIVE_INFINITY)).toThrow(
      new TypeError('num must be a finite number.'),
    );
  });

  it('throws a RangeError for an invalid number of decimal places', () => {
    expect(() => roundToDecimalPlaces(1.23, -1)).toThrow(
      new RangeError('decimalPlaces must be a non-negative integer.'),
    );
    expect(() => roundToDecimalPlaces(1.23, 1.5)).toThrow(
      new RangeError('decimalPlaces must be a non-negative integer.'),
    );
    expect(() => roundToDecimalPlaces(1.23, Number.NaN)).toThrow(
      new RangeError('decimalPlaces must be a non-negative integer.'),
    );
  });

  it('throws a RangeError when the decimal precision cannot be represented', () => {
    expect(() => roundToDecimalPlaces(1.23, 309)).toThrow(
      new RangeError('decimalPlaces is too large.'),
    );
  });
});

describe('getFirstLine', () => {
  it('returns the whole string when it contains no line break', () => {
    expect(getFirstLine('This is a single line.')).toBe(
      'This is a single line.',
    );
  });

  it('returns the first line from a string with a Unix line break', () => {
    expect(getFirstLine('First line\nSecond line')).toBe('First line');
  });

  it('returns the first line from a string with a Windows line break', () => {
    expect(getFirstLine('First line\r\nSecond line')).toBe('First line');
  });

  it('returns the first line from a string with a carriage return', () => {
    expect(getFirstLine('First line\rSecond line')).toBe('First line');
  });

  it('returns an empty string when the input starts with a line break', () => {
    expect(getFirstLine('\nSecond line')).toBe('');
    expect(getFirstLine('\r\nSecond line')).toBe('');
    expect(getFirstLine('\rSecond line')).toBe('');
  });

  it('ignores all content after the first line break', () => {
    expect(
      getFirstLine('First line\nSecond line\nThird line'),
    ).toBe('First line');
  });

  it('preserves whitespace within the first line', () => {
    expect(getFirstLine('  First line  \nSecond line')).toBe(
      '  First line  ',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(getFirstLine('')).toBe('');
  });
});

describe('slugify', () => {
  it('converts a string to a lowercase hyphen-separated slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes decomposable diacritics', () => {
    expect(slugify('Café déjà vu')).toBe('cafe-deja-vu');
  });

  it('removes combining diacritical marks', () => {
    expect(slugify('Cafe\u0301')).toBe('cafe');
  });

  it('discards unsupported characters without adding separators', () => {
    expect(slugify('Zażółć gęślą jaźń')).toBe('zazoc-gesla-jazn');
    expect(slugify('Førehand')).toBe('frehand');
    expect(slugify('Hello,World!')).toBe('helloworld');
    expect(slugify('foo/bar')).toBe('foobar');
    expect(slugify(String.raw`foo\bar`)).toBe('foobar');
  });

  it('converts whitespace to hyphens', () => {
    expect(slugify('Hello World Again')).toBe('hello-world-again');
  });

  it('collapses consecutive whitespace into a single hyphen', () => {
    expect(slugify('Hello  \t\n  World')).toBe('hello-world');
  });

  it('preserves digits', () => {
    expect(slugify('Track 01 Version 2')).toBe('track-01-version-2');
  });

  it('preserves hyphens and collapses consecutive hyphens', () => {
    expect(slugify('foo-bar')).toBe('foo-bar');
    expect(slugify('Foo --- Bar')).toBe('foo-bar');
  });

  it('removes leading and trailing whitespace and hyphens', () => {
    expect(slugify('  ---Foo Bar---  ')).toBe('foo-bar');
  });

  it('returns an empty string when no supported characters remain', () => {
    expect(slugify('!@#$%^&*()')).toBe('');
    expect(slugify('Привет мир')).toBe('');
    expect(slugify('東京')).toBe('');
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(slugify('   \t\n  ')).toBe('');
  });
});
