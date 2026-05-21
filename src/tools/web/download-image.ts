import * as path from 'node:path';

import { downloadFile } from './download-file.js';
import {
  getFetchClientProfile,
  buildImageDownloadHeaders,
} from './request-identity.js';
import { replaceFilenameExtension } from '../utils/path.js';

import type { DownloadImageOptions } from './download.types.js';

/**
 * Returns the expected image MIME type derived from an output file path.
 *
 * @param outputFilePath - Output file path whose extension is used for MIME type resolution.
 * @returns Expected image MIME type or `undefined` when the extension is not recognized.
 */
function getExpectedImageMimeType(outputFilePath: string): string | undefined {
  switch (path.extname(outputFilePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return undefined;
  }
}

/**
 * Extracts the base MIME type from a Content-Type header value.
 *
 * Any optional parameters such as charset are removed.
 *
 * @param contentTypeHeader - Raw Content-Type header value.
 * @returns Lowercased base MIME type without optional parameters.
 */
function getBaseMimeType(contentTypeHeader: string): string {
  return contentTypeHeader.split(';')[0].trim().toLowerCase();
}

/**
 * Validates that the response MIME type matches the expected image type for the
 * output file path.
 *
 * @param response - Fetch response to validate.
 * @param outputFilePath - Target output file path used for expected MIME type resolution.
 * @throws {Error} When the response MIME type does not match the expected image type.
 */
export function validateImageMimeType(
  response: Response,
  outputFilePath: string,
): void {
  const contentTypeHeader = response.headers.get('content-type');

  if (!contentTypeHeader) {
    return;
  }

  const expectedMimeType = getExpectedImageMimeType(outputFilePath);

  if (!expectedMimeType) {
    return;
  }

  const responseMimeType = getBaseMimeType(contentTypeHeader);

  if (responseMimeType !== expectedMimeType) {
    throw new Error(
      `Image MIME type mismatch for "${outputFilePath}". ` +
      `Expected "${expectedMimeType}", but server responded with "${responseMimeType}".`,
    );
  }
}

/**
 * Downloads an image with browser-like request headers and response MIME type
 * validation.
 *
 * @param url - Source image URL.
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @param options - Download options.
 * @param options.outputFilePath - Optional target output file path.
 * @param options.referer - Optional referrer URL for the image request.
 * @returns Resolved output file path after successful download and validation.
 */
export async function downloadImage(
  url: URL,
  userAgentCacheFile: string,
  options: DownloadImageOptions = {},
): Promise<string> {
  const profile = await getFetchClientProfile(userAgentCacheFile);

  const headers = buildImageDownloadHeaders(profile, options.referer);

  return downloadFile(url, {
    outputFilePath: options.outputFilePath,
    headers,
    validateResponse: validateImageMimeType,
  });
}

/**
 * Downloads album artwork and saves it next to the track file.
 *
 * The saved artwork path reuses the track file path and replaces its extension
 * with the extension derived from the artwork URL. If the artwork URL does not
 * expose a recognizable extension, a fallback `.unrecognized` extension is
 * used.
 *
 * @param trackPath - Path to the track file.
 * @param artworkUrl - URL of the artwork image to download.
 * @param refererUrl - Optional referer URL sent with the artwork request.
 * @param userAgentCacheFile - Path to the persisted request identity cache file.
 * @returns Path to the saved artwork file, or `undefined` when no artwork URL was provided.
 */
export async function downloadAndSaveArtwork(
  trackPath: string,
  artworkUrl: URL | undefined,
  refererUrl: URL | undefined,
  userAgentCacheFile: string,
): Promise<string | undefined> {
  if (!artworkUrl) {
    return;
  }

  // URL.pathname always uses POSIX-style separators, so use path.posix helpers
  // instead of platform-dependent path parsing.
  const artworkExtension = path.posix.extname(artworkUrl.pathname) || '.unrecognized';
  const artworkPath = replaceFilenameExtension(trackPath, artworkExtension);

  await downloadImage(artworkUrl, userAgentCacheFile, {
    outputFilePath: artworkPath,
    referer: refererUrl,
  });

  return artworkPath;
}
