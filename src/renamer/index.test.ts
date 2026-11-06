import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TrackInfo } from '#shared-types';

import {
  BearTunesRenamer,
  BearTunesRenamerDirectoryPatternMode,
  BearTunesRenamerFailureCode,
} from './index.js';

// Shared fixtures

const sourceFileContent = 'Example audio file content';

const validTrackInfo: TrackInfo = {
  artists: ['Example Artist'],
  title: 'Example Track',
  genre: 'House',
  album: {
    title: 'Example Album',
  },
};

let temporaryDirectory = '';
let sourceDirectory = '';

function createSourceTrackFile(filename = 'source-track.mp3'): string {
  const trackPath = path.join(sourceDirectory, filename);

  fs.writeFileSync(trackPath, sourceFileContent);

  return trackPath;
}

function expectRenameFailure(
  result: ReturnType<BearTunesRenamer['rename']>,
  failureCode: BearTunesRenamerFailureCode,
): void {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error('Expected rename operation to fail.');
  }

  expect(result.failureCode).toBe(failureCode);
  expect(result.error).toBeInstanceOf(Error);
}

type SkipTest = (message?: string) => void;

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
    }

    throw error;
  }
}

describe('BearTunesRenamer', () => {
  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'bear-tunes-renamer-test-'),
    );
    sourceDirectory = path.join(temporaryDirectory, 'source');

    fs.mkdirSync(sourceDirectory);
  });

  afterEach(() => {
    if (temporaryDirectory.length > 0) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }

    temporaryDirectory = '';
    sourceDirectory = '';
  });

  describe('default configuration', () => {
    it('renames a track in its source directory using the default filename pattern', () => {
      const trackPath = createSourceTrackFile();
      const targetPath = path.join(
        sourceDirectory,
        'Example Artist - Example Track.mp3',
      );
      const renamer = new BearTunesRenamer();

      const result = renamer.rename(trackPath, validTrackInfo);

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });

    it('applies the default directory pattern when a target base directory is provided', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const targetPath = path.join(
        targetBaseDirectory,
        'House',
        'Example Artist',
        'Example Artist - Example Track.mp3',
      );
      const renamer = new BearTunesRenamer();

      fs.mkdirSync(targetBaseDirectory);

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });
  });

  describe('custom configuration', () => {
    it('overrides the filename pattern while preserving other default options', () => {
      const trackPath = createSourceTrackFile('source-track.flac');
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const targetPath = path.join(
        targetBaseDirectory,
        'House',
        'Example Artist',
        'Example Track.flac',
      );
      const renamer = new BearTunesRenamer({
        filenamePattern: '%title%',
      });

      fs.mkdirSync(targetBaseDirectory);

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });

    it(
      'uses the source directory as the base when directory pattern mode is Always and no target base is provided',
      () => {
        const trackPath = createSourceTrackFile();
        const targetPath = path.join(
          sourceDirectory,
          'Library',
          'House',
          'Example Track.mp3',
        );
        const renamer = new BearTunesRenamer({
          filenamePattern: '%title%',
          directoryPattern: 'Library/%genre%',
          directoryPatternMode: BearTunesRenamerDirectoryPatternMode.Always,
        });

        const result = renamer.rename(trackPath, validTrackInfo);

        expect(result).toEqual({
          ok: true,
          targetPath,
        });
        expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
        expect(fs.existsSync(trackPath)).toBe(false);
      },
    );

    it('uses the provided target base directory in Always mode', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'library');
      const targetPath = path.join(
        targetBaseDirectory,
        'House',
        'Example Track.mp3',
      );
      const renamer = new BearTunesRenamer({
        filenamePattern: '%title%',
        directoryPattern: '%genre%',
        directoryPatternMode: BearTunesRenamerDirectoryPatternMode.Always,
      });

      fs.mkdirSync(targetBaseDirectory);

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });
  });

  describe('placeholder resolution', () => {
    it('resolves nested properties, joins array values, and converts numeric values to strings', () => {
      const trackPath = createSourceTrackFile();
      const targetPath = path.join(
        sourceDirectory,
        'Example Album - Example Artist, Another Artist - 7 - 2024.mp3',
      );
      const trackInfo: TrackInfo = {
        ...validTrackInfo,
        artists: ['Example Artist', 'Another Artist'],
        year: 2024,
        album: {
          title: 'Example Album',
          trackNumber: 7,
        },
      };
      const renamer = new BearTunesRenamer({
        filenamePattern: '%album.title% - %artists% - %album.trackNumber% - %year%',
      });

      const result = renamer.rename(trackPath, trackInfo);

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });

    it.each([
      { description: 'an empty placeholder', filenamePattern: '%%' },
      { description: 'an empty nested segment', filenamePattern: '%album..title%' },
      { description: 'a missing first segment', filenamePattern: '%.title%' },
      { description: 'a missing final segment', filenamePattern: '%album.%' },
      { description: 'a segment containing a hyphen', filenamePattern: '%unknown-field%' },
      { description: 'an unmatched percent sign', filenamePattern: '%' },
    ])('rejects malformed placeholders: $description', ({ filenamePattern }) => {
      const trackPath = createSourceTrackFile();
      const renamer = new BearTunesRenamer({ filenamePattern });

      const result = renamer.rename(trackPath, validTrackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.UnsupportedRenamePatternPlaceholder,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it.each([
      '%unknownField%',
      '%album.unknownField%',
      '%Title%',
    ])('rejects unsupported or case-mismatched property paths: %s', (filenamePattern) => {
      const trackPath = createSourceTrackFile();
      const renamer = new BearTunesRenamer({ filenamePattern });

      const result = renamer.rename(trackPath, validTrackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.UnsupportedRenamePatternPlaceholder,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it('returns MissingTrackInfoValue when a referenced top-level property is undefined', () => {
      const trackPath = createSourceTrackFile();
      const trackInfo: TrackInfo = {
        ...validTrackInfo,
        genre: undefined,
      };
      const renamer = new BearTunesRenamer({
        filenamePattern: '%genre%',
      });

      const result = renamer.rename(trackPath, trackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.MissingTrackInfoValue,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it('returns MissingTrackInfoValue when an intermediate nested property is undefined', () => {
      const trackPath = createSourceTrackFile();
      const trackInfo: TrackInfo = {
        ...validTrackInfo,
        album: undefined,
      };
      const renamer = new BearTunesRenamer({
        filenamePattern: '%album.title%',
      });

      const result = renamer.rename(trackPath, trackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.MissingTrackInfoValue,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it('rejects placeholders that resolve to a whole object', () => {
      const trackPath = createSourceTrackFile();
      const renamer = new BearTunesRenamer({
        filenamePattern: '%album%',
      });

      const result = renamer.rename(trackPath, validTrackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.ObjectTrackInfoValueNotSupported,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it('rejects traversal through an array property', () => {
      const trackPath = createSourceTrackFile();
      const renamer = new BearTunesRenamer({
        filenamePattern: '%artists.length%',
      });

      const result = renamer.rename(trackPath, validTrackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.UnsupportedRenamePatternPlaceholder,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it('returns UnexpectedPreparationError for an unsupported runtime value', () => {
      const trackPath = createSourceTrackFile();
      const trackInfo: TrackInfo = {
        ...validTrackInfo,
        released: new Date('2024-01-01T00:00:00.000Z'),
      };
      const renamer = new BearTunesRenamer({
        filenamePattern: '%released%',
      });

      const result = renamer.rename(trackPath, trackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.UnexpectedPreparationError,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
    });
  });

  describe('filename sanitization', () => {
    it('replaces path-forbidden characters in the generated filename and preserves the source extension', () => {
      const trackPath = createSourceTrackFile('source-track.flac');
      const targetPath = path.join(sourceDirectory, 'Live-Remix- Extended.flac');
      const trackInfo: TrackInfo = {
        ...validTrackInfo,
        title: 'Live/Remix: Extended',
      };
      const renamer = new BearTunesRenamer({
        filenamePattern: '%title%',
      });

      const result = renamer.rename(trackPath, trackInfo);

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });
  });

  describe('directory pattern resolution', () => {
    it('resolves nested placeholders in individual directory pattern segments', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const targetPath = path.join(
        targetBaseDirectory,
        'Example Album',
        'Example Artist',
        'Example Track.mp3',
      );
      const renamer = new BearTunesRenamer({
        filenamePattern: '%title%',
        directoryPattern: '%album.title%/%artists%',
      });

      fs.mkdirSync(targetBaseDirectory);

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });
  });

  describe('directory pattern sanitization', () => {
    it('replaces separators in metadata values without creating additional directory levels', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const targetPath = path.join(
        targetBaseDirectory,
        'Ambient - Experimental',
        'Artist-One, Another Artist',
        'Artist-One, Another Artist - Example Track.mp3',
      );
      const trackInfo: TrackInfo = {
        ...validTrackInfo,
        artists: ['Artist/One', 'Another Artist'],
        genre: 'Ambient / Experimental',
      };
      const renamer = new BearTunesRenamer();

      fs.mkdirSync(targetBaseDirectory);

      const result = renamer.rename(
        trackPath,
        trackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(path.join(targetBaseDirectory, 'Ambient'))).toBe(false);
      expect(fs.existsSync(trackPath)).toBe(false);
    });

    it('keeps traversal-like metadata in a single sanitized directory segment', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized', 'base');
      const targetPath = path.join(
        targetBaseDirectory,
        '..-..-outside',
        'Example Artist - Example Track.mp3',
      );
      const trackInfo: TrackInfo = {
        ...validTrackInfo,
        genre: '../../outside',
      };
      const renamer = new BearTunesRenamer({
        directoryPattern: '%genre%',
      });

      fs.mkdirSync(targetBaseDirectory, { recursive: true });

      const result = renamer.rename(
        trackPath,
        trackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(path.join(temporaryDirectory, 'outside'))).toBe(false);
      expect(fs.existsSync(trackPath)).toBe(false);
    });
  });

  describe('target directory path safety', () => {
    it('allows a relative target base path containing parent-directory segments', () => {
      const trackPath = createSourceTrackFile();
      const absoluteTargetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const relativeSourceDirectory = path.relative(process.cwd(), sourceDirectory);
      const targetBaseDirectory = [
        relativeSourceDirectory,
        '..',
        'organized',
      ].join(path.sep);
      const targetPath = path.join(
        targetBaseDirectory,
        'House',
        'Example Artist',
        'Example Artist - Example Track.mp3',
      );
      const renamer = new BearTunesRenamer();

      fs.mkdirSync(absoluteTargetBaseDirectory);

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });

    it('rejects parent-directory segments in the configured directory pattern', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const renamer = new BearTunesRenamer({
        directoryPattern: '../outside',
      });

      fs.mkdirSync(targetBaseDirectory);

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.UnsafeTargetDirectoryPath,
      );
      expect(fs.existsSync(path.join(temporaryDirectory, 'outside'))).toBe(false);
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it.each(['.', '..'])('rejects metadata values resolving to the unsafe segment %s', (genre) => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const trackInfo: TrackInfo = {
        ...validTrackInfo,
        genre,
      };
      const renamer = new BearTunesRenamer({
        directoryPattern: '%genre%',
      });

      fs.mkdirSync(targetBaseDirectory);

      const result = renamer.rename(
        trackPath,
        trackInfo,
        targetBaseDirectory,
      );

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.UnsafeTargetDirectoryPath,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
    });
  });

  describe('input file validation', () => {
    it('returns InputFileAccessError when the source file does not exist', () => {
      const trackPath = path.join(sourceDirectory, 'missing-track.mp3');
      const renamer = new BearTunesRenamer();

      const result = renamer.rename(trackPath, validTrackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.InputFileAccessError,
      );
      expect(fs.existsSync(trackPath)).toBe(false);
    });

    it('returns InvalidInputFile when the source path points to a directory', () => {
      const renamer = new BearTunesRenamer();

      const result = renamer.rename(sourceDirectory, validTrackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.InvalidInputFile,
      );
      expect(fs.statSync(sourceDirectory).isDirectory()).toBe(true);
    });

    it('rejects a symbolic link to a regular source file', ({ skip }) => {
      const sourceTrackPath = createSourceTrackFile('actual-track.mp3');
      const trackPath = path.join(sourceDirectory, 'linked-track.mp3');
      const renamer = new BearTunesRenamer();

      createSymlinkOrSkip(sourceTrackPath, trackPath, 'file', skip);

      const result = renamer.rename(trackPath, validTrackInfo);

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.InvalidInputFile,
      );
      expect(fs.lstatSync(trackPath).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(sourceTrackPath, 'utf8')).toBe(sourceFileContent);
    });
  });

  describe('target base directory validation', () => {
    it('returns TargetDirectoryAccessError when the target base directory does not exist', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'missing-target');
      const renamer = new BearTunesRenamer();

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.TargetDirectoryAccessError,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
      expect(fs.existsSync(targetBaseDirectory)).toBe(false);
    });

    it('returns InvalidTargetDirectory when the target base path points to a file', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'target-file');
      const renamer = new BearTunesRenamer();

      fs.writeFileSync(targetBaseDirectory, 'Not a directory');

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.InvalidTargetDirectory,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
      expect(fs.readFileSync(targetBaseDirectory, 'utf8')).toBe('Not a directory');
    });

    it('returns InvalidTargetDirectory when the target base path is a symbolic link to a file', ({ skip }) => {
      const trackPath = createSourceTrackFile();
      const targetFilePath = path.join(temporaryDirectory, 'target-file');
      const targetBaseDirectory = path.join(temporaryDirectory, 'target-link');
      const renamer = new BearTunesRenamer();

      fs.writeFileSync(targetFilePath, 'Not a directory');
      createSymlinkOrSkip(targetFilePath, targetBaseDirectory, 'file', skip);

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.InvalidTargetDirectory,
      );
      expect(fs.existsSync(trackPath)).toBe(true);
      expect(fs.readFileSync(targetFilePath, 'utf8')).toBe('Not a directory');
    });

    it('returns TargetDirectoryAccessError when the target base path is a broken symbolic link', ({ skip }) => {
      const trackPath = createSourceTrackFile();
      const missingTargetPath = path.join(temporaryDirectory, 'missing-directory');
      const targetBaseDirectory = path.join(temporaryDirectory, 'broken-link');
      const renamer = new BearTunesRenamer();

      createSymlinkOrSkip(missingTargetPath, targetBaseDirectory, 'dir', skip);

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.TargetDirectoryAccessError,
      );
      expect(fs.lstatSync(targetBaseDirectory).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it('accepts a target base path that is a symbolic link to a directory', ({ skip }) => {
      const trackPath = createSourceTrackFile();
      const actualTargetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized-link');
      const targetPath = path.join(
        targetBaseDirectory,
        'House',
        'Example Artist',
        'Example Artist - Example Track.mp3',
      );
      const actualTargetPath = path.join(
        actualTargetBaseDirectory,
        'House',
        'Example Artist',
        'Example Artist - Example Track.mp3',
      );
      const renamer = new BearTunesRenamer();

      fs.mkdirSync(actualTargetBaseDirectory);
      createSymlinkOrSkip(
        actualTargetBaseDirectory,
        targetBaseDirectory,
        'dir',
        skip,
      );

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.lstatSync(targetBaseDirectory).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.readFileSync(actualTargetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });
  });

  describe('target directory creation', () => {
    it('returns TargetDirectoryAccessError when a target directory cannot be created because a file occupies its path', () => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const conflictingDirectoryPath = path.join(targetBaseDirectory, 'House');
      const renamer = new BearTunesRenamer({
        directoryPattern: '%genre%',
      });

      fs.mkdirSync(targetBaseDirectory);
      fs.writeFileSync(conflictingDirectoryPath, 'Not a directory');

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expectRenameFailure(
        result,
        BearTunesRenamerFailureCode.TargetDirectoryAccessError,
      );
      expect(fs.readFileSync(conflictingDirectoryPath, 'utf8')).toBe('Not a directory');
      expect(fs.existsSync(trackPath)).toBe(true);
    });

    it('follows a symbolic link when the generated target directory is a symbolic link', ({ skip }) => {
      const trackPath = createSourceTrackFile();
      const targetBaseDirectory = path.join(temporaryDirectory, 'organized');
      const actualTargetDirectory = path.join(temporaryDirectory, 'external');
      const generatedTargetDirectory = path.join(targetBaseDirectory, 'House');
      const targetPath = path.join(
        generatedTargetDirectory,
        'Example Artist - Example Track.mp3',
      );
      const actualTargetPath = path.join(
        actualTargetDirectory,
        'Example Artist - Example Track.mp3',
      );
      const renamer = new BearTunesRenamer({
        directoryPattern: '%genre%',
      });

      fs.mkdirSync(targetBaseDirectory);
      fs.mkdirSync(actualTargetDirectory);
      createSymlinkOrSkip(
        actualTargetDirectory,
        generatedTargetDirectory,
        'dir',
        skip,
      );

      const result = renamer.rename(
        trackPath,
        validTrackInfo,
        targetBaseDirectory,
      );

      expect(result).toEqual({
        ok: true,
        targetPath,
      });
      expect(fs.lstatSync(generatedTargetDirectory).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.readFileSync(actualTargetPath, 'utf8')).toBe(sourceFileContent);
      expect(fs.existsSync(trackPath)).toBe(false);
    });
  });
});
