import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BearTunesConverter,
  BearTunesConverterFailureCode,
} from '#converter';
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

const exampleArtworkUrl = new URL(
  'https://images.example.com/example-album.jpg',
);
const exampleAlbumUrl = new URL(
  'https://example.com/albums/example-album',
);

function createTrackInfoWithArtwork(): TrackInfo {
  return createTrackInfo({
    album: {
      title: 'Example Album',
      artists: ['Album Artist'],
      trackNumber: 3,
      trackTotal: 12,
      catalogNumber: 'CAT-001',
      artwork: exampleArtworkUrl,
      url: exampleAlbumUrl,
    },
  });
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

    describe('FLAC processing', () => {
      it('converts FLAC to MP3, saves tags to the original FLAC, and downloads artwork', async () => {
        const flacFilePath = createSourceAudioFile('example-track.flac');
        const convertedMp3Path = path.join(sourceDirectory, 'example-track.mp3');
        const trackInfo = createTrackInfoWithArtwork();
        const processingSteps: string[] = [];

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Flac,
        );

        processorDependencyMocks.converter.flacToMp3.mockImplementation(
          () => {
            processingSteps.push('convert');

            return Promise.resolve({
              ok: true,
              outputPath: convertedMp3Path,
            });
          },
        );

        processorDependencyMocks.tagger.processTrack.mockImplementation(() => {
          processingSteps.push('processTrack');

          return Promise.resolve({
            ok: true,
            trackInfo,
          });
        });

        processorDependencyMocks.renamer.rename.mockImplementation(
          (filePath) => {
            processingSteps.push(
              filePath === convertedMp3Path ? 'renameMp3' : 'renameFlac',
            );

            return {
              ok: true,
              targetPath: filePath,
            };
          },
        );

        processorDependencyMocks.tagger.saveTag.mockImplementation(() => {
          processingSteps.push('saveTag');

          return Promise.resolve({
            ok: true,
            trackInfo,
          });
        });

        processorToolMocks.downloadAndSaveArtwork.mockImplementation(() => {
          processingSteps.push('artwork');

          return Promise.resolve(undefined);
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.FilesProcessed);

        expect(processorToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledOnce();
        expect(processorToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledWith(
          flacFilePath,
        );

        expect(processorDependencyMocks.converter.flacToMp3).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.converter.flacToMp3).toHaveBeenCalledWith(
          flacFilePath,
        );

        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledWith(
          convertedMp3Path,
        );

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledTimes(2);
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          1,
          convertedMp3Path,
          trackInfo,
          undefined,
        );
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          2,
          flacFilePath,
          trackInfo,
          undefined,
        );

        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledWith(
          flacFilePath,
          trackInfo,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledWith(
          flacFilePath,
          exampleArtworkUrl,
          exampleAlbumUrl,
          expect.any(String),
        );

        expect(processingSteps).toEqual([
          'convert',
          'processTrack',
          'renameMp3',
          'saveTag',
          'renameFlac',
          'artwork',
        ]);

        expect(processorDependencyMocks.converter.aiffToFlac).not.toHaveBeenCalled();
      });

      it('passes output directory to both renames and downloads artwork to renamed FLAC path', async () => {
        const flacFilePath = createSourceAudioFile('output-directory-track.flac');
        const convertedMp3Path = path.join(
          sourceDirectory,
          'output-directory-track.mp3',
        );
        const outputDirectory = path.join(temporaryDirectory, 'output');
        const expectedMp3Path = path.join(
          outputDirectory,
          path.basename(convertedMp3Path),
        );
        const expectedFlacPath = path.join(
          outputDirectory,
          path.basename(flacFilePath),
        );
        const trackInfo = createTrackInfoWithArtwork();

        fs.mkdirSync(outputDirectory);

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Flac,
        );

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        processorDependencyMocks.tagger.saveTag.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(
          sourceDirectory,
          outputDirectory,
        );

        expect(result).toBe(DirectoryProcessingStatus.FilesProcessed);

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledTimes(2);
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          1,
          convertedMp3Path,
          trackInfo,
          outputDirectory,
        );
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          2,
          flacFilePath,
          trackInfo,
          outputDirectory,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledWith(
          expectedFlacPath,
          exampleArtworkUrl,
          exampleAlbumUrl,
          expect.any(String),
        );

        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledWith(
          flacFilePath,
          trackInfo,
        );

        expect(expectedMp3Path).not.toBe(convertedMp3Path);
      });

      it('processes FLAC directly when MP3 conversion is disabled', async () => {
        const flacFilePath = createSourceAudioFile('direct-flac-track.flac');
        const trackInfo = createTrackInfoWithArtwork();

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Flac,
        );

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        const processor = new BearTunesProcessor({
          convertFlacToMp3: false,
        });

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.FilesProcessed);

        expect(processorDependencyMocks.converter.flacToMp3).not.toHaveBeenCalled();

        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledWith(
          flacFilePath,
        );

        expect(processorDependencyMocks.tagger.saveTag).not.toHaveBeenCalled();

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledWith(
          flacFilePath,
          trackInfo,
          undefined,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledWith(
          flacFilePath,
          exampleArtworkUrl,
          exampleAlbumUrl,
          expect.any(String),
        );
      });

      it('does not continue processing when FLAC-to-MP3 conversion fails', async () => {
        const flacFilePath = createSourceAudioFile('conversion-failure.flac');
        const conversionError = new Error('LAME encoding failed');
        const encoderStderr = 'Encoder returned a non-zero exit code';

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Flac,
        );

        processorDependencyMocks.converter.flacToMp3.mockResolvedValue({
          ok: false,
          failureCode: BearTunesConverterFailureCode.LameEncodeProcessFailed,
          error: conversionError,
          encoderStderr,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);

        expect(processorDependencyMocks.converter.flacToMp3).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).not.toHaveBeenCalled();
        expect(processorDependencyMocks.tagger.saveTag).not.toHaveBeenCalled();
        expect(processorDependencyMocks.renamer.rename).not.toHaveBeenCalled();
        expect(processorToolMocks.downloadAndSaveArtwork).not.toHaveBeenCalled();

        expect(logger.warn).toHaveBeenCalledWith(
          `Converting file ${flacFilePath} failed with code ${BearTunesConverterFailureCode.LameEncodeProcessFailed} and message:\n${conversionError.message}:\nlame stderr: ${encoderStderr}`,
        );
      });

      it('does not rename or save FLAC tags when track tagging fails', async () => {
        const flacFilePath = createSourceAudioFile('tagging-failure.flac');
        const convertedMp3Path = path.join(sourceDirectory, 'tagging-failure.mp3');
        const taggingError = new Error('Track matching failed');

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Flac,
        );

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: false,
          failureCode: BearTunesTaggerFailureCode.TrackMatchFailed,
          error: taggingError,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);

        expect(processorDependencyMocks.converter.flacToMp3).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledWith(
          convertedMp3Path,
        );

        expect(processorDependencyMocks.renamer.rename).not.toHaveBeenCalled();
        expect(processorDependencyMocks.tagger.saveTag).not.toHaveBeenCalled();
        expect(processorToolMocks.downloadAndSaveArtwork).not.toHaveBeenCalled();

        expect(logger.warn).toHaveBeenNthCalledWith(
          1,
          `No track info found for converted FLAC/MP3 pair: ${flacFilePath}`,
        );

        expect(logger.warn).toHaveBeenNthCalledWith(
          2,
          `Processing track ${convertedMp3Path} failed with code ${BearTunesTaggerFailureCode.TrackMatchFailed} and message:\n${taggingError.message}`,
          { error: taggingError },
        );
      });

      it('does not save FLAC tags or rename the original FLAC when MP3 renaming fails', async () => {
        createSourceAudioFile('mp3-renaming-failure.flac');
        const convertedMp3Path = path.join(
          sourceDirectory,
          'mp3-renaming-failure.mp3',
        );
        const trackInfo = createTrackInfo();
        const renamingError = new Error('MP3 renaming failed');

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Flac,
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

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledWith(
          convertedMp3Path,
          trackInfo,
          undefined,
        );

        expect(processorDependencyMocks.tagger.saveTag).not.toHaveBeenCalled();
        expect(processorToolMocks.downloadAndSaveArtwork).not.toHaveBeenCalled();

        expect(logger.warn).toHaveBeenCalledWith(
          `Renaming file ${convertedMp3Path} failed with code ${BearTunesRenamerFailureCode.RenameOperationFailed} and message:\n${renamingError.message}`,
        );
      });

      it('does not rename the original FLAC or download artwork when saving FLAC tags fails', async () => {
        const flacFilePath = createSourceAudioFile('flac-tagging-failure.flac');
        const convertedMp3Path = path.join(
          sourceDirectory,
          'flac-tagging-failure.mp3',
        );
        const trackInfo = createTrackInfo();
        const taggingError = new Error('FLAC tag writing failed');

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Flac,
        );

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        processorDependencyMocks.tagger.saveTag.mockResolvedValue({
          ok: false,
          failureCode: BearTunesTaggerFailureCode.MetaflacTagWriteExecutionFailed,
          error: taggingError,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledWith(
          convertedMp3Path,
          trackInfo,
          undefined,
        );

        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledWith(
          flacFilePath,
          trackInfo,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).not.toHaveBeenCalled();

        expect(logger.warn).toHaveBeenCalledWith(
          `Processing track ${flacFilePath} failed with code ${BearTunesTaggerFailureCode.MetaflacTagWriteExecutionFailed} and message:\n${taggingError.message}`,
          { error: taggingError },
        );
      });

      it('does not download artwork when renaming the original FLAC fails', async () => {
        const flacFilePath = createSourceAudioFile('flac-renaming-failure.flac');
        const convertedMp3Path = path.join(
          sourceDirectory,
          'flac-renaming-failure.mp3',
        );
        const trackInfo = createTrackInfo();
        const renamingError = new Error('Original FLAC renaming failed');

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Flac,
        );

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        processorDependencyMocks.tagger.saveTag.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        processorDependencyMocks.renamer.rename
          .mockReturnValueOnce({
            ok: true,
            targetPath: convertedMp3Path,
          })
          .mockReturnValueOnce({
            ok: false,
            failureCode: BearTunesRenamerFailureCode.RenameOperationFailed,
            error: renamingError,
          });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledTimes(2);
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          1,
          convertedMp3Path,
          trackInfo,
          undefined,
        );
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          2,
          flacFilePath,
          trackInfo,
          undefined,
        );

        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).not.toHaveBeenCalled();

        expect(logger.warn).toHaveBeenCalledWith(
          `Renaming file ${flacFilePath} failed with code ${BearTunesRenamerFailureCode.RenameOperationFailed} and message:\n${renamingError.message}`,
        );
      });

      it('skips an MP3 file generated from FLAC when it is encountered later during traversal', async () => {
        const flacFilePath = createSourceAudioFile('000-source.flac');

        const candidateMp3Paths = Array.from(
          { length: 32 },
          (_, index) =>
            createSourceAudioFile(
              `zzz-generated-${index.toString().padStart(2, '0')}.mp3`,
            ),
        );

        const directoryEntries = await fs.promises.readdir(sourceDirectory, {
          withFileTypes: true,
        });

        const flacEntryIndex = directoryEntries.findIndex(
          (entry) => path.join(sourceDirectory, entry.name) === flacFilePath,
        );

        const generatedMp3Path = candidateMp3Paths.find((candidatePath) => {
          const candidateEntryIndex = directoryEntries.findIndex(
            (entry) => path.join(sourceDirectory, entry.name) === candidatePath,
          );

          return candidateEntryIndex > flacEntryIndex;
        });

        if (flacEntryIndex === -1 || generatedMp3Path === undefined) {
          throw new Error(
            'Expected to find an MP3 directory entry after the FLAC entry.',
          );
        }

        // Queue format detection results in the same order as the actual directory entries.
        for (const entry of directoryEntries) {
          const entryPath = path.join(sourceDirectory, entry.name);

          if (entryPath === flacFilePath) {
            processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
              AudioFileType.Flac,
            );
          } else if (entryPath === generatedMp3Path) {
            processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
              AudioFileType.Mp3,
            );
          } else {
            processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
              undefined,
            );
          }
        }

        const trackInfo = createTrackInfoWithArtwork();

        processorDependencyMocks.converter.flacToMp3.mockResolvedValue({
          ok: true,
          outputPath: generatedMp3Path,
        });

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        processorDependencyMocks.tagger.saveTag.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.FilesProcessed);

        expect(processorDependencyMocks.converter.flacToMp3).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.converter.flacToMp3).toHaveBeenCalledWith(
          flacFilePath,
        );

        // Metadata is resolved only once, from the generated MP3.
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledWith(
          generatedMp3Path,
        );

        // The generated MP3 and original FLAC are each renamed only once.
        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledTimes(2);
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          1,
          generatedMp3Path,
          trackInfo,
          undefined,
        );
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          2,
          flacFilePath,
          trackInfo,
          undefined,
        );

        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledWith(
          flacFilePath,
          trackInfo,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledWith(
          flacFilePath,
          exampleArtworkUrl,
          exampleAlbumUrl,
          expect.any(String),
        );
      });
    });

    describe('AIFF processing', () => {
      it('converts AIFF to FLAC and processes the generated FLAC through the existing pipeline', async () => {
        const aiffFilePath = createSourceAudioFile('example-track.aiff');
        const convertedFlacPath = path.join(
          sourceDirectory,
          'converted',
          'example-track.flac',
        );
        const convertedMp3Path = path.join(
          path.dirname(convertedFlacPath),
          'example-track.mp3',
        );
        const outputDirectory = path.join(temporaryDirectory, 'output');
        const expectedMp3OutputPath = path.join(
          outputDirectory,
          path.basename(convertedMp3Path),
        );
        const expectedFlacOutputPath = path.join(
          outputDirectory,
          path.basename(convertedFlacPath),
        );
        const trackInfo = createTrackInfoWithArtwork();
        const processingSteps: string[] = [];

        fs.mkdirSync(outputDirectory);

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Aiff,
        );

        processorDependencyMocks.converter.aiffToFlac.mockImplementation(
          () => {
            processingSteps.push('aiffToFlac');

            return {
              ok: true,
              outputPath: convertedFlacPath,
            };
          },
        );

        processorDependencyMocks.converter.flacToMp3.mockImplementation(
          () => {
            processingSteps.push('flacToMp3');

            return Promise.resolve({
              ok: true,
              outputPath: convertedMp3Path,
            });
          },
        );

        processorDependencyMocks.tagger.processTrack.mockImplementation(() => {
          processingSteps.push('processTrack');

          return Promise.resolve({
            ok: true,
            trackInfo,
          });
        });

        processorDependencyMocks.renamer.rename.mockImplementation(
          (filePath, _trackInfo, targetBaseDirectory) => {
            processingSteps.push(
              filePath === convertedMp3Path ? 'renameMp3' : 'renameFlac',
            );

            return {
              ok: true,
              targetPath: targetBaseDirectory === undefined
                ? filePath
                : path.join(targetBaseDirectory, path.basename(filePath)),
            };
          },
        );

        processorDependencyMocks.tagger.saveTag.mockImplementation(() => {
          processingSteps.push('saveTag');

          return Promise.resolve({
            ok: true,
            trackInfo,
          });
        });

        processorToolMocks.downloadAndSaveArtwork.mockImplementation(() => {
          processingSteps.push('artwork');

          return Promise.resolve(undefined);
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(
          sourceDirectory,
          outputDirectory,
        );

        expect(result).toBe(DirectoryProcessingStatus.FilesProcessed);

        expect(processorToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledOnce();
        expect(processorToolMocks.tryGetAudioFileTypeFromFile).toHaveBeenCalledWith(
          aiffFilePath,
        );

        expect(processorDependencyMocks.converter.aiffToFlac).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.converter.aiffToFlac).toHaveBeenCalledWith(
          aiffFilePath,
          undefined,
          true,
        );

        expect(processorDependencyMocks.converter.flacToMp3).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.converter.flacToMp3).toHaveBeenCalledWith(
          convertedFlacPath,
        );

        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledWith(
          convertedMp3Path,
        );

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledTimes(2);
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          1,
          convertedMp3Path,
          trackInfo,
          outputDirectory,
        );
        expect(processorDependencyMocks.renamer.rename).toHaveBeenNthCalledWith(
          2,
          convertedFlacPath,
          trackInfo,
          outputDirectory,
        );

        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.saveTag).toHaveBeenCalledWith(
          convertedFlacPath,
          trackInfo,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledWith(
          expectedFlacOutputPath,
          exampleArtworkUrl,
          exampleAlbumUrl,
          expect.any(String),
        );

        expect(processingSteps).toEqual([
          'aiffToFlac',
          'flacToMp3',
          'processTrack',
          'renameMp3',
          'saveTag',
          'renameFlac',
          'artwork',
        ]);

        expect(expectedMp3OutputPath).not.toBe(convertedMp3Path);
      });

      it('processes the generated FLAC directly when MP3 conversion is disabled', async () => {
        const aiffFilePath = createSourceAudioFile('direct-track.aiff');
        const convertedFlacPath = path.join(
          sourceDirectory,
          'direct-track.flac',
        );
        const trackInfo = createTrackInfoWithArtwork();

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Aiff,
        );

        processorDependencyMocks.converter.aiffToFlac.mockReturnValue({
          ok: true,
          outputPath: convertedFlacPath,
        });

        processorDependencyMocks.tagger.processTrack.mockResolvedValue({
          ok: true,
          trackInfo,
        });

        const processor = new BearTunesProcessor({
          convertFlacToMp3: false,
        });

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.FilesProcessed);

        expect(processorDependencyMocks.converter.aiffToFlac).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.converter.aiffToFlac).toHaveBeenCalledWith(
          aiffFilePath,
          undefined,
          true,
        );

        expect(processorDependencyMocks.converter.flacToMp3).not.toHaveBeenCalled();

        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.tagger.processTrack).toHaveBeenCalledWith(
          convertedFlacPath,
        );

        expect(processorDependencyMocks.tagger.saveTag).not.toHaveBeenCalled();

        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.renamer.rename).toHaveBeenCalledWith(
          convertedFlacPath,
          trackInfo,
          undefined,
        );

        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledOnce();
        expect(processorToolMocks.downloadAndSaveArtwork).toHaveBeenCalledWith(
          convertedFlacPath,
          exampleArtworkUrl,
          exampleAlbumUrl,
          expect.any(String),
        );
      });

      it('does not continue processing when AIFF-to-FLAC conversion fails', async () => {
        const aiffFilePath = createSourceAudioFile('conversion-failure.aiff');
        const conversionError = new Error('FLAC encoder failed');
        const encoderStderr = 'FLAC encoder returned a non-zero exit code';

        processorToolMocks.tryGetAudioFileTypeFromFile.mockResolvedValueOnce(
          AudioFileType.Aiff,
        );

        processorDependencyMocks.converter.aiffToFlac.mockReturnValue({
          ok: false,
          failureCode: BearTunesConverterFailureCode.EncoderProcessFailed,
          error: conversionError,
          encoderStderr,
        });

        const processor = new BearTunesProcessor();

        const result = await processor.processAllFilesInDirectory(sourceDirectory);

        expect(result).toBe(DirectoryProcessingStatus.NoSupportedFilesFound);

        expect(processorDependencyMocks.converter.aiffToFlac).toHaveBeenCalledOnce();
        expect(processorDependencyMocks.converter.aiffToFlac).toHaveBeenCalledWith(
          aiffFilePath,
          undefined,
          true,
        );

        expect(processorDependencyMocks.converter.flacToMp3).not.toHaveBeenCalled();
        expect(processorDependencyMocks.tagger.processTrack).not.toHaveBeenCalled();
        expect(processorDependencyMocks.tagger.saveTag).not.toHaveBeenCalled();
        expect(processorDependencyMocks.renamer.rename).not.toHaveBeenCalled();
        expect(processorToolMocks.downloadAndSaveArtwork).not.toHaveBeenCalled();

        expect(logger.warn).toHaveBeenCalledWith(
          `Converting file ${aiffFilePath} failed with code ${BearTunesConverterFailureCode.EncoderProcessFailed} and message:\n${conversionError.message}:\nflac stderr: ${encoderStderr}`,
        );
      });
    });
  });
});
