import * as childProcess from 'node:child_process';

import logger from '#logger';
import { getFirstLine } from './utils/format.js';

export {
  isSupportedArtworkFile,
  tryGetMimeTypeFromFile,
} from './audio/artwork.js'
export {
  buildArtistArray,
  buildGenreTag,
  buildKeyTag,
  buildTitle,
  extractTrackNameKeywords,
} from './audio/metadata.js';
export { prompt } from './cli/prompt.js';
export {
  tryGetUrlFromFile,
} from './files/url-file.js';
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
  tryParsePositiveInteger,
  tryParseUrl,
} from './utils/parse.js';
export {
  removeFilenameExtension,
  replaceFilenameExtension,
} from './utils/path.js';
export { generateRandomHexString } from './utils/random.js';
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
export { downloadFile } from './web/download-file.js';
export { downloadImage, downloadAndSaveArtwork } from './web/download-image.js';
export { fetchWebPage } from './web/fetch-web-page.js';

export function executeChildProcess(
  commandName: string,
  options: string[],
  successMessage: string,
  verbose = false
): number {
  const child = childProcess.spawnSync(commandName, options, { encoding: 'utf8' });

  if (child.error) {
    logger.error(`ERROR: Failed to start child process: ${child.error}`);
    return -1;
  }
  
  if (child.status && child.status !== 0) {
    logger.error(`ERROR: Child process exited with code ${child.status}:\n${getFirstLine(child.stderr)}`);
    return child.status;
  }

  logger.info(verbose ? child.stdout : successMessage);
  return 0;
}
