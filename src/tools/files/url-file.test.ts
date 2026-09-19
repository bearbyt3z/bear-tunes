import { describe, expect, it, vi } from 'vitest';

import * as fs from 'node:fs';

import { tryGetUrlFromFile } from '#tools';

import { tryParseUrl } from '../utils/parse.js';

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock('../utils/parse.js', () => ({
  tryParseUrl: vi.fn(),
}));

const mockedReadFile = vi.mocked(fs.promises.readFile);
const mockedTryParseUrl = vi.mocked(tryParseUrl);

describe('tryGetUrlFromFile', () => {
  it('returns the parsed URL from a URL= line', async () => {
    const url = new URL('https://example.com/track');

    mockedReadFile.mockResolvedValueOnce(
      'URL=https://example.com/track\n',
    );
    mockedTryParseUrl.mockReturnValueOnce(url);

    await expect(
      tryGetUrlFromFile('track.url'),
    ).resolves.toBe(url);
  });

  it('uses the first URL= line when multiple URL= lines are present', async () => {
    const url = new URL('https://example.com/first');

    mockedReadFile.mockResolvedValueOnce(
      'Title=Track\nURL=https://example.com/first\nURL=https://example.com/second\n',
    );
    mockedTryParseUrl.mockReturnValueOnce(url);

    await expect(
      tryGetUrlFromFile('track.url'),
    ).resolves.toBe(url);

    expect(mockedTryParseUrl).toHaveBeenCalledWith(
      'https://example.com/first',
    );
    expect(mockedTryParseUrl).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace from the extracted URL', async () => {
    const url = new URL('https://example.com/track');

    mockedReadFile.mockResolvedValueOnce(
      'URL=  https://example.com/track  \n',
    );
    mockedTryParseUrl.mockReturnValueOnce(url);

    await expect(
      tryGetUrlFromFile('track.url'),
    ).resolves.toBe(url);

    expect(mockedTryParseUrl).toHaveBeenCalledWith(
      'https://example.com/track',
    );
  });

  it.each([
    'Title=Track\nArtist=Artist\n',
    ' URL=https://example.com/track\n',
    'url=https://example.com/track\n',
  ])(
    'returns undefined when no matching URL= line is present',
    async (fileContent) => {
      mockedReadFile.mockResolvedValueOnce(fileContent);

      await expect(
        tryGetUrlFromFile('track.url'),
      ).resolves.toBeUndefined();

      expect(mockedTryParseUrl).not.toHaveBeenCalled();
    },
  );

  it.each([
    'URL=https://example.com/track\n',
    'URL=https://example.com/track\r\n',
    'URL=https://example.com/track\r',
  ])('supports %o line endings', async (fileContent) => {
    const url = new URL('https://example.com/track');

    mockedReadFile.mockResolvedValueOnce(fileContent);
    mockedTryParseUrl.mockReturnValueOnce(url);

    await expect(
      tryGetUrlFromFile('track.url'),
    ).resolves.toBe(url);
  });

  it('returns undefined when the extracted URL is invalid', async () => {
    mockedReadFile.mockResolvedValueOnce(
      'URL=not-a-valid-url\n',
    );
    mockedTryParseUrl.mockReturnValueOnce(undefined);

    await expect(
      tryGetUrlFromFile('track.url'),
    ).resolves.toBeUndefined();

    expect(mockedTryParseUrl).toHaveBeenCalledWith(
      'not-a-valid-url',
    );
  });

  it('passes the file path and UTF-8 encoding to file reading', async () => {
    const url = new URL('https://example.com/track');

    mockedReadFile.mockResolvedValueOnce(
      'URL=https://example.com/track\n',
    );
    mockedTryParseUrl.mockReturnValueOnce(url);

    await tryGetUrlFromFile('/music/track.url');

    expect(mockedReadFile).toHaveBeenCalledWith(
      '/music/track.url',
      'utf8',
    );
    expect(mockedReadFile).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from file reading', async () => {
    const error = new Error('Failed to read file');

    mockedReadFile.mockRejectedValueOnce(error);

    await expect(
      tryGetUrlFromFile('track.url'),
    ).rejects.toBe(error);

    expect(mockedTryParseUrl).not.toHaveBeenCalled();
  });
});
