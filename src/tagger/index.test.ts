import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  EYED3_EXECUTABLE,
  PYTHON_EXECUTABLE,
  USER_AGENT_CACHE_FILE,
} from '#config';
import logger from '#logger';
import { AudioFileType } from '#tools';

import type { TrackInfo } from '#shared-types';
import {
  BearTunesTagger,
  BearTunesTaggerFailureCode,
} from './index.js';

import type {
  BearTunesTaggerFailureResult,
  BearTunesTaggerOptions,
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

interface MockDataProvider {
  findTrackCandidates: Mock<
    (inputKeywords: readonly string[]) => Promise<readonly TrackInfo[] | undefined>
  >;
  getTrackInfo: Mock<
    (trackUrl: URL) => Promise<TrackInfo | undefined>
  >;
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
  prompt: vi.fn<(question: string) => Promise<string>>(),
  tryGetAudioFileTypeFromFile: vi.fn<
    typeof import('#tools').tryGetAudioFileTypeFromFile
  >(),
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

  taggerToolMocks.tryGetAudioFileTypeFromFile.mockImplementation(
    actual.tryGetAudioFileTypeFromFile,
  );

  return {
    ...actual,
    executeCommandSync: taggerToolMocks.executeCommandSync,
    downloadImage: taggerToolMocks.downloadImage,
    isSupportedArtworkFile: taggerToolMocks.isSupportedArtworkFile,
    prompt: taggerToolMocks.prompt,
    tryGetAudioFileTypeFromFile: taggerToolMocks.tryGetAudioFileTypeFromFile,
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

function createLocalTrackInfo(
  overrides: Partial<TrackInfo> = {},
): TrackInfo {
  return {
    artists: ['Artist One'],
    title: 'Example Track',
    details: { durationMs: 245_000 },
    ...overrides,
  };
}

function mockSuccessfulMp3TagRead(trackInfo: TrackInfo): void {
  mockSpawnSyncResults(
    createSpawnSyncResult(JSON.stringify(trackInfo)),
  );
}

function createFlacPictureBlock(
  metadataBlockNumber: string,
  pictureType: number,
  pictureTypeDescription: string,
  mimeType?: string,
): string {
  const lines = [
    `METADATA block #${metadataBlockNumber}`,
    `  type: ${pictureType} (${pictureTypeDescription})`,
  ];

  if (mimeType !== undefined) {
    lines.push(`  MIME type: ${mimeType}`);
  }

  return lines.join('\n');
}

function mockFlacTagTransfer(
  tagOutput: string,
  pictureBlocksResult: MockSpawnSyncResult,
  ...pictureExportResults: MockSpawnSyncResult[]
): typeof childProcessMocks.spawnSync {
  return mockSpawnSyncResults(
    createSpawnSyncResult(tagOutput),
    createSpawnSyncResult('441000\n44100\n'),
    pictureBlocksResult,
    ...pictureExportResults,
  );
}

function createMockDataProvider(): MockDataProvider {
  return {
    findTrackCandidates: vi
      .fn<
        (inputKeywords: readonly string[]) => Promise<readonly TrackInfo[] | undefined>
      >()
      .mockResolvedValue([]),
    getTrackInfo: vi
      .fn<(trackUrl: URL) => Promise<TrackInfo | undefined>>()
      .mockResolvedValue(undefined),
  } satisfies BearTunesTaggerOptions['dataProvider'];
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
    vi.spyOn(logger, 'silly').mockReturnValue(logger);

    taggerToolMocks.executeCommandSync.mockReset();
    taggerToolMocks.executeCommandSync.mockImplementation(() =>
      createMockCommandOutput(),
    );
    taggerToolMocks.tryGetAudioFileTypeFromFile.mockClear();
    taggerToolMocks.downloadImage.mockReset();
    taggerToolMocks.isSupportedArtworkFile.mockReset();
    taggerToolMocks.prompt.mockReset();
    taggerToolMocks.prompt.mockResolvedValue('n');
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

    describe('unexpected errors', () => {
      it('returns UnexpectedPreparationError when audio format detection throws', async () => {
        const trackPath = createSourceAudioFile('format-detection-error.mp3');
        const detectionError = new Error('Audio format detection failed');
        const tagger = new BearTunesTagger();
        taggerToolMocks.tryGetAudioFileTypeFromFile.mockRejectedValueOnce(
          detectionError,
        );

        const result = await tagger.readTag(trackPath);

        const failure = expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.UnexpectedPreparationError,
        );
        expect(failure.error.message).toContain(detectionError.message);
        expect(taggerToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledOnce();
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

        it('ignores malformed FLAC tag lines and reads the remaining metadata', async () => {
          const trackPath = createSourceAudioFile('malformed-tags-track.flac');
          const tagger = new BearTunesTagger();
          const malformedTagOutput = [
            'ARTIST=Artist One',
            'malformed line without a separator',
            '=EMPTY_TAG_NAME',
            'ARTIST=Artist Two',
            'TITLE=Example Track',
            'ALBUM=Example Album',
            'ALBUMARTIST=Album Artist',
            'TRACKNUMBER=03',
            'TRACKTOTAL=12',
            'GENRE=House',
            'DATE=2024-05-18',
          ].join('\n');
          const spawnSyncMock = mockSpawnSyncResults(
            createSpawnSyncResult(malformedTagOutput),
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
                artists: ['Album Artist'],
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

        it('returns available metadata when optional FLAC tags are missing', async () => {
          const trackPath = createSourceAudioFile('partial-tags-track.flac');
          const tagger = new BearTunesTagger();
          const partialTagOutput = [
            'ARTIST=Artist One',
            'TITLE=Example Track',
            'GENRE=House',
          ].join('\n');
          const spawnSyncMock = mockSpawnSyncResults(
            createSpawnSyncResult(partialTagOutput),
            createSpawnSyncResult('441000\n44100\n'),
          );

          const result = await tagger.readTag(trackPath);

          expect(expectTaggerSuccess(result)).toEqual({
            ok: true,
            trackInfo: {
              artists: ['Artist One'],
              title: 'Example Track',
              genre: 'House',
              details: { durationMs: 10000 },
            },
          });
          expect(spawnSyncMock).toHaveBeenCalledTimes(2);
          expectFlacReadCommands(spawnSyncMock, trackPath);
        });
      });

      describe('invalid reader output', () => {
        it('returns TagReadOutputInvalid when extracted FLAC metadata fails schema validation', async () => {
          const trackPath = createSourceAudioFile('invalid-flac-metadata-track.flac');
          const tagger = new BearTunesTagger();
          const invalidTagOutput = 'TITLE=Example Track\nDATE=0000-01-01';
          const spawnSyncMock = mockSpawnSyncResults(
            createSpawnSyncResult(invalidTagOutput),
            createSpawnSyncResult('441000\n44100\n'),
          );

          const result = await tagger.readTag(trackPath);

          const failure = expectTaggerFailure(
            result,
            BearTunesTaggerFailureCode.TagReadOutputInvalid,
          );
          expect(failure.error.message).toContain(
            'Cannot validate FLAC tag output',
          );
          expect(failure.details).toHaveProperty('issues');
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

    describe('format detection errors', () => {
      it('returns UnexpectedExecutionError when audio format detection throws', async () => {
        const trackPath = createSourceAudioFile('format-detection-error.mp3');
        const detectionError = new Error('Audio format detection failed');
        const tagger = new BearTunesTagger();
        taggerToolMocks.tryGetAudioFileTypeFromFile.mockRejectedValueOnce(
          detectionError,
        );

        const result = await tagger.saveTag(trackPath, createTrackInfo());

        const failure = expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.UnexpectedExecutionError,
        );
        expect(failure.error.message).toContain(detectionError.message);
        expect(taggerToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledOnce();
        expect(taggerToolMocks.downloadImage).not.toHaveBeenCalled();
        expect(taggerToolMocks.executeCommandSync).not.toHaveBeenCalled();
      });

      it('returns TagWriteInputFileTypeMismatch when the file format changes before tag writing', async () => {
        const trackPath = createSourceAudioFile('changed-format-track.mp3');
        const tagger = new BearTunesTagger();
        taggerToolMocks.tryGetAudioFileTypeFromFile
          .mockResolvedValueOnce(AudioFileType.Mp3)
          .mockResolvedValueOnce(AudioFileType.Flac);

        const result = await tagger.saveTag(trackPath, createTrackInfo());

        const failure = expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TagWriteInputFileTypeMismatch,
        );
        expect(failure.details).toEqual({
          expectedAudioFileType: AudioFileType.Mp3,
          actualAudioFileType: AudioFileType.Flac,
          trackPath,
        });
        expect(taggerToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledTimes(2);
        expect(taggerToolMocks.downloadImage).not.toHaveBeenCalled();
        expect(taggerToolMocks.executeCommandSync).not.toHaveBeenCalled();
      });
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

        it('logs downloaded artwork paths when verbose mode is enabled', async () => {
          const trackPath = createSourceAudioFile('verbose-artwork-track.mp3');
          const trackInfo = createTrackInfo();
          trackInfo.album = {
            title: 'Example Album',
            artwork: new URL('https://images.example.com/example-album.jpg'),
          };
          const downloadedPaths = mockSuccessfulArtworkDownloads();
          const tagger = new BearTunesTagger({ verbose: true });

          const result = await tagger.saveTag(trackPath, trackInfo);

          expectTaggerSuccess(result);
          expect(logger.debug).toHaveBeenCalledWith(
            `Album artwork written to: ${downloadedPaths[0]}`,
          );
        });

        it('logs eyeD3 command output when eyed3Verbose is enabled', async () => {
          const trackPath = createSourceAudioFile('verbose-eyed3-track.mp3');
          const tagger = new BearTunesTagger({ eyed3Verbose: true });
          const commandOutput = Buffer.from('eyeD3 verbose output');
          taggerToolMocks.executeCommandSync.mockImplementation(() => ({
            ...createMockCommandOutput(),
            stdout: commandOutput,
          }));

          const result = await tagger.saveTag(trackPath, createTrackInfo());

          expectTaggerSuccess(result);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledTimes(3);
          expect(logger.info).toHaveBeenCalledTimes(3);
          expect(logger.info).toHaveBeenNthCalledWith(1, commandOutput);
          expect(logger.info).toHaveBeenNthCalledWith(2, commandOutput);
          expect(logger.info).toHaveBeenNthCalledWith(3, commandOutput);
        });

        it('writes remixers and unique file identifier', async () => {
          const trackPath = createSourceAudioFile('remixers-ufid-track.mp3');
          const trackUrl = new URL('https://music.example.com/tracks/remixed-track');
          const trackInfo = createTrackInfo({
            remixers: ['Remixer One', 'Remixer Two'],
            url: trackUrl,
            ufid: 'BEATPORT-123456',
          });
          const tagger = new BearTunesTagger();

          const result = await tagger.saveTag(trackPath, trackInfo);

          expect(expectTaggerSuccess(result).trackInfo).toBe(trackInfo);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenNthCalledWith(
            2,
            EYED3_EXECUTABLE,
            expect.arrayContaining([
              '--v2',
              '--to-v2.4',
              '--text-frame',
              'TPE4:Remixer One, Remixer Two',
              '--unique-file-id',
              'https\\://music.example.com:BEATPORT-123456',
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

      describe('artwork cleanup', () => {
        it('preserves the tag writing result when temporary artwork cleanup fails', async () => {
          const trackPath = createSourceAudioFile('artwork-cleanup-error.mp3');
          const artworkUrl = new URL('https://images.example.com/cover.jpg');
          const downloadedPaths = mockSuccessfulArtworkDownloads();
          const tagger = new BearTunesTagger();
          let commandCount = 0;

          taggerToolMocks.executeCommandSync.mockImplementation(() => {
            commandCount += 1;
            const artworkPath = downloadedPaths[0];

            if (commandCount === 3 && artworkPath !== undefined) {
              fs.unlinkSync(artworkPath);
            }

            return createMockCommandOutput();
          });

          const result = await tagger.saveTag(
            trackPath,
            createTrackInfo({
              album: { title: 'Example Album', artwork: artworkUrl },
            }),
          );

          expectTaggerSuccess(result);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledTimes(3);
          expect(downloadedPaths).toHaveLength(1);
          expect(fs.existsSync(downloadedPaths[0])).toBe(false);

          const warningCalls: readonly (readonly unknown[])[] =
            vi.mocked(logger.warn).mock.calls;

          const cleanupWarning = warningCalls.find(
            ([message]) =>
              message === `Failed to remove temporary artwork file: ${downloadedPaths[0]}`,
          );

          expect(cleanupWarning).toBeDefined();

          if (cleanupWarning === undefined) {
            throw new Error('Expected cleanup warning to be logged.');
          }

          const warningContext: unknown = cleanupWarning[1];

          if (
            typeof warningContext !== 'object'
            || warningContext === null
            || !('error' in warningContext)
          ) {
            throw new Error('Expected cleanup warning to include the error context.');
          }

          expect(warningContext.error).toBeInstanceOf(Error);
        });
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

        it('returns ArtworkValidationFailed when artwork validation throws', async () => {
          const trackPath = createSourceAudioFile('artwork-validation-throws.mp3');
          const artworkPath = path.join(temporaryDirectory, 'validation-error-cover.jpg');
          fs.writeFileSync(artworkPath, 'Temporary artwork content');
          const artworkUrl = new URL('https://images.example.com/cover.jpg');
          const validationError = new Error('Artwork validator failed');
          const tagger = new BearTunesTagger();
          taggerToolMocks.downloadImage.mockResolvedValue(artworkPath);
          taggerToolMocks.isSupportedArtworkFile.mockRejectedValue(validationError);

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
            'Cannot validate front cover artwork file',
          );
          expect(failure.error.cause).toBe(validationError);
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

        it('logs downloaded artwork paths when verbose mode is enabled', async () => {
          const trackPath = createSourceAudioFile('verbose-artwork-track.flac');
          const trackInfo = createTrackInfo();
          trackInfo.album = {
            title: 'Example Album',
            artwork: new URL('https://images.example.com/example-album.jpg'),
          };
          const downloadedPaths = mockSuccessfulArtworkDownloads();
          const tagger = new BearTunesTagger({ verbose: true });

          const result = await tagger.saveTag(trackPath, trackInfo);

          expectTaggerSuccess(result);
          expect(logger.debug).toHaveBeenCalledWith(
            `Album artwork written to: ${downloadedPaths[0]}`,
          );
        });

        it('logs metaflac command output when metaflacVerbose is enabled', async () => {
          const trackPath = createSourceAudioFile('verbose-metaflac-track.flac');
          const tagger = new BearTunesTagger({ metaflacVerbose: true });
          const commandOutput = Buffer.from('metaflac verbose output');
          taggerToolMocks.executeCommandSync.mockImplementation(() => ({
            ...createMockCommandOutput(),
            stdout: commandOutput,
          }));

          const result = await tagger.saveTag(trackPath, createTrackInfo());

          expectTaggerSuccess(result);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledOnce();
          expect(logger.info).toHaveBeenCalledOnce();
          expect(logger.info).toHaveBeenCalledWith(commandOutput);
        });

        it('writes remixers, publisher metadata, and unique file identifier', async () => {
          const trackPath = createSourceAudioFile('complete-flac-metadata-track.flac');
          const publisherUrl = new URL('https://labels.example.com/labels/example-label');
          const trackInfo = createTrackInfo({
            remixers: ['Remixer One', 'Remixer Two'],
            publisher: {
              name: 'Example Label',
              url: publisherUrl,
            },
            ufid: 'BEATPORT-123456',
          });
          const tagger = new BearTunesTagger();

          const result = await tagger.saveTag(trackPath, trackInfo);

          expect(expectTaggerSuccess(result).trackInfo).toBe(trackInfo);
          expect(taggerToolMocks.executeCommandSync).toHaveBeenCalledWith(
            'metaflac',
            expect.arrayContaining([
              '--remove-tag=REMIXED BY',
              '--set-tag=REMIXED BY=Remixer One, Remixer Two',
              '--remove-tag=PUBLISHER URL',
              `--set-tag=PUBLISHER URL=${publisherUrl.toString()}`,
              '--remove-tag=PUBLISHER',
              '--set-tag=PUBLISHER=Example Label',
              '--remove-tag=GROUPING',
              '--set-tag=GROUPING=Example Label',
              '--remove-tag=UFID',
              '--set-tag=UFID=BEATPORT-123456',
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

        it('embeds front cover, waveform, and publisher logotype artwork', async () => {
          const trackPath = createSourceAudioFile('flac-multiple-artwork-track.flac');
          const trackUrl = new URL('https://example.com/tracks/example-track');
          const albumUrl = new URL('https://example.com/albums/example-album');
          const publisherUrl = new URL('https://example.com/labels/example-label');
          const albumArtworkUrl = new URL('https://images.example.com/cover.jpg');
          const waveformUrl = new URL('https://images.example.com/waveform.png');
          const publisherLogotypeUrl = new URL('https://images.example.com/label.png');
          const trackInfo = createTrackInfo({
            url: trackUrl,
            album: {
              title: 'Example Album',
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
          expect(taggerToolMocks.isSupportedArtworkFile).toHaveBeenNthCalledWith(
            1,
            downloadedPaths[1],
          );
          expect(taggerToolMocks.isSupportedArtworkFile).toHaveBeenNthCalledWith(
            2,
            downloadedPaths[2],
          );
          expect(taggerToolMocks.isSupportedArtworkFile).toHaveBeenNthCalledWith(
            3,
            downloadedPaths[0],
          );
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
              `--import-picture-from=3||Front Cover||${downloadedPaths[1]}`,
              `--import-picture-from=17||Waveform||${downloadedPaths[2]}`,
              `--import-picture-from=20||Publisher Logotype||${downloadedPaths[0]}`,
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

  describe('resolveTrackInfo', () => {
    describe('input validation and local tag reading', () => {
      it('returns InputFileAccessError when the input file does not exist', async () => {
        const trackPath = path.join(sourceDirectory, 'missing-track.mp3');
        const dataProvider = createMockDataProvider();
        const tagger = new BearTunesTagger({ dataProvider });

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.InputFileAccessError,
        );
        expect(childProcessMocks.spawnSync).not.toHaveBeenCalled();
        expect(dataProvider.findTrackCandidates).not.toHaveBeenCalled();
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });

      it('returns UnexpectedExecutionError when local tag reading unexpectedly throws', async () => {
        const trackPath = createSourceAudioFile('unexpected-reader-error-track.mp3');
        const readError = new Error('Unexpected local tag reader failure');
        const dataProvider = createMockDataProvider();
        const tagger = new BearTunesTagger({ dataProvider });
        const readTagSpy = vi.spyOn(tagger, 'readTag').mockRejectedValue(readError);

        const result = await tagger.resolveTrackInfo(trackPath);

        const failure = expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.UnexpectedExecutionError,
        );
        expect(failure.error.message).toContain(readError.message);
        expect(readTagSpy).toHaveBeenCalledOnce();
        expect(readTagSpy).toHaveBeenCalledWith(trackPath);
        expect(dataProvider.findTrackCandidates).not.toHaveBeenCalled();
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });

      it('returns the local tag reading failure without querying the data provider', async () => {
        const trackPath = createSourceAudioFile('reader-error-track.mp3');
        const dataProvider = createMockDataProvider();
        const tagger = new BearTunesTagger({ dataProvider });

        mockSpawnSyncResults(
          createSpawnSyncResult('', { status: 2 }),
        );

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.ID3TagReadExecutionFailed,
        );
        expect(dataProvider.findTrackCandidates).not.toHaveBeenCalled();
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });
    });

    describe('sibling URL file', () => {
      it('uses a valid sibling URL file instead of searching for candidates', async () => {
        const trackPath = createSourceAudioFile('url-file-track.mp3');
        const trackUrl = new URL('https://example.com/tracks/url-file-track');
        const urlFilePath = path.join(
          sourceDirectory,
          'url-file-track.url',
        );
        const localTrackInfo = createLocalTrackInfo();
        const remoteTrackInfo = createTrackInfo();
        const dataProvider = createMockDataProvider();
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        const tagger = new BearTunesTagger({ dataProvider });

        fs.writeFileSync(urlFilePath, `[InternetShortcut]\nURL=${trackUrl.href}\n`);
        mockSuccessfulMp3TagRead(localTrackInfo);

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(dataProvider.findTrackCandidates).not.toHaveBeenCalled();
        expect(dataProvider.getTrackInfo).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(trackUrl);
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });

      it('returns TrackUrlFileInvalid when the sibling URL file contains no valid URL', async () => {
        const trackPath = createSourceAudioFile('invalid-url-track.mp3');
        const urlFilePath = path.join(
          sourceDirectory,
          'invalid-url-track.url',
        );
        const dataProvider = createMockDataProvider();
        const tagger = new BearTunesTagger({ dataProvider });

        fs.writeFileSync(urlFilePath, 'This file does not contain a valid URL.');
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackUrlFileInvalid,
        );
        expect(dataProvider.findTrackCandidates).not.toHaveBeenCalled();
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });

      it('returns TrackUrlFileReadFailed when the sibling URL file cannot be read', async () => {
        const trackPath = createSourceAudioFile('unreadable-url-track.mp3');
        const urlFilePath = path.join(
          sourceDirectory,
          'unreadable-url-track.url',
        );
        const dataProvider = createMockDataProvider();
        const tagger = new BearTunesTagger({ dataProvider });

        // A directory at the URL file path causes readFile() to fail reliably.
        fs.mkdirSync(urlFilePath);
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackUrlFileReadFailed,
        );
        expect(dataProvider.findTrackCandidates).not.toHaveBeenCalled();
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });
    });

    describe('data provider integration', () => {
      it('searches candidates using filename keywords and retrieves metadata for the best match', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const localTrackInfo = createLocalTrackInfo();
        const lessRelevantUrl = new URL(
          'https://example.com/tracks/less-relevant',
        );
        const bestMatchUrl = new URL(
          'https://example.com/tracks/best-match',
        );
        const lessRelevantCandidate = createTrackInfo({
          artists: ['Unrelated Artist'],
          title: 'Example',
          url: lessRelevantUrl,
        });
        const bestMatchCandidate = createTrackInfo({
          url: bestMatchUrl,
        });
        const remoteTrackInfo = createTrackInfo({
          title: 'Canonical Track Title',
        });
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([
          lessRelevantCandidate,
          bestMatchCandidate,
        ]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(localTrackInfo);

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(dataProvider.findTrackCandidates).toHaveBeenCalledOnce();
        expect(dataProvider.findTrackCandidates).toHaveBeenCalledWith([
          'Artist',
          'One',
          'Example',
          'Track',
        ]);
        expect(dataProvider.getTrackInfo).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(bestMatchUrl);
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });

      it('returns TrackMatchFailed when the provider returns no candidates', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue(undefined);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackMatchFailed,
        );
        expect(dataProvider.findTrackCandidates).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });

      it('returns TrackMatchFailed when the provider returns an empty candidate list', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue([]);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackMatchFailed,
        );
        expect(dataProvider.findTrackCandidates).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });

      it('ignores candidates without a title', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const incompleteCandidateUrl = new URL(
          'https://example.com/tracks/missing-title',
        );
        const validCandidateUrl = new URL(
          'https://example.com/tracks/valid-candidate',
        );
        const incompleteCandidate = createTrackInfo({
          title: undefined,
          url: incompleteCandidateUrl,
        });
        const validCandidate = createTrackInfo({
          artists: ['Artist One'],
          title: 'Example Track',
          url: validCandidateUrl,
        });
        const remoteTrackInfo = createTrackInfo({
          details: { durationMs: 245_000 },
        });
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue([
          incompleteCandidate,
          validCandidate,
        ]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(dataProvider.getTrackInfo).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(validCandidateUrl);
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalledWith(
          incompleteCandidateUrl,
        );
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });

      it('ignores candidates without artists', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const incompleteCandidateUrl = new URL(
          'https://example.com/tracks/missing-artists',
        );
        const validCandidateUrl = new URL(
          'https://example.com/tracks/valid-candidate',
        );
        const incompleteCandidate = createTrackInfo({
          artists: [],
          url: incompleteCandidateUrl,
        });
        const validCandidate = createTrackInfo({
          artists: ['Artist One'],
          title: 'Example Track',
          url: validCandidateUrl,
        });
        const remoteTrackInfo = createTrackInfo({
          details: { durationMs: 245_000 },
        });
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue([
          incompleteCandidate,
          validCandidate,
        ]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(dataProvider.getTrackInfo).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(validCandidateUrl);
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalledWith(
          incompleteCandidateUrl,
        );
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });

      it('ignores candidates without duration metadata', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const incompleteCandidate: TrackInfo = {
          artists: ['Artist One'],
          title: 'Example Track',
          url: new URL('https://example.com/tracks/example-track'),
        };
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue([
          incompleteCandidate,
        ]);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackMatchFailed,
        );
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });

      it('returns TrackMatchFailed when candidate search throws an error', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const providerError = new Error('Candidate search failed');
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockRejectedValue(providerError);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        const failure = expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackMatchFailed,
        );
        expect(failure.error.cause).toBe(providerError);
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });

      it('returns TrackDataFetchFailed when the selected candidate has no URL', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const candidateWithoutUrl = createTrackInfo({
          url: undefined,
        });
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue([
          candidateWithoutUrl,
        ]);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackDataFetchFailed,
        );
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });

      it('returns TrackDataFetchFailed when the provider returns undefined metadata', async () => {
        const trackPath = createSourceAudioFile('url-file-track.mp3');
        const trackUrl = new URL('https://example.com/tracks/missing-metadata');
        const urlFilePath = path.join(sourceDirectory, 'url-file-track.url');
        const dataProvider = createMockDataProvider();
        dataProvider.getTrackInfo.mockResolvedValue(undefined);
        const tagger = new BearTunesTagger({ dataProvider });

        fs.writeFileSync(urlFilePath, `URL=${trackUrl.href}\n`);
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackDataFetchFailed,
        );
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(trackUrl);
      });

      it('returns TrackDataRequestFailed when retrieving metadata throws an error', async () => {
        const trackPath = createSourceAudioFile('url-file-track.mp3');
        const trackUrl = new URL('https://example.com/tracks/request-error');
        const urlFilePath = path.join(sourceDirectory, 'url-file-track.url');
        const providerError = new Error('Metadata request failed');
        const dataProvider = createMockDataProvider();
        dataProvider.getTrackInfo.mockRejectedValue(providerError);
        const tagger = new BearTunesTagger({ dataProvider });

        fs.writeFileSync(urlFilePath, `URL=${trackUrl.href}\n`);
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        const failure = expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackDataRequestFailed,
        );
        expect(failure.error.cause).toBe(providerError);
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(trackUrl);
      });
    });

    describe('candidate ranking', () => {
      function createRankableCandidate(
        url: URL,
        overrides: Partial<TrackInfo> = {},
      ): TrackInfo {
        return createTrackInfo({
          artists: ['Artist One'],
          title: 'Example Track',
          url,
          ...overrides,
        });
      }

      it('prefers the candidate with an earlier release date when scores are equal', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const laterReleaseUrl = new URL(
          'https://example.com/tracks/later-release',
        );
        const earlierReleaseUrl = new URL(
          'https://example.com/tracks/earlier-release',
        );
        const laterReleaseCandidate = createRankableCandidate(
          laterReleaseUrl,
          { released: new Date('2024-05-19') },
        );
        const earlierReleaseCandidate = createRankableCandidate(
          earlierReleaseUrl,
          { released: new Date('2024-05-17') },
        );
        const remoteTrackInfo = createTrackInfo({
          details: { durationMs: 245_000 },
        });
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue([
          laterReleaseCandidate,
          earlierReleaseCandidate,
        ]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(dataProvider.getTrackInfo).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(earlierReleaseUrl);
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });

      it('prefers the candidate with a closer duration when scores are equal', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const fartherDurationUrl = new URL(
          'https://example.com/tracks/farther-duration',
        );
        const closerDurationUrl = new URL(
          'https://example.com/tracks/closer-duration',
        );
        const fartherDurationCandidate = createRankableCandidate(
          fartherDurationUrl,
          {
            released: new Date('2024-05-18'),
            details: { durationMs: 260_000 },
          },
        );
        const closerDurationCandidate = createRankableCandidate(
          closerDurationUrl,
          {
            released: new Date('2024-05-18'),
            details: { durationMs: 248_000 },
          },
        );
        const remoteTrackInfo = createTrackInfo({
          details: { durationMs: 245_000 },
        });
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue([
          fartherDurationCandidate,
          closerDurationCandidate,
        ]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(dataProvider.getTrackInfo).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(closerDurationUrl);
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });

      it('keeps the first candidate when score, release date, and duration are equal', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const firstCandidateUrl = new URL(
          'https://example.com/tracks/first-candidate',
        );
        const secondCandidateUrl = new URL(
          'https://example.com/tracks/second-candidate',
        );
        const firstCandidate = createRankableCandidate(firstCandidateUrl, {
          released: new Date('2024-05-18'),
          details: { durationMs: 248_000 },
        });
        const secondCandidate = createRankableCandidate(secondCandidateUrl, {
          released: new Date('2024-05-18'),
          details: { durationMs: 248_000 },
        });
        const remoteTrackInfo = createTrackInfo({
          details: { durationMs: 245_000 },
        });
        const dataProvider = createMockDataProvider();
        dataProvider.findTrackCandidates.mockResolvedValue([
          firstCandidate,
          secondCandidate,
        ]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        const tagger = new BearTunesTagger({ dataProvider });

        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(dataProvider.getTrackInfo).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(firstCandidateUrl);
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalledWith(
          secondCandidateUrl,
        );
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });
    });

    describe('weak track matches', () => {
      function createWeakMatchCandidate(): TrackInfo {
        return createTrackInfo({
          artists: ['Different Artist'],
          title: 'Example Track',
        });
      }

      it('accepts a weak match when the user confirms it', async () => {
        const trackPath = createSourceAudioFile('Example.mp3');
        const candidate = createWeakMatchCandidate();
        const remoteTrackInfo = createTrackInfo();
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([candidate]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        taggerToolMocks.prompt.mockResolvedValue('y');

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(taggerToolMocks.prompt).toHaveBeenCalledOnce();
        expect(taggerToolMocks.prompt).toHaveBeenCalledWith(
          'Proceed with the found track? (y/n) ',
        );
        expect(dataProvider.getTrackInfo).toHaveBeenCalledWith(candidate.url);
      });

      it('returns TrackMatchRejected when the user rejects a weak match', async () => {
        const trackPath = createSourceAudioFile('Example.mp3');
        const candidate = createWeakMatchCandidate();
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([candidate]);
        taggerToolMocks.prompt.mockResolvedValue('n');

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackMatchRejected,
        );
        expect(taggerToolMocks.prompt).toHaveBeenCalledOnce();
        expect(dataProvider.getTrackInfo).not.toHaveBeenCalled();
      });
    });

    describe('duration mismatch', () => {
      function createMatchingCandidate(): TrackInfo {
        return createTrackInfo({
          artists: ['Artist One'],
          title: 'Example Track',
          details: { durationMs: 245_000 },
        });
      }

      it('does not request confirmation when the duration difference equals the accepted threshold', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const candidate = createMatchingCandidate();
        const remoteTrackInfo = createTrackInfo({
          details: { durationMs: 248_000 },
        });
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([candidate]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });

      it('changes the title to Radio Edit when the duration mismatch is confirmed', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const candidate = createMatchingCandidate();
        const remoteTrackInfo = createTrackInfo({
          title: 'Example Track (Original Mix)',
          details: { durationMs: 248_001 },
        });
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([candidate]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        taggerToolMocks.prompt.mockResolvedValue('y');

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        const success = expectTaggerSuccess(result);

        expect(success.trackInfo).toMatchObject({
          title: 'Example Track (Radio Edit)',
        });
        expect(success.trackInfo).not.toBe(remoteTrackInfo);
        expect(remoteTrackInfo.title).toBe('Example Track (Original Mix)');
        expect(taggerToolMocks.prompt).toHaveBeenCalledOnce();
        expect(taggerToolMocks.prompt).toHaveBeenCalledWith(
          'Change it to "Radio Edit"? (y)es/(n)o/(s)kip: ',
        );
      });

      it('keeps the original title when the user declines the Radio Edit change', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const candidate = createMatchingCandidate();
        const remoteTrackInfo = createTrackInfo({
          title: 'Example Track (Original Mix)',
          details: { durationMs: 248_001 },
        });
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([candidate]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        taggerToolMocks.prompt.mockResolvedValue('n');

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(remoteTrackInfo.title).toBe('Example Track (Original Mix)');
        expect(taggerToolMocks.prompt).toHaveBeenCalledOnce();
      });

      it('returns TrackMatchRejected when the user skips a duration mismatch', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const candidate = createMatchingCandidate();
        const remoteTrackInfo = createTrackInfo({
          details: { durationMs: 248_001 },
        });
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([candidate]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);
        taggerToolMocks.prompt.mockResolvedValue('s');

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expectTaggerFailure(
          result,
          BearTunesTaggerFailureCode.TrackMatchRejected,
        );
        expect(taggerToolMocks.prompt).toHaveBeenCalledOnce();
      });

      it('does not request confirmation when the remote duration is unavailable', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const candidate = createMatchingCandidate();
        const remoteTrackInfo = createTrackInfo({
          details: undefined,
        });
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([candidate]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(createLocalTrackInfo());

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });

      it('does not request confirmation when the local duration is unavailable', async () => {
        const trackPath = createSourceAudioFile(
          'Artist One Example Track.mp3',
        );
        const candidate = createMatchingCandidate();
        const remoteTrackInfo = createTrackInfo({
          details: { durationMs: 300_000 },
        });
        const dataProvider = createMockDataProvider();

        dataProvider.findTrackCandidates.mockResolvedValue([candidate]);
        dataProvider.getTrackInfo.mockResolvedValue(remoteTrackInfo);

        const tagger = new BearTunesTagger({ dataProvider });
        mockSuccessfulMp3TagRead(
          createLocalTrackInfo({ details: undefined }),
        );

        const result = await tagger.resolveTrackInfo(trackPath);

        expect(expectTaggerSuccess(result).trackInfo).toBe(remoteTrackInfo);
        expect(taggerToolMocks.prompt).not.toHaveBeenCalled();
      });
    });
  });

  describe('processTrack', () => {
    describe('track resolution', () => {
      it('returns the resolution failure without attempting to write tags', async () => {
        const trackPath = createSourceAudioFile('resolution-error-track.mp3');
        const tagger = new BearTunesTagger();
        const resolutionFailure: BearTunesTaggerFailureResult = {
          ok: false,
          failureCode: BearTunesTaggerFailureCode.TrackMatchFailed,
          error: new Error('Track matching failed'),
        };
        const resolveTrackInfoSpy = vi
          .spyOn(tagger, 'resolveTrackInfo')
          .mockResolvedValue(resolutionFailure);
        const saveTagSpy = vi.spyOn(tagger, 'saveTag');

        const result = await tagger.processTrack(trackPath);

        expect(result).toBe(resolutionFailure);
        expect(resolveTrackInfoSpy).toHaveBeenCalledOnce();
        expect(resolveTrackInfoSpy).toHaveBeenCalledWith(trackPath);
        expect(saveTagSpy).not.toHaveBeenCalled();
      });
    });

    describe('tag writing', () => {
      it('passes resolved track metadata to saveTag and returns its result', async () => {
        const trackPath = createSourceAudioFile('successful-track.mp3');
        const trackInfo = createTrackInfo();
        const tagger = new BearTunesTagger();
        const resolutionSuccess: BearTunesTaggerSuccessResult = {
          ok: true,
          trackInfo,
        };
        const saveResult: BearTunesTaggerSuccessResult = {
          ok: true,
          trackInfo,
        };
        const resolveTrackInfoSpy = vi
          .spyOn(tagger, 'resolveTrackInfo')
          .mockResolvedValue(resolutionSuccess);
        const saveTagSpy = vi
          .spyOn(tagger, 'saveTag')
          .mockResolvedValue(saveResult);

        const result = await tagger.processTrack(trackPath);

        expect(result).toBe(saveResult);
        expect(resolveTrackInfoSpy).toHaveBeenCalledOnce();
        expect(resolveTrackInfoSpy).toHaveBeenCalledWith(trackPath);
        expect(saveTagSpy).toHaveBeenCalledOnce();
        expect(saveTagSpy).toHaveBeenCalledWith(trackPath, trackInfo);
      });

      it('returns the tag writing failure when saving tags fails', async () => {
        const trackPath = createSourceAudioFile('write-error-track.mp3');
        const trackInfo = createTrackInfo();
        const tagger = new BearTunesTagger();
        const resolutionSuccess: BearTunesTaggerSuccessResult = {
          ok: true,
          trackInfo,
        };
        const saveFailure: BearTunesTaggerFailureResult = {
          ok: false,
          failureCode: BearTunesTaggerFailureCode.EyeD3TagWriteExecutionFailed,
          error: new Error('MP3 tag writing failed'),
        };
        const resolveTrackInfoSpy = vi
          .spyOn(tagger, 'resolveTrackInfo')
          .mockResolvedValue(resolutionSuccess);
        const saveTagSpy = vi
          .spyOn(tagger, 'saveTag')
          .mockResolvedValue(saveFailure);

        const result = await tagger.processTrack(trackPath);

        expect(result).toBe(saveFailure);
        expect(resolveTrackInfoSpy).toHaveBeenCalledOnce();
        expect(saveTagSpy).toHaveBeenCalledOnce();
        expect(saveTagSpy).toHaveBeenCalledWith(trackPath, trackInfo);
      });
    });
  });

  describe('prepareMp3TagTransferFromFlac', () => {
    describe('metadata preparation', () => {
      it('maps FLAC metadata to LAME tag options', () => {
        const trackPath = createSourceAudioFile('metadata-transfer-track.flac');
        const tagger = new BearTunesTagger();
        const spawnSyncMock = mockFlacTagTransfer(
          flacTagOutput,
          createSpawnSyncResult(''),
        );

        const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

        expect(result).toEqual({
          lameTagOptions: [
            '--add-id3v2',
            '--tt',
            'Example Track',
            '--ta',
            'Artist One, Artist Two',
            '--tg',
            'House',
            '--ty',
            '2024',
            '--tv',
            'TORY=2024-05-18',
            '--tl',
            'Example Album',
            '--tn',
            '3/12',
          ],
          temporaryFiles: [],
        });

        expect(spawnSyncMock).toHaveBeenCalledTimes(3);
        expectFlacReadCommands(spawnSyncMock, trackPath);
        expect(spawnSyncMock).toHaveBeenNthCalledWith(
          3,
          'metaflac',
          ['--list', '--block-type=PICTURE', trackPath],
          { encoding: 'utf8' },
        );
      });

      it('returns empty LAME options when no transferable metadata or artwork is available', () => {
        const trackPath = createSourceAudioFile('empty-metadata-track.flac');
        const tagger = new BearTunesTagger();
        const spawnSyncMock = mockFlacTagTransfer(
          '',
          createSpawnSyncResult(''),
        );

        const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

        expect(result).toEqual({
          lameTagOptions: [],
          temporaryFiles: [],
        });
        expect(spawnSyncMock).toHaveBeenCalledTimes(3);
      });

      it('includes the track number without a total when the total is unavailable', () => {
        const trackPath = createSourceAudioFile('single-track-number.flac');
        const tagger = new BearTunesTagger();

        mockFlacTagTransfer(
          'ALBUM=Example Album\nTRACKNUMBER=03',
          createSpawnSyncResult(''),
        );

        const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

        expect(result.lameTagOptions).toEqual([
          '--add-id3v2',
          '--tl',
          'Example Album',
          '--tn',
          '3',
        ]);
        expect(result.temporaryFiles).toEqual([]);
      });

      it('logs prepared LAME options when verbose mode is enabled', () => {
        const trackPath = createSourceAudioFile('verbose-transfer-track.flac');
        const tagger = new BearTunesTagger({ verbose: true });

        mockFlacTagTransfer(
          flacTagOutput,
          createSpawnSyncResult(''),
        );

        tagger.prepareMp3TagTransferFromFlac(trackPath);

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Using following tag options:'),
        );
      });
    });

    describe('FLAC PICTURE block export', () => {
      it('exports only front cover artwork using its metadata block number', () => {
        const trackPath = createSourceAudioFile('picture-blocks-track.flac');

        const pictureBlocksOutput = [
          createFlacPictureBlock('2', 4, 'Cover (back)', 'image/jpeg'),
          createFlacPictureBlock('5', 3, 'Cover (front)', 'image/jpeg'),
          createFlacPictureBlock('7', 17, 'Bright Colored Fish', 'image/png'),
          createFlacPictureBlock('9', 20, 'Publisher Logo', 'image/png'),
        ].join('\n');

        const tagger = new BearTunesTagger();
        const spawnSyncMock = mockFlacTagTransfer(
          flacTagOutput,
          createSpawnSyncResult(pictureBlocksOutput),
          createSpawnSyncResult(''),
        );

        const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

        expect(result.temporaryFiles).toHaveLength(1);

        const imagePath = result.temporaryFiles[0];

        if (imagePath === undefined) {
          throw new Error('Expected exported front cover image path.');
        }

        expect(result.lameTagOptions).toEqual([
          '--add-id3v2',
          '--tt',
          'Example Track',
          '--ta',
          'Artist One, Artist Two',
          '--tg',
          'House',
          '--ty',
          '2024',
          '--tv',
          'TORY=2024-05-18',
          '--tl',
          'Example Album',
          '--tn',
          '3/12',
          '--ti',
          imagePath,
        ]);

        expect(spawnSyncMock).toHaveBeenCalledTimes(4);
        expect(spawnSyncMock).toHaveBeenNthCalledWith(
          4,
          'metaflac',
          [
            '--block-number=5',
            `--export-picture-to=${imagePath}`,
            trackPath,
          ],
        );
      });

      it('exports multiple front covers and includes all exported paths in temporary files', () => {
        const trackPath = createSourceAudioFile('multiple-front-covers.flac');

        const pictureBlocksOutput = [
          createFlacPictureBlock('5', 3, 'Cover (front)', 'image/jpeg'),
          createFlacPictureBlock('8', 3, 'Cover (front)', 'image/png'),
        ].join('\n');

        const tagger = new BearTunesTagger();
        const spawnSyncMock = mockFlacTagTransfer(
          flacTagOutput,
          createSpawnSyncResult(pictureBlocksOutput),
          createSpawnSyncResult(''),
          createSpawnSyncResult(''),
        );

        const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

        expect(result.temporaryFiles).toHaveLength(2);

        const firstImagePath = result.temporaryFiles[0];
        const secondImagePath = result.temporaryFiles[1];

        if (firstImagePath === undefined || secondImagePath === undefined) {
          throw new Error('Expected both front cover image paths.');
        }

        expect(result.lameTagOptions.slice(-2)).toEqual([
          '--ti',
          firstImagePath,
        ]);

        expect(spawnSyncMock).toHaveBeenNthCalledWith(
          4,
          'metaflac',
          [
            '--block-number=5',
            `--export-picture-to=${firstImagePath}`,
            trackPath,
          ],
        );

        expect(spawnSyncMock).toHaveBeenNthCalledWith(
          5,
          'metaflac',
          [
            '--block-number=8',
            `--export-picture-to=${secondImagePath}`,
            trackPath,
          ],
        );
      });

      describe('invalid PICTURE block metadata', () => {
        const invalidPictureBlockCases: [string, string][] = [
          [
            'an invalid metadata block number',
            createFlacPictureBlock(
              'invalid',
              3,
              'Cover (front)',
              'image/jpeg',
            ),
          ],
          [
            'an unsupported PICTURE type',
            createFlacPictureBlock(
              '5',
              99,
              'Unknown',
              'image/jpeg',
            ),
          ],
          [
            'a missing MIME type',
            createFlacPictureBlock(
              '5',
              3,
              'Cover (front)',
            ),
          ],
        ];

        it.each(invalidPictureBlockCases)(
          'skips PICTURE blocks with %s',
          (_scenario, pictureBlockOutput) => {
            const trackPath = createSourceAudioFile('invalid-picture-block.flac');
            const tagger = new BearTunesTagger();
            const spawnSyncMock = mockFlacTagTransfer(
              flacTagOutput,
              createSpawnSyncResult(pictureBlockOutput),
            );

            const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

            expect(result.lameTagOptions).not.toContain('--ti');
            expect(result.temporaryFiles).toEqual([]);
            expect(spawnSyncMock).toHaveBeenCalledTimes(3);
          },
        );

        it('skips a front cover with an unsupported empty MIME subtype', () => {
          const trackPath = createSourceAudioFile('empty-mime-subtype.flac');
          const pictureBlocksOutput = createFlacPictureBlock(
            '5',
            3,
            'Cover (front)',
            'image/',
          );
          const tagger = new BearTunesTagger();
          const spawnSyncMock = mockFlacTagTransfer(
            flacTagOutput,
            createSpawnSyncResult(pictureBlocksOutput),
          );

          const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

          expect(result.lameTagOptions).not.toContain('--ti');
          expect(result.temporaryFiles).toEqual([]);
          expect(spawnSyncMock).toHaveBeenCalledTimes(3);
        });
      });

      describe('PICTURE block listing errors', () => {
        const pictureListFailureCases: [string, MockSpawnSyncResult][] = [
          [
            'a non-zero exit status',
            createSpawnSyncResult(
              createFlacPictureBlock('5', 3, 'Cover (front)', 'image/jpeg'),
              { status: 1 },
            ),
          ],
          [
            'a process execution error',
            createSpawnSyncResult(
              createFlacPictureBlock('5', 3, 'Cover (front)', 'image/jpeg'),
              {
                status: null,
                error: new Error('metaflac executable not found'),
              },
            ),
          ],
        ];

        it.each(pictureListFailureCases)(
          'continues without artwork when PICTURE block listing fails with %s',
          (_scenario, pictureListResult) => {
            const trackPath = createSourceAudioFile('picture-list-error.flac');
            const tagger = new BearTunesTagger();
            const spawnSyncMock = mockFlacTagTransfer(
              flacTagOutput,
              pictureListResult,
            );

            const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

            expect(result.lameTagOptions).toContain('--tt');
            expect(result.lameTagOptions).not.toContain('--ti');
            expect(result.temporaryFiles).toEqual([]);
            expect(spawnSyncMock).toHaveBeenCalledTimes(3);
          },
        );
      });

      describe('PICTURE block export errors', () => {
        const pictureExportFailureCases: [string, MockSpawnSyncResult][] = [
          [
            'a non-zero exit status',
            createSpawnSyncResult('', { status: 2 }),
          ],
          [
            'a process execution error',
            createSpawnSyncResult('', {
              status: null,
              error: new Error('metaflac executable not found'),
            }),
          ],
        ];

        it.each(pictureExportFailureCases)(
          'continues preparing metadata when picture export fails with %s',
          (_scenario, pictureExportResult) => {
            const trackPath = createSourceAudioFile('picture-export-error.flac');
            const pictureBlocksOutput = createFlacPictureBlock(
              '5',
              3,
              'Cover (front)',
              'image/jpeg',
            );
            const tagger = new BearTunesTagger();
            const spawnSyncMock = mockFlacTagTransfer(
              flacTagOutput,
              createSpawnSyncResult(pictureBlocksOutput),
              pictureExportResult,
            );

            const result = tagger.prepareMp3TagTransferFromFlac(trackPath);

            expect(result.lameTagOptions).toContain('--tt');
            expect(result.lameTagOptions).not.toContain('--ti');
            expect(result.temporaryFiles).toEqual([]);
            expect(spawnSyncMock).toHaveBeenCalledTimes(4);
          },
        );
      });
    });
  });
});
