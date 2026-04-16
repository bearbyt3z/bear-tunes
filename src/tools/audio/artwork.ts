import { fileTypeFromFile } from 'file-type';

/**
 * MIME types accepted for artwork files embedded into audio tags.
 *
 * The list is intentionally narrow and currently includes only JPEG and PNG,
 * which are the artwork formats accepted by the tagging pipeline.
 *
 * @internal
 */
const supportedArtworkMimeTypes = new Set([
  'image/jpeg',
  'image/png',
]);

/**
 * Attempts to detect the MIME type of a local file.
 *
 * The MIME type is resolved from the file contents rather than from the file
 * extension. The function returns `undefined` when the file type cannot be
 * detected.
 *
 * @param filePath - Path to the local file to inspect.
 * @returns Detected MIME type, or `undefined` when the file type is unknown.
 */
export async function tryGetMimeTypeFromFile(filePath: string): Promise<string | undefined> {
  const fileType = await fileTypeFromFile(filePath);
  return fileType?.mime;
}

/**
 * Returns whether the given file is a supported artwork image.
 *
 * A file is considered supported when its detected MIME type matches one of the
 * artwork formats accepted by the tagging pipeline.
 *
 * @param filePath - Path to the local file to validate.
 * @returns `true` when the file is a supported artwork image, otherwise `false`.
 */
export async function isSupportedArtworkFile(filePath: string): Promise<boolean> {
  const mimeType = await tryGetMimeTypeFromFile(filePath);
  return !!mimeType && supportedArtworkMimeTypes.has(mimeType);
}
