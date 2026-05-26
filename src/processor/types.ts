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

export interface BearTunesProcessorConfig {
  verbose: boolean;
}

export interface BearTunesProcessorDependencies {
  converter: BearTunesConverter;
  tagger: BearTunesTagger;
  renamer: BearTunesRenamer;
}

export type BearTunesProcessorOptions =
  BearTunesProcessorConfig & BearTunesProcessorDependencies;
