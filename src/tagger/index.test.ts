import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EYED3_EXECUTABLE,
  PYTHON_EXECUTABLE,
  USER_AGENT_CACHE_FILE,
} from '#config';
import logger from '#logger';

import type { TrackInfo } from '#shared-types';
import {
  BearTunesTagger,
  BearTunesTaggerFailureCode,
} from './index.js';

import type {
  BearTunesTaggerFailureResult,
  BearTunesTaggerResult,
  BearTunesTaggerSuccessResult,
} from './index.js';

interface MockSpawnSyncResult {
  stdout: string;
  stderr: string;
  status: number | null;
  error?: Error;
}

interface MockCommandOutput {
  stdout: Buffer | undefined;
  stderr: Buffer | undefined;
  status: number;
  signal: NodeJS.Signals | null;
}

interface MockDownloadImageOptions {
  outputFilePath?: string;
  referer?: URL;
}

type SkipTest = (message?: string) => void;

const childProcessMocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

const taggerToolMocks = vi.hoisted(() => ({
  executeCommandSync: vi.fn<
    (commandName: string, args: readonly string[]) => MockCommandOutput
  >(),
  downloadImage: vi.fn<
    (
      imageUrl: URL,
      userAgentCacheFile: string,
      options?: MockDownloadImageOptions,
    ) => Promise<string>
  >(),
  isSupportedArtworkFile: vi.fn<(imagePath: string) => Promise<boolean>>(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();

  return {
    ...actual,
    spawnSync: childProcessMocks.spawnSync,
  };
});

vi.mock('#tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#tools')>();

  return {
    ...actual,
    executeCommandSync: taggerToolMocks.executeCommandSync,
    downloadImage: taggerToolMocks.downloadImage,
    isSupportedArtworkFile: taggerToolMocks.isSupportedArtworkFile,
  };
});

const sourceFileContent = 'Example audio file content';

const flacTagOutput = [
  'ARTIST=Artist One',
  'ARTIST=Artist Two',
  'TITLE=Example Track',
  'ALBUM=Example Album',
  'ALBUMARTIST=Album Artist One',
  'ALBUMARTIST=Album Artist Two',
  'TRACKNUMBER=03',
  'TRACKTOTAL=12',
  'GENRE=House',
  'DATE=2024-05-18',
].join('\n');

let temporaryDirectory = '';
let sourceDirectory = '';

function createSourceAudioFile(filename: string): string {
  const filePath = path.join(sourceDirectory, filename);

  fs.writeFileSync(filePath, sourceFileContent);

  return filePath;
}

function createSpawnSyncResult(
  stdout: string,
  options: Partial<MockSpawnSyncResult> = {},
): MockSpawnSyncResult {
  return {
    stdout,
    stderr: options.stderr ?? '',
    status: options.status !== undefined ? options.status : 0,
    ...(options.error ? { error: options.error } : {}),
  };
}

function createMockCommandOutput(stdout = 'command output'): MockCommandOutput {
  return {
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(''),
    status: 0,
    signal: null,
  };
}

function createTrackInfo(overrides: Partial<TrackInfo> = {}): TrackInfo {
  return {
    artists: ['Artist One', 'Artist Two'],
    title: 'Example Track',
    released: new Date('2024-05-18'),
    year: 2024,
    genre: 'House',
    subgenre: 'Deep House',
    bpm: 124,
    key: 'A Minor',
    isrc: 'GBABC2400001',
    url: new URL('https://example.com/tracks/example-track'),
    album: {
      title: 'Example Album',
      artists: ['Album Artist'],
      trackNumber: 3,
      trackTotal: 12,
      catalogNumber: 'CAT-001',
    },
    details: { durationMs: 245000 },
    ...overrides,
  };
}

function mockSuccessfulArtworkDownloads(): string[] {
  const downloadedPaths: string[] = [];

  taggerToolMocks.downloadImage.mockImplementation((imageUrl) => {
    const extension = path.extname(imageUrl.pathname) || '.png';
    const imagePath = path.join(
      temporaryDirectory,
      `downloaded-artwork-${downloadedPaths.length}${extension}`,
    );

    fs.writeFileSync(imagePath, 'Temporary artwork content');
    downloadedPaths.push(imagePath);

    return Promise.resolve(imagePath);
  });
  taggerToolMocks.isSupportedArtworkFile.mockResolvedValue(true);

  return downloadedPaths;
}

function mockSpawnSyncResults(
  ...results: MockSpawnSyncResult[]
): typeof childProcessMocks.spawnSync {
  let resultIndex = 0;

  childProcessMocks.spawnSync.mockImplementation(() => {
    const result = results[resultIndex++];

    if (!result) {
      throw new Error('Unexpected child_process.spawnSync invocation.');
    }

    return result;
  });

  return childProcessMocks.spawnSync;
}

function expectTaggerFailure(
  result: BearTunesTaggerResult,
  failureCode: BearTunesTaggerFailureCode,
): BearTunesTaggerFailureResult {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error('Expected tagger operation to fail.');
  }

  expect(result.failureCode).toBe(failureCode);
  expect(result.error).toBeInstanceOf(Error);

  return result;
}

function expectTaggerSuccess(
  result: BearTunesTaggerResult,
): BearTunesTaggerSuccessResult {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error('Expected tagger operation to succeed.');
  }

  return result;
}

function createSymlinkOrSkip(
  targetPath: string,
  symlinkPath: string,
  type: 'dir' | 'file',
  skip: SkipTest,
): void {
  const symlinkType =
    process.platform === 'win32' && type === 'dir' ? 'junction' : type;

  try {
    fs.symlinkSync(targetPath, symlinkPath, symlinkType);
  } catch (error: unknown) {
    const errorCode =
      error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string'
        ? error.code
        : undefined;

    const isWindowsSymlinkPermissionError =
      process.platform === 'win32' &&
      errorCode !== undefined &&
      ['EACCES', 'EPERM', 'ENOTSUP'].includes(errorCode);

    if (isWindowsSymlinkPermissionError) {
      skip(
        `Symbolic link creation is not permitted in this Windows environment (${errorCode}).`,
      );
      return;
    }

    throw error;
  }
}

function expectFlacReadCommands(
  spawnSyncMock: typeof childProcessMocks.spawnSync,
  trackPath: string,
): void {
  expect(spawnSyncMock).toHaveBeenNthCalledWith(
    1,
    'metaflac',
    [
      '--show-tag=ARTIST',
      '--show-tag=TITLE',
      '--show-tag=ALBUM',
      '--show-tag=ALBUMARTIST',
      '--show-tag=TRACKNUMBER',
      '--show-tag=TRACKTOTAL',
      '--show-tag=DISCNUMBER',
      '--show-tag=DISCTOTAL',
      '--show-tag=GENRE',
      '--show-tag=DATE',
      '--show-tag=COMPOSER',
      '--show-tag=ISRC',
      trackPath,
    ],
    { encoding: 'utf-8' },
  );
  expect(spawnSyncMock).toHaveBeenNthCalledWith(
    2,
    'metaflac',
    ['--show-total-samples', '--show-sample-rate', trackPath],
    { encoding: 'utf-8' },
  );
}

describe('BearTunesTagger', () => {
  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'bear-tunes-tagger-test-'),
    );
    sourceDirectory = path.join(temporaryDirectory, 'source');
    fs.mkdirSync(sourceDirectory);

    childProcessMocks.spawnSync.mockReset();

    // Silence logger output while keeping logger calls available for assertions.
    vi.spyOn(logger, 'debug').mockReturnValue(logger);
    vi.spyOn(logger, 'info').mockReturnValue(logger);
    vi.spyOn(logger, 'warn').mockReturnValue(logger);
    vi.spyOn(logger, 'error').mockReturnValue(logger);

    taggerToolMocks.executeCommandSync.mockReset();
    taggerToolMocks.executeCommandSync.mockImplementation(() =>
      createMockCommandOutput(),
    );
    taggerToolMocks.downloadImage.mockReset();
    taggerToolMocks.isSupportedArtworkFile.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (temporaryDirectory.length > 0) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }

    temporaryDirectory = '';
    sourceDirectory = '';
  });

  describe('readTag', () => {
    describe('input validation', () => {
      it('returns InputFileAccessError when the input file does not exist', async () => {
        const trackPath = path.join(sourceDirectory, 'missing-track.mp3');
        const tagger = new BearTunesTagger();

        const result = await tagger.readTag(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.InputFileAccessError,
        );
        expect(childProcessMocks.spawnSync).not.toHaveBeenCalled();
      });

      it('returns InputFileAccessError when the input path points to a directory', async () => {
        const trackPath = path.join(sourceDirectory, 'audio-directory.mp3');
        fs.mkdirSync(trackPath);
        const tagger = new BearTunesTagger();

        const result = await tagger.readTag(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.InputFileAccessError,
        );
        expect(childProcessMocks.spawnSync).not.toHaveBeenCalled();
      });

      it('returns InputFileAccessError when the input path is a symbolic link to a file', async ({ skip }) => {
        const actualTrackPath = createSourceAudioFile('actual-track.mp3');
        const linkedTrackPath = path.join(sourceDirectory, 'linked-track.mp3');
        createSymlinkOrSkip(actualTrackPath, linkedTrackPath, 'file', skip);
        const tagger = new BearTunesTagger();

        const result = await tagger.readTag(linkedTrackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.InputFileAccessError,
        );
        expect(childProcessMocks.spawnSync).not.toHaveBeenCalled();
      });

      it('returns UnsupportedAudioFileType for AIFF files', async () => {
        const trackPath = createSourceAudioFile('example-track.aiff');
        const tagger = new BearTunesTagger();

        const result = await tagger.readTag(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.UnsupportedAudioFileType,
        );
        expect(childProcessMocks.spawnSync).not.toHaveBeenCalled();
      });

      it('returns UnsupportedAudioFileType for unrecognized file types', async () => {
        const trackPath = createSourceAudioFile('example-track.bin');
        const tagger = new BearTunesTagger();

        const result = await tagger.readTag(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.UnsupportedAudioFileType,
        );
        expect(childProcessMocks.spawnSync).not.toHaveBeenCalled();
      });
    });

    describe('MP3 files', () => {
      describe('successful reading', () => {
        it('reads and normalizes ID3 metadata using the configured pattern file', async () => {
          const trackPath = createSourceAudioFile('example-track.mp3');
          const patternFilePath = path.join(
            sourceDirectory,
            'custom-pattern.txt',
          );
          const tagger = new BearTunesTagger({
            eyeD3DisplayPluginPatternFile: patternFilePath,
          });
          const spawnSyncMock = mockSpawnSyncResults(
            createSpawnSyncResult(JSON.stringify({
              artists: 'Artist One, Artist Two',
              title: '  Example Track  ',
              genre: ' House ',
              released: '2024-05-18',
              details: { durationMs: '245000' },
            })),
          );

          const result = await tagger.readTag(trackPath);

          expect(expectTaggerSuccess(result)).toEqual({
            ok: true,
            trackInfo: {
              artists: ['Artist One', 'Artist Two'],
              title: 'Example Track',
              genre: 'House',
              released: new Date('2024-05-18'),
              year: 2024,
              details: { durationMs: 245000 },
            },
          });
          expect(spawnSyncMock).toHaveBeenCalledOnce();
          expect(spawnSyncMock).toHaveBeenCalledWith(
            PYTHON_EXECUTABLE,
            [
              './eyed3-display-plugin-replacement.py',
              patternFilePath,
              trackPath,
              '--escape-backslashes',
            ],
            { encoding: 'utf-8' },
          );
        });
      });

      describe('reader execution errors', () => {
        it('returns ID3TagReadExecutionFailed when the reader process cannot be started', async () => {
          const trackPath = createSourceAudioFile('spawn-error-track.mp3');
          const tagger = new BearTunesTagger();
          const spawnError = new Error('Python executable not found');
          mockSpawnSyncResults(
            createSpawnSyncResult('', {
              status: null,
              error: spawnError,
            }),
          );

          const result = await tagger.readTag(trackPath);

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.ID3TagReadExecutionFailed,
          );
          expect(failure.error.message).toContain(spawnError.message);
        });

        it('returns ID3TagReadExecutionFailed when the reader exits with a non-zero status', async () => {
          const trackPath = createSourceAudioFile('non-zero-status-track.mp3');
          const tagger = new BearTunesTagger();
          mockSpawnSyncResults(
            createSpawnSyncResult('', { status: 2 }),
          );

          const result = await tagger.readTag(trackPath);

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.ID3TagReadExecutionFailed,
          );
          expect(failure.error.message).toContain('status 2');
        });

        it('returns ID3TagReadExecutionFailed when the reader writes to stderr despite a zero exit status', async () => {
          const trackPath = createSourceAudioFile('stderr-track.mp3');
          const tagger = new BearTunesTagger();
          mockSpawnSyncResults(
            createSpawnSyncResult('', {
              stderr: 'Reader warning output',
              status: 0,
            }),
          );

          const result = await tagger.readTag(trackPath);

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.ID3TagReadExecutionFailed,
          );
          expect(failure.error.message).toContain('Reader warning output');
        });
      });

      describe('invalid reader output', () => {
        it('returns TagReadOutputInvalid when the reader output is not valid JSON', async () => {
          const trackPath = createSourceAudioFile('invalid-json-track.mp3');
          const tagger = new BearTunesTagger();
          mockSpawnSyncResults(
            createSpawnSyncResult('{"title":'),
          );

          const result = await tagger.readTag(trackPath);

          expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.TagReadOutputInvalid,
          );
        });

        it('returns TagReadOutputInvalid when the parsed output cannot represent TrackInfo', async () => {
          const trackPath = createSourceAudioFile('invalid-data-track.mp3');
          const tagger = new BearTunesTagger();
          mockSpawnSyncResults(
            createSpawnSyncResult('null'),
          );

          const result = await tagger.readTag(trackPath);

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.TagReadOutputInvalid,
          );
          expect(failure.details).toHaveProperty('issues');
        });
      });
    });

    describe('FLAC files', () => {
      describe('successful reading', () => {
        it('reads multivalue tags, album metadata, release date, and duration', async () => {
          const trackPath = createSourceAudioFile('example-track.flac');
          const tagger = new BearTunesTagger();
          const spawnSyncMock = mockSpawnSyncResults(
            createSpawnSyncResult(flacTagOutput),
            createSpawnSyncResult('441000\n44100\n'),
          );

          const result = await tagger.readTag(trackPath);

          expect(expectTaggerSuccess(result)).toEqual({
            ok: true,
            trackInfo: {
              artists: ['Artist One', 'Artist Two'],
              title: 'Example Track',
              genre: 'House',
              released: new Date('2024-05-18'),
              year: 2024,
              album: {
                artists: ['Album Artist One', 'Album Artist Two'],
                title: 'Example Album',
                trackNumber: 3,
                trackTotal: 12,
              },
              details: { durationMs: 10000 },
            },
          });
          expect(spawnSyncMock).toHaveBeenCalledTimes(2);
          expectFlacReadCommands(spawnSyncMock, trackPath);
        });
      });

      describe('reader execution errors', () => {
        it('returns MetaflacTagReadExecutionFailed when the reader process cannot be started', async () => {
          const trackPath = createSourceAudioFile('spawn-error-track.flac');
          const tagger = new BearTunesTagger();
          const spawnError = new Error('metaflac executable not found');
          const spawnSyncMock = mockSpawnSyncResults(
            createSpawnSyncResult('', {
              status: null,
              error: spawnError,
            }),
          );

          const result = await tagger.readTag(trackPath);

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.MetaflacTagReadExecutionFailed,
          );
          expect(failure.error.message).toContain(spawnError.message);
          expect(spawnSyncMock).toHaveBeenCalledOnce();
        });

        it('returns MetaflacTagReadExecutionFailed when the reader exits with a non-zero status', async () => {
          const trackPath = createSourceAudioFile('non-zero-status-track.flac');
          const tagger = new BearTunesTagger();
          const spawnSyncMock = mockSpawnSyncResults(
            createSpawnSyncResult('', { status: 2 }),
          );

          const result = await tagger.readTag(trackPath);

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.MetaflacTagReadExecutionFailed,
          );
          expect(failure.error.message).toContain('status 2');
          expect(spawnSyncMock).toHaveBeenCalledOnce();
        });

        it('returns MetaflacTagReadExecutionFailed when the reader writes to stderr despite a zero exit status', async () => {
          const trackPath = createSourceAudioFile('stderr-track.flac');
          const tagger = new BearTunesTagger();
          const spawnSyncMock = mockSpawnSyncResults(
            createSpawnSyncResult('', {
              stderr: 'metaflac warning output',
              status: 0,
            }),
          );

          const result = await tagger.readTag(trackPath);

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.MetaflacTagReadExecutionFailed,
          );
          expect(failure.error.message).toContain('metaflac warning output');
          expect(spawnSyncMock).toHaveBeenCalledOnce();
        });
      });

      describe('duration extraction', () => {
        const durationFailureCases: [string, MockSpawnSyncResult][] = [
          [
            'the STREAMINFO command fails',
            createSpawnSyncResult('', {
              stderr: 'Cannot read STREAMINFO',
              status: 1,
            }),
          ],
          [
            'the STREAMINFO output is incomplete',
            createSpawnSyncResult('441000\n'),
          ],
          [
            'the STREAMINFO values are invalid',
            createSpawnSyncResult('0\n44100\n'),
          ],
        ];

        it.each(durationFailureCases)(
          'returns the available FLAC metadata without duration when %s',
          async (_scenario, durationResult) => {
            const trackPath = createSourceAudioFile(
              'duration-unavailable-track.flac',
            );
            const tagger = new BearTunesTagger();
            const spawnSyncMock = mockSpawnSyncResults(
              createSpawnSyncResult(flacTagOutput),
              durationResult,
            );

            const result = await tagger.readTag(trackPath);

            const success = expectTaggerSuccess(result);
            expect(success.trackInfo).toMatchObject({
              artists: ['Artist One', 'Artist Two'],
              title: 'Example Track',
              album: {
                title: 'Example Album',
              },
            });
            expect(success.trackInfo.details).toBeUndefined();
            expect(spawnSyncMock).toHaveBeenCalledTimes(2);
          },
        );
      });
    });
  });

  describe('saveTag', () => {
    describe('input validation', () => {
      it('returns InputFileAccessError when the input file does not exist', async () => {
        const trackPath = path.join(sourceDirectory, 'missing-track.mp3');
        const tagger = new BearTunesTagger();

        const result = await tagger.saveTag(trackPath, createTrackInfo());

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.InputFileAccessError,
        );
        expect(taggerToolMocks.executeCommandSync).not.toHaveBeenCalled();
        expect(taggerToolMocks.downloadImage).not.toHaveBeenCalled();
      });

      it('returns InputFileAccessError when the input path points to a directory', async () => {
        const trackPath = path.join(sourceDirectory, 'audio-directory.mp3');
        fs.mkdirSync(trackPath);
        const tagger = new BearTunesTagger();

        const result = await tagger.saveTag(trackPath, createTrackInfo());

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.InputFileAccessError,
        );
        expect(taggerToolMocks.executeCommandSync).not.toHaveBeenCalled();
        expect(taggerToolMocks.downloadImage).not.toHaveBeenCalled();
      });

      const unsupportedFormatCases: [string, string][] = [
        ['AIFF', 'example-track.aiff'],
        ['unrecognized', 'example-track.bin'],
      ];

      it.each(unsupportedFormatCases)(
        'returns UnsupportedAudioFileType for %s files',
        async (_label, filename) => {
          const trackPath = createSourceAudioFile(filename);
          const tagger = new BearTunesTagger();

          const result = await tagger.saveTag(trackPath, createTrackInfo());

          expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.UnsupportedAudioFileType,
          );
          expect(taggerToolMocks.executeCommandSync).not.toHaveBeenCalled();
          expect(taggerToolMocks.downloadImage).not.toHaveBeenCalled();
        },
      );
    });

    describe('MP3 files', () => {
      describe('successful writing', () => {
        it('writes ID3v2 and ID3v1 tags and returns the supplied track metadata', async () => {
          const trackPath = createSourceAudioFile('example-track.mp3');
          const trackInfo = createTrackInfo();
          const tagger = new BearTunesTagger();

          const result = await tagger.saveTag(trackPath, trackInfo);

          expect(expectTaggerSuccess(result).trackInfo).toBe(trackInfo);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledTimes(3);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenNthCalledWith(
            1,
            EYED3_EXECUTABLE,
            ['--v2', '--to-v2.4', '--remove-all-images', trackPath],
          );
          expect(taggerToolMocks.executeCommandSync).toHaveBeenNthCalledWith(
            2,
            EYED3_EXECUTABLE,
            expect.arrayContaining([
              '--v2',
              '--to-v2.4',
              '--artist',
              'Artist One, Artist Two',
              '--text-frame',
              'TIT2:Example Track',
              '--text-frame',
              'TALB:Example Album',
              '--text-frame',
              'TRCK:3/12',
              trackPath,
            ]),
          );
          expect(taggerToolMocks.executeCommandSync).toHaveBeenNthCalledWith(
            3,
            EYED3_EXECUTABLE,
            expect.arrayContaining([
              '--v2',
              '--to-v1.1',
              '--artist',
              'Artist One, Artist Two',
              '--text-frame',
              'TIT2:Example Track',
              trackPath,
            ]),
          );
        });

        it('warns about missing basic identification data but still writes partial metadata', async () => {
          const trackPath = createSourceAudioFile('partial-metadata-track.mp3');
          const trackInfo: TrackInfo = { genre: 'House' };
          const tagger = new BearTunesTagger();

          const result = await tagger.saveTag(trackPath, trackInfo);

          expect(expectTaggerSuccess(result).trackInfo).toBe(trackInfo);
          expect(logger.warn).toHaveBeenCalledWith(
            'Saving tag with missing basic identification data',
            expect.objectContaining({ trackPath }),
          );
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledTimes(3);
        });

        it('downloads, validates, embeds, and removes all available artwork files', async () => {
          const trackPath = createSourceAudioFile('artwork-track.mp3');
          const trackUrl = new URL('https://example.com/tracks/artwork-track');
          const albumUrl = new URL('https://example.com/albums/example-album');
          const publisherUrl = new URL('https://example.com/labels/example-label');
          const publisherLogotypeUrl = new URL('https://images.example.com/label.png');
          const albumArtworkUrl = new URL('https://images.example.com/cover.jpg');
          const waveformUrl = new URL('https://images.example.com/waveform.png');
          const trackInfo = createTrackInfo({
            url: trackUrl,
            album: {
              title: 'Example Album',
              artists: ['Album Artist'],
              trackNumber: 3,
              trackTotal: 12,
              url: albumUrl,
              artwork: albumArtworkUrl,
            },
            publisher: {
              name: 'Example Label',
              url: publisherUrl,
              logotype: publisherLogotypeUrl,
            },
            waveform: waveformUrl,
          });
          const downloadedPaths = mockSuccessfulArtworkDownloads();
          const tagger = new BearTunesTagger();

          const result = await tagger.saveTag(trackPath, trackInfo);

          expect(expectTaggerSuccess(result).trackInfo).toBe(trackInfo);
          expect(taggerToolMocks.downloadImage).toHaveBeenCalledTimes(3);
          expect(taggerToolMocks.downloadImage).toHaveBeenNthCalledWith(
            1,
            publisherLogotypeUrl,
            USER_AGENT_CACHE_FILE,
            { referer: publisherUrl },
          );
          expect(taggerToolMocks.downloadImage).toHaveBeenNthCalledWith(
            2,
            albumArtworkUrl,
            USER_AGENT_CACHE_FILE,
            { referer: albumUrl },
          );
          expect(taggerToolMocks.downloadImage).toHaveBeenNthCalledWith(
            3,
            waveformUrl,
            USER_AGENT_CACHE_FILE,
            { referer: trackUrl },
          );
          expect(taggerToolMocks.isSupportedArtworkFile).toHaveBeenCalledTimes(3);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledTimes(3);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenNthCalledWith(
            2,
            EYED3_EXECUTABLE,
            expect.arrayContaining([
              '--add-image',
              `${downloadedPaths[1]}:FRONT_COVER:Front Cover`,
              '--add-image',
              `${downloadedPaths[2]}:BRIGHT_COLORED_FISH:Waveform`,
              '--add-image',
              `${downloadedPaths[0]}:PUBLISHER_LOGO:Publisher Logotype`,
              trackPath,
            ]),
          );
          expect(downloadedPaths).toHaveLength(3);
          for (const artworkPath of downloadedPaths) {
            expect(fs.existsSync(artworkPath)).toBe(false);
          }
        });
      });

      describe('writer execution errors', () => {
        const writerFailureCases: [string, number][] = [
          ['removing existing ID3v2 images', 1],
          ['writing ID3v2 tags', 2],
          ['writing ID3v1 tags', 3],
        ];

        it.each(writerFailureCases)(
          'returns EyeD3TagWriteExecutionFailed when %s fails',
          async (_scenario, failingCall) => {
            const trackPath = createSourceAudioFile('writer-error-track.mp3');
            const tagger = new BearTunesTagger();
            const writeError = new Error('eyeD3 command failed');
            let callCount = 0;

            taggerToolMocks.executeCommandSync.mockImplementation(() => {
              callCount += 1;
              if (callCount === failingCall) {
                throw writeError;
              }
              return createMockCommandOutput();
            });

            const result = await tagger.saveTag(trackPath, createTrackInfo());

            const failure = expectTaggerFailure(
              result,
              BearTunesTaggerFailureCode.EyeD3TagWriteExecutionFailed,
            );
            expect(failure.error.message).toContain(
              'Cannot save tag to MP3 file',
            );
            expect(failure.error.cause).toBe(writeError);
            expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledTimes(
              failingCall,
            );
          },
        );
      });

      describe('artwork errors', () => {
        it('returns ArtworkDownloadFailed when an artwork URL cannot be downloaded', async () => {
          const trackPath = createSourceAudioFile('artwork-download-error.mp3');
          const artworkUrl = new URL('https://images.example.com/cover.jpg');
          const tagger = new BearTunesTagger();
          taggerToolMocks.downloadImage.mockRejectedValue(
            new Error('Image server unavailable'),
          );

          const result = await tagger.saveTag(
            trackPath,
            createTrackInfo({
              album: { title: 'Example Album', artwork: artworkUrl },
            }),
          );

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.ArtworkDownloadFailed,
          );
          expect(failure.error.message).toContain('album artwork');
          expect(taggerToolMocks.executeCommandSync).not.toHaveBeenCalled();
        });

        it('returns ArtworkValidationFailed and removes the downloaded file when artwork is unsupported', async () => {
          const trackPath = createSourceAudioFile('artwork-validation-error.mp3');
          const artworkPath = path.join(temporaryDirectory, 'unsupported-cover.webp');
          fs.writeFileSync(artworkPath, 'Unsupported artwork content');
          const artworkUrl = new URL('https://images.example.com/cover.webp');
          const tagger = new BearTunesTagger();
          taggerToolMocks.downloadImage.mockResolvedValue(artworkPath);
          taggerToolMocks.isSupportedArtworkFile.mockResolvedValue(false);

          const result = await tagger.saveTag(
            trackPath,
            createTrackInfo({
              album: { title: 'Example Album', artwork: artworkUrl },
            }),
          );

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.ArtworkValidationFailed,
          );
          expect(failure.error.message).toContain(
            'Unsupported front cover artwork',
          );
          expect(taggerToolMocks.executeCommandSync).not.toHaveBeenCalled();
          expect(fs.existsSync(artworkPath)).toBe(false);
        });

        it('removes downloaded artwork when the subsequent tag-writing command fails', async () => {
          const trackPath = createSourceAudioFile('artwork-write-error.mp3');
          const artworkPath = path.join(temporaryDirectory, 'temporary-cover.jpg');
          fs.writeFileSync(artworkPath, 'Temporary artwork content');
          const artworkUrl = new URL('https://images.example.com/cover.jpg');
          const tagger = new BearTunesTagger();
          taggerToolMocks.downloadImage.mockResolvedValue(artworkPath);
          taggerToolMocks.isSupportedArtworkFile.mockResolvedValue(true);
          taggerToolMocks.executeCommandSync.mockImplementation(() => {
            throw new Error('eyeD3 command failed');
          });

          const result = await tagger.saveTag(
            trackPath,
            createTrackInfo({
              album: { title: 'Example Album', artwork: artworkUrl },
            }),
          );

          expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.EyeD3TagWriteExecutionFailed,
          );
          expect(fs.existsSync(artworkPath)).toBe(false);
        });
      });
    });

    describe('FLAC files', () => {
      describe('successful writing', () => {
        it('writes the supplied metadata and returns the original TrackInfo', async () => {
          const trackPath = createSourceAudioFile('example-track.flac');
          const trackInfo = createTrackInfo();
          const tagger = new BearTunesTagger();

          const result = await tagger.saveTag(trackPath, trackInfo);

          expect(expectTaggerSuccess(result).trackInfo).toBe(trackInfo);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledOnce();
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledWith(
            'metaflac',
            expect.arrayContaining([
              '--preserve-modtime',
              '--dont-use-padding',
              '--remove-tag=ARTIST',
              '--set-tag=ARTIST=Artist One, Artist Two',
              '--remove-tag=TITLE',
              '--set-tag=TITLE=Example Track',
              '--remove-tag=ALBUM',
              '--set-tag=ALBUM=Example Album',
              '--remove-tag=TRACKNUMBER',
              '--set-tag=TRACKNUMBER=3',
              trackPath,
            ]),
          );
        });

        it('embeds FLAC front cover artwork and removes the downloaded file', async () => {
          const trackPath = createSourceAudioFile('flac-artwork-track.flac');
          const albumArtworkUrl = new URL('https://images.example.com/cover.png');
          const albumUrl = new URL('https://example.com/albums/example-album');
          const trackInfo = createTrackInfo({
            album: {
              title: 'Example Album',
              url: albumUrl,
              artwork: albumArtworkUrl,
            },
          });
          const downloadedPaths = mockSuccessfulArtworkDownloads();
          const tagger = new BearTunesTagger();

          const result = await tagger.saveTag(trackPath, trackInfo);

          expect(expectTaggerSuccess(result).trackInfo).toBe(trackInfo);
          expect(taggerToolMocks.downloadImage).toHaveBeenCalledOnce();
          expect(taggerToolMocks.downloadImage).toHaveBeenCalledWith(
            albumArtworkUrl,
            USER_AGENT_CACHE_FILE,
            { referer: albumUrl },
          );
          expect(taggerToolMocks.isSupportedArtworkFile).toHaveBeenCalledOnce();
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledTimes(2);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenNthCalledWith(
            1,
            'metaflac',
            expect.arrayContaining([
              '--preserve-modtime',
              '--dont-use-padding',
              '--remove',
              '--block-type=PICTURE,PADDING',
              trackPath,
            ]),
          );
          expect(taggerToolMocks.executeCommandSync).toHaveBeenNthCalledWith(
            2,
            'metaflac',
            expect.arrayContaining([
              '--preserve-modtime',
              '--dont-use-padding',
              `--import-picture-from=3||Front Cover||${downloadedPaths[0]}`,
              trackPath,
            ]),
          );
          expect(downloadedPaths).toHaveLength(1);
          expect(fs.existsSync(downloadedPaths[0])).toBe(false);
        });
      });

      describe('writer execution errors', () => {
        it('returns MetaflacTagWriteExecutionFailed when the writer command fails', async () => {
          const trackPath = createSourceAudioFile('writer-error-track.flac');
          const tagger = new BearTunesTagger();
          const writeError = new Error('metaflac command failed');
          taggerToolMocks.executeCommandSync.mockImplementation(() => {
            throw writeError;
          });

          const result = await tagger.saveTag(trackPath, createTrackInfo());

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.MetaflacTagWriteExecutionFailed,
          );
          expect(failure.error.message).toContain(
            'Cannot save tag to FLAC file',
          );
          expect(failure.error.cause).toBe(writeError);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledOnce();
        });
      });
    });
  });
});
