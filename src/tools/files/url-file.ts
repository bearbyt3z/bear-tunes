import * as fs from 'node:fs';

import { tryParseUrl } from '../utils/parse.js';

/**
 * Attempts to read a URL from a local `.url` file.
 *
 * The function looks for the first line starting with `URL=` and tries to parse
 * the remainder as a valid URL. It returns `undefined` when the file does not
 * contain such a line or when the extracted value is not a valid URL.
 *
 * @param filePath - Path to the local `.url` file to inspect.
 * @returns Parsed URL, or `undefined` when no valid URL could be extracted from the file.
 */
export async function tryGetUrlFromFile(filePath: string): Promise<URL | undefined> {
  const fileContent = await fs.promises.readFile(filePath, 'utf8');
  const urlLine = fileContent
    .split(/\r?\n/)
    .find((line) => line.startsWith('URL='));

  if (!urlLine) {
    return undefined;
  }

  return tryParseUrl(urlLine.slice(4).trim());
}
