import { describe, expect, it, vi } from 'vitest';

import { isSupportedArtworkFile } from '#tools';

import { tryGetMimeTypeFromFile } from './file-type.js';

vi.mock('./file-type.js', () => ({
  tryGetMimeTypeFromFile: vi.fn(),
}));

const mockedTryGetMimeTypeFromFile = vi.mocked(tryGetMimeTypeFromFile);

describe('isSupportedArtworkFile', () => {
  it.each(['image/jpeg', 'image/png'])(
    'returns true for supported MIME type %s',
    async (mimeType) => {
      mockedTryGetMimeTypeFromFile.mockResolvedValueOnce(mimeType);

      await expect(
        isSupportedArtworkFile('artwork.jpg'),
      ).resolves.toBe(true);
    },
  );

  it.each([
    'image/gif',
    'image/webp',
    'audio/mpeg',
    'application/octet-stream',
  ])('returns false for unsupported MIME type %s', async (mimeType) => {
    mockedTryGetMimeTypeFromFile.mockResolvedValueOnce(mimeType);

    await expect(
      isSupportedArtworkFile('artwork.jpg'),
    ).resolves.toBe(false);
  });

  it('returns false when the MIME type cannot be detected', async () => {
    mockedTryGetMimeTypeFromFile.mockResolvedValueOnce(undefined);

    await expect(
      isSupportedArtworkFile('artwork.jpg'),
    ).resolves.toBe(false);
  });

  it('uses the detected MIME type regardless of the file extension', async () => {
    mockedTryGetMimeTypeFromFile.mockResolvedValueOnce('image/png');

    await expect(
      isSupportedArtworkFile('artwork.mp3'),
    ).resolves.toBe(true);
  });

  it('passes the file path to MIME type detection', async () => {
    mockedTryGetMimeTypeFromFile.mockResolvedValueOnce('image/jpeg');

    await isSupportedArtworkFile('/music/cover.jpg');

    expect(mockedTryGetMimeTypeFromFile).toHaveBeenCalledWith(
      '/music/cover.jpg',
    );
    expect(mockedTryGetMimeTypeFromFile).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from MIME type detection', async () => {
    const error = new Error('Failed to read file');

    mockedTryGetMimeTypeFromFile.mockRejectedValueOnce(error);

    await expect(
      isSupportedArtworkFile('artwork.jpg'),
    ).rejects.toBe(error);
  });
});
