import * as path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  downloadAndSaveArtwork,
  downloadImage,
  validateImageMimeType,
} from './download-image.js';

import type { DownloadFileOptions } from './download.types.js';
import type { FetchClientProfile } from './request-identity.types.js';

const {
  downloadFileMock,
  getFetchClientProfileMock,
  buildImageDownloadHeadersMock,
} = vi.hoisted(() => ({
  downloadFileMock: vi.fn<
    (url: URL, options: DownloadFileOptions) => Promise<string>
  >(),
  getFetchClientProfileMock: vi.fn<
    (userAgentCacheFile: string) => Promise<FetchClientProfile>
  >(),
  buildImageDownloadHeadersMock: vi.fn<
    (
      profile: FetchClientProfile,
      referer?: URL,
    ) => Record<string, string>
  >(),
}));

vi.mock('./download-file.js', () => ({
  downloadFile: downloadFileMock,
}));

vi.mock('./request-identity.js', () => ({
  getFetchClientProfile: getFetchClientProfileMock,
  buildImageDownloadHeaders: buildImageDownloadHeadersMock,
}));

const IMAGE_URL = new URL('https://example.test/images/cover.jpg');
const USER_AGENT_CACHE_FILE = '/cache/request-identity.json';
const DEFAULT_OUTPUT_FILE_PATH = '/downloads/cover.jpg';

const FETCH_PROFILE: FetchClientProfile = {
  identity: {
    userAgent: 'TestBrowser/123.0',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  },
  device: {
    viewport: { width: 1280, height: 720 },
    screen: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  request: {
    accept: 'application/json',
    acceptLanguage: 'pl-PL,pl;q=0.9',
    acceptEncoding: 'gzip, deflate',
    connection: 'keep-alive',
    upgradeInsecureRequests: '1',
  },
};

const IMAGE_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': FETCH_PROFILE.identity.userAgent,
  'Accept': 'image/jpeg,image/png,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
  'Accept-Language': FETCH_PROFILE.request.acceptLanguage,
  'Accept-Encoding': FETCH_PROFILE.request.acceptEncoding,
  'Connection': FETCH_PROFILE.request.connection,
};

beforeEach(() => {
  downloadFileMock.mockReset();
  getFetchClientProfileMock.mockReset();
  buildImageDownloadHeadersMock.mockReset();

  getFetchClientProfileMock.mockResolvedValue(FETCH_PROFILE);
  buildImageDownloadHeadersMock.mockReturnValue(IMAGE_REQUEST_HEADERS);
  downloadFileMock.mockResolvedValue(DEFAULT_OUTPUT_FILE_PATH);
});

describe('validateImageMimeType', () => {
  describe('supported image extensions', () => {
    it.each([
      { extension: '.jpg', expectedMimeType: 'image/jpeg' },
      { extension: '.jpeg', expectedMimeType: 'image/jpeg' },
      { extension: '.jpe', expectedMimeType: 'image/jpeg' },
      { extension: '.jif', expectedMimeType: 'image/jpeg' },
      { extension: '.jfif', expectedMimeType: 'image/jpeg' },
      { extension: '.pjpeg', expectedMimeType: 'image/jpeg' },
      { extension: '.pjp', expectedMimeType: 'image/jpeg' },
      { extension: '.png', expectedMimeType: 'image/png' },
      { extension: '.gif', expectedMimeType: 'image/gif' },
      { extension: '.webp', expectedMimeType: 'image/webp' },
      { extension: '.avif', expectedMimeType: 'image/avif' },
      { extension: '.svg', expectedMimeType: 'image/svg+xml' },
    ])(
      'accepts $extension when the response MIME type matches',
      ({ extension, expectedMimeType }) => {
        const outputFilePath = `/downloads/artwork${extension}`;
        const response = new Response(null, {
          headers: {
            'content-type': `${expectedMimeType}; charset=UTF-8`,
          },
        });

        expect(() =>
          validateImageMimeType(response, outputFilePath),
        ).not.toThrow();
      },
    );

    it.each([
      { extension: '.JPG', expectedMimeType: 'image/jpeg' },
      { extension: '.JPEG', expectedMimeType: 'image/jpeg' },
      { extension: '.JpEg', expectedMimeType: 'image/jpeg' },
      { extension: '.PNG', expectedMimeType: 'image/png' },
      { extension: '.WebP', expectedMimeType: 'image/webp' },
      { extension: '.SVG', expectedMimeType: 'image/svg+xml' },
    ])(
      'accepts uppercase or mixed-case extension $extension',
      ({ extension, expectedMimeType }) => {
        const outputFilePath = `/downloads/artwork${extension}`;
        const response = new Response(null, {
          headers: {
            'content-type': expectedMimeType,
          },
        });

        expect(() =>
          validateImageMimeType(response, outputFilePath),
        ).not.toThrow();
      },
    );
  });

  describe('optional response headers and unknown extensions', () => {
    it('skips validation when the Content-Type header is missing', () => {
      const response = new Response(null);
      const outputFilePath = '/downloads/artwork.jpg';

      expect(() =>
        validateImageMimeType(response, outputFilePath),
      ).not.toThrow();
    });

    it('skips validation when the Content-Type header is empty', () => {
      const response = new Response(null, {
        headers: {
          'content-type': '',
        },
      });

      expect(() =>
        validateImageMimeType(response, '/downloads/artwork.jpg'),
      ).not.toThrow();
    });

    it.each([
      '/downloads/artwork',
      '/downloads/artwork.bin',
      '/downloads/artwork.pdf',
      '/downloads/artwork.unrecognized',
    ])(
      'skips MIME validation for an unsupported extension: %s',
      (outputFilePath) => {
        const response = new Response(null, {
          headers: {
            'content-type': 'image/png',
          },
        });

        expect(() =>
          validateImageMimeType(response, outputFilePath),
        ).not.toThrow();
      },
    );
  });

  describe('MIME type mismatch', () => {
    it('throws an error when the response MIME type differs from the expected type', () => {
      const outputFilePath = '/downloads/artwork.png';
      const response = new Response(null, {
        headers: {
          'content-type': 'IMAGE/JPEG ; charset=UTF-8',
        },
      });

      expect(() =>
        validateImageMimeType(response, outputFilePath),
      ).toThrow(
        'Image MIME type mismatch for "/downloads/artwork.png". ' +
        'Expected "image/png", but server responded with "image/jpeg".',
      );
    });
  });
});

describe('downloadImage', () => {
  it('retrieves the client profile and delegates the download with MIME validation', async () => {
    const result = await downloadImage(
      IMAGE_URL,
      USER_AGENT_CACHE_FILE,
    );

    expect(getFetchClientProfileMock).toHaveBeenCalledExactlyOnceWith(
      USER_AGENT_CACHE_FILE,
    );

    expect(buildImageDownloadHeadersMock).toHaveBeenCalledExactlyOnceWith(
      FETCH_PROFILE,
      undefined,
    );

    expect(downloadFileMock).toHaveBeenCalledExactlyOnceWith(
      IMAGE_URL,
      {
        outputFilePath: undefined,
        headers: IMAGE_REQUEST_HEADERS,
        validateResponse: validateImageMimeType,
      },
    );

    expect(result).toBe(DEFAULT_OUTPUT_FILE_PATH);
  });

  it('passes a custom output path and Referer to the download dependencies', async () => {
    const referer = new URL('https://example.test/albums/album-123');
    const outputFilePath = '/library/artwork/custom-cover.png';

    downloadFileMock.mockResolvedValueOnce(outputFilePath);

    const result = await downloadImage(
      IMAGE_URL,
      USER_AGENT_CACHE_FILE,
      {
        outputFilePath,
        referer,
      },
    );

    expect(getFetchClientProfileMock).toHaveBeenCalledExactlyOnceWith(
      USER_AGENT_CACHE_FILE,
    );

    expect(buildImageDownloadHeadersMock).toHaveBeenCalledExactlyOnceWith(
      FETCH_PROFILE,
      referer,
    );

    expect(downloadFileMock).toHaveBeenCalledExactlyOnceWith(
      IMAGE_URL,
      {
        outputFilePath,
        headers: IMAGE_REQUEST_HEADERS,
        validateResponse: validateImageMimeType,
      },
    );

    expect(result).toBe(outputFilePath);
  });

  it('propagates a client profile retrieval error', async () => {
    const error = new Error('Failed to load client profile');

    getFetchClientProfileMock.mockRejectedValueOnce(error);

    await expect(
      downloadImage(IMAGE_URL, USER_AGENT_CACHE_FILE),
    ).rejects.toBe(error);

    expect(buildImageDownloadHeadersMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
  });

  it('propagates a download error', async () => {
    const error = new Error('Image download failed');

    downloadFileMock.mockRejectedValueOnce(error);

    await expect(
      downloadImage(IMAGE_URL, USER_AGENT_CACHE_FILE),
    ).rejects.toBe(error);

    expect(getFetchClientProfileMock).toHaveBeenCalledExactlyOnceWith(
      USER_AGENT_CACHE_FILE,
    );

    expect(buildImageDownloadHeadersMock).toHaveBeenCalledExactlyOnceWith(
      FETCH_PROFILE,
      undefined,
    );
  });
});

describe('downloadAndSaveArtwork', () => {
  const trackPath = path.join('/music', 'track.flac');

  it('returns undefined without downloading when the artwork URL is missing', async () => {
    await expect(
      downloadAndSaveArtwork(
        trackPath,
        undefined,
        undefined,
        USER_AGENT_CACHE_FILE,
      ),
    ).resolves.toBeUndefined();

    expect(getFetchClientProfileMock).not.toHaveBeenCalled();
    expect(buildImageDownloadHeadersMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
  });

  it.each([
    { sourceExtension: '.jpg', expectedExtension: '.jpg' },
    { sourceExtension: '.JPEG', expectedExtension: '.jpg' },
    { sourceExtension: '.JPE', expectedExtension: '.jpg' },
    { sourceExtension: '.JIF', expectedExtension: '.jpg' },
    { sourceExtension: '.JFIF', expectedExtension: '.jpg' },
    { sourceExtension: '.PJPEG', expectedExtension: '.jpg' },
    { sourceExtension: '.PJP', expectedExtension: '.jpg' },
    { sourceExtension: '.PNG', expectedExtension: '.png' },
    { sourceExtension: '.GIF', expectedExtension: '.gif' },
    { sourceExtension: '.WebP', expectedExtension: '.webp' },
    { sourceExtension: '.AVIF', expectedExtension: '.avif' },
    { sourceExtension: '.SVG', expectedExtension: '.svg' },
  ])(
    'normalizes artwork extension $sourceExtension to $expectedExtension',
    async ({ sourceExtension, expectedExtension }) => {
      const artworkUrl = new URL(
        `https://example.test/artwork/cover${sourceExtension}?source=test`,
      );

      const expectedPath = path.join(
        path.dirname(trackPath),
        `track${expectedExtension}`,
      );

      await expect(
        downloadAndSaveArtwork(
          trackPath,
          artworkUrl,
          undefined,
          USER_AGENT_CACHE_FILE,
        ),
      ).resolves.toBe(expectedPath);

      expect(downloadFileMock).toHaveBeenCalledExactlyOnceWith(
        artworkUrl,
        {
          outputFilePath: expectedPath,
          headers: IMAGE_REQUEST_HEADERS,
          validateResponse: validateImageMimeType,
        },
      );
    },
  );

  it.each(['', '.bin', '.pdf', '.unrecognized'])(
    'uses the .unrecognized fallback for source extension "%s"',
    async (sourceExtension) => {
      const artworkUrl = new URL(
        `https://example.test/artwork/cover${sourceExtension}`,
      );

      const expectedPath = path.join(
        path.dirname(trackPath),
        'track.unrecognized',
      );

      await expect(
        downloadAndSaveArtwork(
          trackPath,
          artworkUrl,
          undefined,
          USER_AGENT_CACHE_FILE,
        ),
      ).resolves.toBe(expectedPath);

      expect(downloadFileMock).toHaveBeenCalledExactlyOnceWith(
        artworkUrl,
        {
          outputFilePath: expectedPath,
          headers: IMAGE_REQUEST_HEADERS,
          validateResponse: validateImageMimeType,
        },
      );
    },
  );

  it('passes the Referer and user-agent cache path through the download flow', async () => {
    const artworkUrl = new URL(
      'https://example.test/artwork/cover.PNG?size=large',
    );
    const referer = new URL('https://example.test/albums/album-123');

    const expectedPath = path.join(
      path.dirname(trackPath),
      'track.png',
    );

    await expect(
      downloadAndSaveArtwork(
        trackPath,
        artworkUrl,
        referer,
        USER_AGENT_CACHE_FILE,
      ),
    ).resolves.toBe(expectedPath);

    expect(getFetchClientProfileMock).toHaveBeenCalledExactlyOnceWith(
      USER_AGENT_CACHE_FILE,
    );

    expect(buildImageDownloadHeadersMock).toHaveBeenCalledExactlyOnceWith(
      FETCH_PROFILE,
      referer,
    );

    expect(downloadFileMock).toHaveBeenCalledExactlyOnceWith(
      artworkUrl,
      {
        outputFilePath: expectedPath,
        headers: IMAGE_REQUEST_HEADERS,
        validateResponse: validateImageMimeType,
      },
    );
  });

  it('propagates a download error without returning the artwork path', async () => {
    const artworkUrl = new URL(
      'https://example.test/artwork/cover.jpg',
    );
    const error = new Error('Artwork download failed');

    downloadFileMock.mockRejectedValueOnce(error);

    await expect(
      downloadAndSaveArtwork(
        trackPath,
        artworkUrl,
        undefined,
        USER_AGENT_CACHE_FILE,
      ),
    ).rejects.toBe(error);
  });
});
