import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BearTunesConverter } from '#converter';
import logger from '#logger';
import {
  BearTunesRenamer,
  BearTunesRenamerFailureCode,
} from '#renamer';
import type { TrackInfo } from '#shared-types';
import {
  BearTunesTagger,
  BearTunesTaggerFailureCode,
} from '#tagger';
import { AudioFileType } from '#tools';

import {
  BearTunesProcessor,
  DirectoryProcessingStatus,
} from './index.js';

interface MockProcessorDependencyOptions {
  verbose: boolean;
}

const processorDependencyMocks = vi.hoisted(() => ({
  converterConstructor: vi.fn<
    (options: MockProcessorDependencyOptions) => void
  >(),
  converter: {
    aiffToFlac: vi.fn<typeof BearTunesConverter.prototype.aiffToFlac>(),
    flacToMp3: vi.fn<typeof BearTunesConverter.prototype.flacToMp3>(),
  },
  taggerConstructor: vi.fn<
    (options: MockProcessorDependencyOptions) => void
  >(),
  tagger: {
    processTrack: vi.fn<typeof BearTunesTagger.prototype.processTrack>(),
    saveTag: vi.fn<typeof BearTunesTagger.prototype.saveTag>(),
  },
  renamerConstructor: vi.fn<
    (options: MockProcessorDependencyOptions) => void
  >(),
  renamer: {
    rename: vi.fn<typeof BearTunesRenamer.prototype.rename>(),
  },
}));

const processorToolMocks = vi.hoisted(() => ({
  downloadAndSaveArtwork: vi.fn<
    typeof import('#tools').downloadAndSaveArtwork
  >(),
  tryGetAudioFileTypeFromFile: vi.fn<
    typeof import('#tools').tryGetAudioFileTypeFromFile
  >(),
}));

vi.mock('#converter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#converter')>();

  return {
    ...actual,
    BearTunesConverter: class {
      aiffToFlac = processorDependencyMocks.converter.aiffToFlac;
      flacToMp3 = processorDependencyMocks.converter.flacToMp3;

      constructor(options: MockProcessorDependencyOptions = { verbose: false }) {
        processorDependencyMocks.converterConstructor(options);
      }
    },
  };
});

vi.mock('#tagger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#tagger')>();

  return {
    ...actual,
    BearTunesTagger: class {
      processTrack = processorDependencyMocks.tagger.processTrack;
      saveTag = processorDependencyMocks.tagger.saveTag;

      constructor(options: MockProcessorDependencyOptions = { verbose: false }) {
        processorDependencyMocks.taggerConstructor(options);
      }
    },
  };
});

vi.mock('#renamer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#renamer')>();

  return {
    ...actual,
    BearTunesRenamer: class {
      rename = processorDependencyMocks.renamer.rename;

      constructor(options: MockProcessorDependencyOptions = { verbose: false }) {
        processorDependencyMocks.renamerConstructor(options);
      }
    },
  };
});

vi.mock('#tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#tools')>();

  processorToolMocks.tryGetAudioFileTypeFromFile.mockImplementation(
    actual.tryGetAudioFileTypeFromFile,
  );

  return {
    ...actual,
    downloadAndSaveArtwork: processorToolMocks.downloadAndSaveArtwork,
    tryGetAudioFileTypeFromFile: processorToolMocks.tryGetAudioFileTypeFromFile,
  };
});

const sourceFileContent = 'Example audio file content';

let temporaryDirectory = '';
let sourceDirectory = '';

function createSourceAudioFile(filename: string): string {
  const filePath = path.join(sourceDirectory, filename);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, sourceFileContent);

  return filePath;
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
    details: { durationMs: 245_000 },
    ...overrides,
  };
}

function mockSuccessfulProcessorDependencies(
  trackInfo: TrackInfo = createTrackInfo(),
): void {
  processorDependencyMocks.converter.aiffToFlac.mockImplementation(
    (aiffFilePath) => {
      const parsedPath = path.parse(aiffFilePath);

      return {
        ok: true,
        outputPath: path.join(parsedPath.dir, `${parsedPath.name}.flac`),
      };
    },
  );

  processorDependencyMocks.converter.flacToMp3.mockImplementation(
    (flacFilePath) => {
      const parsedPath = path.parse(flacFilePath);

      return Promise.resolve({
        ok: true,
        outputPath: path.join(parsedPath.dir, `${parsedPath.name}.mp3`),
      });
    },
  );

  processorDependencyMocks.tagger.processTrack.mockResolvedValue({
    ok: true,
    trackInfo,
  });

  processorDependencyMocks.tagger.saveTag.mockResolvedValue({
    ok: true,
    trackInfo,
  });

  processorDependencyMocks.renamer.rename.mockImplementation(
    (trackPath, _trackInfo, targetBaseDirectory) => {
      const targetPath = targetBaseDirectory === undefined
        ? trackPath
        : path.join(targetBaseDirectory, path.basename(trackPath));

      return {
        ok: true,
        targetPath,
      };
    },
  );
}

function muteProcessorLogs(): void {
  vi.spyOn(logger, 'silly').mockReturnValue(logger);
  vi.spyOn(logger, 'debug').mockReturnValue(logger);
  vi.spyOn(logger, 'info').mockReturnValue(logger);
  vi.spyOn(logger, 'warn').mockReturnValue(logger);
  vi.spyOn(logger, 'error').mockReturnValue(logger);
}

describe('BearTunesProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'bear-tunes-processor-'),
    );

    sourceDirectory = path.join(temporaryDirectory, 'source');
    fs.mkdirSync(sourceDirectory);

    mockSuccessfulProcessorDependencies();
    processorToolMocks.downloadAndSaveArtwork.mockResolvedValue(undefined);

    muteProcessorLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (temporaryDirectory !== '') {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = '';
    }
  });

  describe('constructor', () => {
    it('creates default dependencies with verbose disabled by default', () => {
      new BearTunesProcessor();

      expect(processorDependencyMocks.converterConstructor).toHaveBeenCalledTimes(1);
      expect(processorDependencyMocks.converterConstructor).toHaveBeenCalledWith({
        verbose: false,
      });

      expect(processorDependencyMocks.taggerConstructor).toHaveBeenCalledTimes(1);
      expect(processorDependencyMocks.taggerConstructor).toHaveBeenCalledWith({
        verbose: false,
      });

      expect(processorDependencyMocks.renamerConstructor).toHaveBeenCalledTimes(1);
      expect(processorDependencyMocks.renamerConstructor).toHaveBeenCalledWith({
        verbose: false,
      });
    });

    it('passes verbose option to all default dependencies', () => {
      new BearTunesProcessor({ verbose: true });

      expect(processorDependencyMocks.converterConstructor).toHaveBeenCalledTimes(1);
      expect(processorDependencyMocks.converterConstructor).toHaveBeenCalledWith({
        verbose: true,
      });

      expect(processorDependencyMocks.taggerConstructor).toHaveBeenCalledTimes(1);
      expect(processorDependencyMocks.taggerConstructor).toHaveBeenCalledWith({
        verbose: true,
      });

      expect(processorDependencyMocks.renamerConstructor).toHaveBeenCalledTimes(1);
      expect(processorDependencyMocks.renamerConstructor).toHaveBeenCalledWith({
        verbose: true,
      });
    });
  });

  describe('processAllFilesInDirectory', () => {
    it('returns NoSupportedFilesFound for an empty directory', async () => {
      const processor = new BearTunesProcessor();

      const result = await processor.processAllFilesInDirectory(sourceDirectory);

      expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);
    });

    it('ignores files with unsupported audio types', async () => {
      const filePath = createSourceAudioFile('notes.txt');
      const processor = new BearTunesProcessor();

      const result = await processor.processAllFilesInDirectory(sourceDirectory);

      expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);
      expect(processorToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledWith(
        filePath,
      );
      expect(processorDependencyMocks.tagger.processTrack).not.toHaveBeenCalled();
      expect(processorDependencyMocks.renamer.rename).not.toHaveBeenCalled();
    });

    describe('MP3 processing', () => {
      it('processes MP3 files through tagging, renaming, and artwork download', async () => {
        const trackPath = createSourceAudioFile('example-track.mp3');
        const artworkUrl = new URL('https://images.example.com/example-album.jpg');
        const albumUrl = new URL('https://example.com/albums/example-album');
        const trackInfo = createTrackInfo({
          album: {
            title: 'Example Album',
            artists: ['Album Artist'],
            trackNumber: 3,
            trackTotal: 12,
            catalogNumber: 'CAT-001',
            artwork: artworkUrl,
            url: albumUrl,
          },
        });
        const processingSteps: string[] = [];

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Mp3,
        );

        processorDependencyMocks.tagger.processTrack.mockImplementation(() => {
          processingSteps.push('tagger');

          return Promise.resolve({
            ok: true,
            trackInfo,
          });
        });

        processorDependencyMocks.renamer.rename.mockImplementation(
          (filePath) => {
            processingSteps.push('renamer');

            return {
              ok: true,
              targetPath: filePath,
            };
          },
        );

        processorToolMocks.downloadAndSaveArtwork.mockImplementation(() => {
          processingSteps.push('artwork');

          return Promise.resolve(undefined);
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.FilesProcessed);

        expect(processorToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledOnce();
        expect(processorToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledWith(
          trackPath,
        );

        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledWith(
          trackPath,
        );

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledWith(
          trackPath,
          trackInfo,
          undefined,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledWith(
          trackPath,
          artworkUrl,
          albumUrl,
          expect.any(String),
        );

        expect(processingSteps).toEqual([
          'tagger',
          'renamer',
          'artwork',
        ]);

        expect(processorDependencyMocks.converter.flacToMp3).not.toHaveBeenCalled();
        expect(processorDependencyMocks.converter.aiffToFlac).not.toHaveBeenCalled();
        expect(processorDependencyMocks.tagger.saveTag).not.toHaveBeenCalled();
      });

      it('passes output directory to renamer and downloads artwork to renamed path', async () => {
        const trackPath = createSourceAudioFile('example-track.mp3');
        const outputDirectory = path.join(temporaryDirectory, 'output');
        const expectedOutputPath = path.join(
          outputDirectory,
          path.basename(trackPath),
        );
        const artworkUrl = new URL('https://images.example.com/example-album.jpg');
        const albumUrl = new URL('https://example.com/albums/example-album');
        const trackInfo = createTrackInfo({
          album: {
            title: 'Example Album',
            artists: ['Album Artist'],
            trackNumber: 3,
            trackTotal: 12,
            catalogNumber: 'CAT-001',
            artwork: artworkUrl,
            url: albumUrl,
          },
        });

        fs.mkdirSync(outputDirectory);

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Mp3,
        );

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(
          sourceDirectory,
          outputDirectory,
        );

        expect(result).toBe(DirectoryProcessingStatus.FilesProcessed);

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledWith(
          trackPath,
          trackInfo,
          outputDirectory,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledWith(
          expectedOutputPath,
          artworkUrl,
          albumUrl,
          expect.any(String),
        );
      });

      it('does not rename or download artwork when track tagging fails', async () => {
        const trackPath = createSourceAudioFile('tagging-failure-track.mp3');
        const taggingError = new Error('Track matching failed');

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Mp3,
        );

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: false,
          failureCode: BearTunesTaggerFailureCode.TrackMatchFailed,
          error: taggingError,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);

        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledWith(
          trackPath,
        );

        expect(processorDependencyMocks.renamer.rename).not.toHaveBeenCalled();
        expect(processorToolMocks.downloadAndSaveArtwork).not.toHaveBeenCalled();

        expect(logger.warn).toHaveBeenCalledWith(
          `Processing track ${trackPath} failed with code ${BearTunesTaggerFailureCode.TrackMatchFailed} and message:\n${taggingError.message}`,
          { error: taggingError },
        );
      });

      it('does not download artwork when file renaming fails', async () => {
        const trackPath = createSourceAudioFile('renaming-failure-track.mp3');
        const trackInfo = createTrackInfo();
        const renamingError = new Error('File renaming failed');

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Mp3,
        );

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        processorDependencyMocks.renamer.rename.mockReturnValue({
          ok: false,
          failureCode: BearTunesRenamerFailureCode.RenameOperationFailed,
          error: renamingError,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);

        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledOnce();

        expect(processorToolMocks.downloadAndSaveArtwork).not.toHaveBeenCalled();

        expect(logger.warn).toHaveBeenCalledWith(
          `Renaming file ${trackPath} failed with code ${BearTunesRenamerFailureCode.RenameOperationFailed} and message:\n${renamingError.message}`,
        );
      });
    });
  });
});
