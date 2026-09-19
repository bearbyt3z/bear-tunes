import { tryGetMimeTypeFromFile } from './file-type.js';

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
 * Returns whether the given file is a supported artwork image.
 *
 * The file is considered supported when its detected MIME type matches one of
 * the artwork formats accepted by the tagging pipeline. The file extension is
 * not used to determine whether the artwork is supported.
 *
 * Errors encountered while reading or inspecting the file are propagated to
 * the caller.
 *
 * @param filePath - Path to the local file to validate.
 * @returns `true` when the detected MIME type is a supported artwork format,
 * otherwise `false`.
 * @throws If reading or inspecting the file fails.
 */
export async function isSupportedArtworkFile(filePath: string): Promise<boolean> {
  const mimeType = await tryGetMimeTypeFromFile(filePath);
  return mimeType !== undefined && supportedArtworkMimeTypes.has(mimeType);
}
