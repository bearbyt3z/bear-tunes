import * as fs from 'node:fs';

import { BearTunesConverter } from '#converter';
import { BearTunesRenamer } from '#renamer';
import { BearTunesTagger } from '#tagger';

/**
 * Describes the aggregated outcome of directory traversal and file processing.
 *
 * Values of this enum are propagated through recursive calls and translated to
 * process exit codes only at the top-level entrypoint.
 */
export enum DirectoryProcessingStatus {
  FilesProcessed,
  NoSupportedFilesFound,
  PathDoesNotExist,
  PathIsNotDirectory,
  CannotReadDirectory,
}

/**
 * Represents the result of validating and reading a directory.
 *
 * The function returns directory entries on success, or a directory-processing
 * status describing why validation or reading failed.
 */
export type ReadDirectoryEntriesResult =
  | fs.Dirent[]
  | DirectoryProcessingStatus.PathDoesNotExist
  | DirectoryProcessingStatus.PathIsNotDirectory
  | DirectoryProcessingStatus.CannotReadDirectory;

/**
 * Runtime configuration flags controlling processor behavior.
 */
export interface BearTunesProcessorOptions {
  /**
   * Controls whether FLAC inputs should be converted to MP3.
   *
   * When disabled, the processor keeps working on the FLAC file only
   * and skips MP3 creation.
   */
  convertFlacToMp3: boolean;

  /**
   * Enables verbose mode for the processor and its default dependencies.
   *
   * When custom dependencies are not provided, this flag is propagated to the
   * default converter, tagger, and renamer instances created by the constructor.
   */
  verbose: boolean;
}

/**
 * Service instances used by the processor to convert, tag, and rename audio files.
 */
export interface BearTunesProcessorDependencies {
  /**
   * Audio converter used for format transformations such as AIFF to FLAC and FLAC to MP3.
   */
  converter: BearTunesConverter;

  /**
   * Metadata tagger used to read track info and write tags back to output files.
   */
  tagger: BearTunesTagger;

  /**
   * File renamer used to build final output paths from resolved track metadata.
   */
  renamer: BearTunesRenamer;
}
