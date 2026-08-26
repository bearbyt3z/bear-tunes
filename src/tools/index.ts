/**
 * Public API for shared BearTunes utilities.
 *
 * Re-exports reusable helpers for audio metadata, command execution, file and
 * path handling, parsing, formatting, type guards, and web access. Internal
 * submodule paths remain implementation details.
 *
 * @module tools
 */

export {
  isSupportedArtworkFile,
} from './audio/artwork.js';

export {
  tryGetAudioFileTypeFromFile,
  tryGetMimeTypeFromFile,
} from './audio/file-type.js';

export {
  AudioFileType,
} from './audio/file-type.types.js';

export {
  buildGenreTag,
  buildTrackFullName,
  extractTrackNameKeywords,
} from './audio/metadata.js';

export {
  prompt,
} from './cli/prompt.js';

export {
  tryGetUrlFromFile,
} from './files/url-file.js';

export {
  executeCommandPipeline,
  executeCommandSync,
} from './system/command.js';

export {
  CommandExecutionFailedError,
  CommandExecutionStartError,
  CommandPipelineInfrastructureError,
  FirstPipelineCommandFailedError,
  SecondPipelineCommandFailedError,
} from './system/command.errors.js';

export {
  arrayDifference,
  arrayIntersection,
  arrayToLowerCase,
} from './utils/array.js';

export {
  formatZodErrorIssues,
  normalizeUnknownError,
} from './utils/error.js';

export {
  formatCommandArgumentForLogging,
  formatCommandArgumentsForLogging,
  formatLocalDateToIsoDateString,
  getFirstLine,
  roundToDecimalPlaces,
  secondsToTimeFormat,
  slugify,
} from './utils/format.js';

export {
  removeUndefinedObjectFields,
} from './utils/object.js';

export {
  tryParsePositiveInteger,
  tryParsePositiveNumber,
  tryParseUrl,
} from './utils/parse.js';

export {
  normalizeTrailingPathSeparators,
  removeFilenameExtension,
  replaceFilenameExtension,
} from './utils/path.js';

export {
  generateRandomHexString,
} from './utils/random.js';

export {
  capitalize,
  escapeRegExpChars,
  escapeUnescapedColons,
  replacePathForbiddenChars,
  replacePathForbiddenCharsInArray,
} from './utils/string.js';

export {
  isEmptyPlainObject,
  isErrnoException,
  isRecordArray,
  isObjectRecord,
  isReadonlyStringArray,
  isUnknownArray,
} from './utils/type-guards.js';

export {
  downloadFile,
} from './web/download-file.js';

export {
  downloadImage,
  downloadAndSaveArtwork,
} from './web/download-image.js';

export {
  fetchWebPage,
} from './web/fetch-web-page.js';
