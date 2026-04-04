import * as path from 'node:path';

/**
 * Replaces the filename extension in a filesystem path.
 *
 * @param filePath The filesystem path whose filename extension should be replaced.
 * @param replacement The new filename extension, with or without a leading dot.
 * @returns The input path with its filename extension replaced.
 * @throws {TypeError} If replacement is not a non-empty string.
 */
export function replaceFilenameExtension(filePath: string, replacement: string): string {
  if (typeof replacement !== 'string' || replacement === '') {
    throw new TypeError('Replacement must be a non-empty string.');
  }

  const parsed = path.parse(filePath);

  return path.format({
    dir: parsed.dir,
    root: parsed.root,
    // Omit `base`, because it takes priority over `name` and `ext`.
    name: parsed.name,
    ext: replacement,
  });
}

/**
 * Removes the filename extension from a filesystem path.
 *
 * @param filePath The filesystem path whose filename extension should be removed.
 * @returns The input path without its filename extension.
 */
export function removeFilenameExtension(filePath: string): string {
  const parsed = path.parse(filePath);

  return path.format({
    dir: parsed.dir,
    root: parsed.root,
    // Omit `base`, because it takes priority over `name` and `ext`.
    name: parsed.name,
    ext: '',
  });
}
