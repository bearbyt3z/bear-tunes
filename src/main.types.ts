/**
 * Process exit codes returned by the BearTunes CLI.
 *
 * Codes are grouped by failure category so shell scripts can distinguish
 * expected processing outcomes, input-directory problems, and unexpected
 * application failures.
 */
export enum BearTunesExitCode {
  /** Processing completed successfully. */
  Success = 0,

  // 10-19: command-line argument validation

  /** Command-line arguments do not match the supported CLI contract. */
  InvalidCommandLineArguments = 10,

  // 20-29: expected processing outcomes

  /** No supported audio files were found in the input directory tree. */
  NoSupportedFilesFound = 20,

  // 30-39: input directory failures

  /** The requested input directory path does not exist. */
  InputDirectoryDoesNotExist = 30,

  /** The requested input path exists but is not a directory. */
  InputPathIsNotDirectory = 31,

  /** The requested input directory cannot be read. */
  InputDirectoryCannotBeRead = 32,

  // 40-49: unexpected application failures

  /** The processing workflow rejected with an unexpected error. */
  UnexpectedProcessorFailure = 40,

  /** An unhandled promise rejection reached the process-level handler. */
  UnhandledPromiseRejection = 41,

  /** An uncaught exception reached the process-level handler. */
  UncaughtException = 42,
}

/**
 * Directory arguments accepted by the BearTunes CLI.
 */
export interface DirectoryArguments {
  inputDirectory: string;
  outputDirectory?: string;
}
