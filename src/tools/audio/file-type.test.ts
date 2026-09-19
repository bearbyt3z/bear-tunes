import { describe, expect, it, vi } from 'vitest';

import { fileTypeFromFile } from 'file-type';

import {
  tryGetAudioFileTypeFromFile,
  tryGetMimeTypeFromFile,
} from '#tools';

import { AudioFileType } from './file-type.types.js';

vi.mock('file-type', () => ({
  fileTypeFromFile: vi.fn(),
}));

const mockedFileTypeFromFile = vi.mocked(fileTypeFromFile);

describe('tryGetMimeTypeFromFile', () => {
  it.each([
    ['mp3', 'audio/mpeg'],
    ['flac', 'audio/flac'],
    ['aif', 'audio/aiff'],
    ['aiff', 'audio/aiff'],
  ])(
    'returns the detected MIME type for %s files',
    async (extension, mime) => {
      mockedFileTypeFromFile.mockResolvedValueOnce({
        ext: extension,
        mime,
      });

      await expect(
        tryGetMimeTypeFromFile(`track.${extension}`),
      ).resolves.toBe(mime);
    },
  );

  it('returns undefined when the file type cannot be detected', async () => {
    mockedFileTypeFromFile.mockResolvedValueOnce(undefined);

    await expect(
      tryGetMimeTypeFromFile('track.unknown'),
    ).resolves.toBeUndefined();
  });

  it('uses content-based detection regardless of the file extension', async () => {
    mockedFileTypeFromFile.mockResolvedValueOnce({
      ext: 'flac',
      mime: 'audio/flac',
    });

    await expect(
      tryGetMimeTypeFromFile('track.mp3'),
    ).resolves.toBe('audio/flac');
  });

  it('propagates errors from file type detection', async () => {
    const error = new Error('Failed to read file');

    mockedFileTypeFromFile.mockRejectedValueOnce(error);

    await expect(
      tryGetMimeTypeFromFile('track.mp3'),
    ).rejects.toBe(error);
  });
});

describe('tryGetAudioFileTypeFromFile', () => {
  it.each([
    ['mp3', AudioFileType.Mp3],
    ['flac', AudioFileType.Flac],
    ['aif', AudioFileType.Aiff],
    ['aiff', AudioFileType.Aiff],
  ])(
    'returns the detected audio file type for %s content',
    async (extension, expectedType) => {
      mockedFileTypeFromFile.mockResolvedValueOnce({
        ext: extension,
        mime: 'unused-field-in-test',
      });

      await expect(
        tryGetAudioFileTypeFromFile(`track.${extension}`),
      ).resolves.toBe(expectedType);
    },
  );

  it('falls back to the file extension when content-based detection returns no type', async () => {
    mockedFileTypeFromFile.mockResolvedValueOnce(undefined);

    await expect(
      tryGetAudioFileTypeFromFile('track.MP3'),
    ).resolves.toBe(AudioFileType.Mp3);
  });

  it.each([
    ['MP3', AudioFileType.Mp3],
    ['FlAc', AudioFileType.Flac],
    ['AIF', AudioFileType.Aiff],
    ['AiFf', AudioFileType.Aiff],
  ])(
    'handles a case-insensitive file extension fallback for .%s',
    async (extension, expectedType) => {
      mockedFileTypeFromFile.mockResolvedValueOnce(undefined);

      await expect(
        tryGetAudioFileTypeFromFile(`track.${extension}`),
      ).resolves.toBe(expectedType);
    },
  );

  it('prefers the detected file type over the filename extension', async () => {
    mockedFileTypeFromFile.mockResolvedValueOnce({
      ext: 'flac',
      mime: 'audio/flac',
    });

    await expect(
      tryGetAudioFileTypeFromFile('track.mp3'),
    ).resolves.toBe(AudioFileType.Flac);
  });

  it('does not fall back to the filename extension when an unsupported type is detected', async () => {
    mockedFileTypeFromFile.mockResolvedValueOnce({
      ext: 'wav',
      mime: 'audio/wav',
    });

    await expect(
      tryGetAudioFileTypeFromFile('track.mp3'),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when neither content nor the filename extension identifies a supported type', async () => {
    mockedFileTypeFromFile.mockResolvedValueOnce(undefined);

    await expect(
      tryGetAudioFileTypeFromFile('track.wav'),
    ).resolves.toBeUndefined();
  });

  it('propagates errors from file type detection', async () => {
    const error = new Error('Failed to read file');

    mockedFileTypeFromFile.mockRejectedValueOnce(error);

    await expect(
      tryGetAudioFileTypeFromFile('track.mp3'),
    ).rejects.toBe(error);
  });
});
