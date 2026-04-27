/**
 * Public barrel file for the tools module.
 *
 * Re-exports the supported helpers from tools submodules so consumers can use:
 * `import { ... } from '#tools'`
 * instead of importing from internal module paths directly.
 */

export {
  isSupportedArtworkFile,
  tryGetMimeTypeFromFile,
} from './audio/artwork.js';
export {
  buildArtistArray,
  buildGenreTag,
  buildKeyTag,
  buildTitle,
  extractTrackNameKeywords,
} from './audio/metadata.js';
export {
  prompt,
} from './cli/prompt.js';
export {
  tryGetUrlFromFile,
} from './files/url-file.js';
export {
  executeCommandSync,
} from './system/command.js';
export {
  arrayDifference,
  arrayIntersection,
  arrayToLowerCase,
} from './utils/array.js';
export {
  formatLocalDateToIsoDateString,
  getFirstLine,
  roundToDecimalPlaces,
  secondsToTimeFormat,
  slugify,
} from './utils/format.js';
export {
  setOrDeleteObjectField,
} from './utils/object.js';
export {
  tryParsePositiveInteger,
  tryParsePositiveNumber,
  tryParseUrl,
} from './utils/parse.js';
export {
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
  replaceTagForbiddenChars,
} from './utils/string.js';
export {
  isEmptyPlainObject,
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
