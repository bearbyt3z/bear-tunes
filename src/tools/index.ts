import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

import logger from '@/logger';
import { getFirstLine } from './utils/format';

export {
  buildArtistArray,
  buildGenreTag,
  buildKeyTag,
  buildTitle,
  extractTrackNameKeywords,
} from './audio/metadata';
export { prompt } from './cli/prompt';
export {
  arrayDifference,
  arrayIntersection,
  arrayToLowerCase,
} from './utils/array';
export {
  formatLocalDateToIsoDateString,
  getFirstLine,
  roundToDecimalPlaces,
  secondsToTimeFormat,
  slugify,
} from './utils/format';
export {
  tryParsePositiveInteger,
  tryParseUrl,
} from './utils/parse';
export {
  removeFilenameExtension,
  replaceFilenameExtension,
} from './utils/path';
export { generateRandomHexString } from './utils/random';
export {
  capitalize,
  escapeRegExpChars,
  escapeUnescapedColons,
  replacePathForbiddenChars,
  replacePathForbiddenCharsInArray,
  replaceTagForbiddenChars,
} from './utils/string';
export {
  isReadonlyStringArray,
  isEmptyPlainObject,
} from './utils/type-guards';
export { downloadFile } from './web/download-file';
export { downloadImage, downloadAndSaveArtwork } from './web/download-image';
export { fetchWebPage } from './web/fetch-web-page';

export function getUrlFromFile(filePath: string): URL | null {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const urlIndex = fileContent.indexOf('URL=');
  if (urlIndex < 0) return null;
  return new URL(fileContent.substring(urlIndex + 4).split('\n')[0]);
}

export function executeChildProcess(
  commandName: string,
  options: string[],
  successMessage: string,
  verbose: boolean = false
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

export function getMimeTypeFromPath(filePath: string): string {
  const mimeType = childProcess.execSync(`file --mime-type -b "${filePath}"`).toString();
  return mimeType.trim();
}
