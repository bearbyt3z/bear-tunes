import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PYTHON_EXECUTABLE } from '#config';
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

type SkipTest = (message?: string) => void;

const childProcessMocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();

  return {
    ...actual,
    spawnSync: childProcessMocks.spawnSync,
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
  });

  afterEach(() => {
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
});
