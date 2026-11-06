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
});
