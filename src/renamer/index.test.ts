import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TrackInfo } from '#shared-types';

import {
  BearTunesRenamer,
  BearTunesRenamerDirectoryPatternMode,
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
});
