import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { generateRandomHexString } from '@/tools/index.js';

import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

import type { DownloadFileOptions } from './download.types.js';

/**
 * Converts a Fetch API response body into a Node.js readable stream.
 *
 * This helper isolates the DOM-vs-Node stream typing workaround used by
 * Readable.fromWeb(), so the cast does not leak into higher-level code.
 */
function bodyToReadable(body: ReadableStream<Uint8Array>): Readable {
  // TypeScript mismatch between DOM ReadableStream returned by fetch()
  // and node:stream/web ReadableStream expected by Readable.fromWeb().
  return Readable.fromWeb(body as unknown as NodeWebReadableStream<Uint8Array>);
}

/**
 * Resolves the output filename for a downloaded resource.
 *
 * If no filename is provided, the filename is derived from the URL path.
 * If a filename without extension is provided, the extension is copied
 * from the URL filename when available.
 */
function resolveDownloadFilename(url: URL, filename?: string): string {
  // URL.pathname always uses forward-slash-separated URL paths,
  // so use path.posix helpers instead of platform-dependent path parsing.
  const urlFilename = path.posix.basename(url.pathname) || `unnamed-download-${generateRandomHexString(6)}`;

  if (!filename || filename.length < 1) {
    return urlFilename;
  }

  // Use POSIX path helpers here as well, because the derived source name
  // still comes from a URL path rather than a native filesystem path.
  if (!path.posix.extname(filename)) {
    const extension = path.posix.extname(urlFilename);
    return extension ? `${filename}${extension}` : filename;
  }

  return filename;
}

/**
 * Downloads a remote file to the local filesystem using fetch().
 *
 * @param url - Source URL to download.
 * @param options - Download options.
 * @param options.outputFilePath - Optional target output file path.
 * @param options.headers - Optional additional HTTP request headers.
 * @param options.validateResponse - Optional response validator executed after
 * successful response but before writing to disk.
 * @returns The resolved output filename after the file has been written.
 */
export async function downloadFile(
  url: URL,
  options: DownloadFileOptions = {},
): Promise<string> {
  const resolvedFilePath = resolveDownloadFilename(url, options.outputFilePath);

  const response = await fetch(url.toString(), {
    headers: options.headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: HTTP ${response.status} for "${url.toString()}"`);
  }

  if (options.validateResponse) {
    options.validateResponse(response, resolvedFilePath);
  }

  if (!response.body) {
    throw new Error(`Failed to download a file: ${resolvedFilePath} (response body is null)`);
  }

  const readable = bodyToReadable(response.body);
  const writable = fs.createWriteStream(resolvedFilePath);

  try {
    await pipeline(readable, writable);
    return resolvedFilePath;
  } catch (error) {
    // Remove any partially downloaded file left after a failed write.
    // Ignore cleanup errors so the original download/write error is preserved.
    await fs.promises.rm(resolvedFilePath, { force: true }).catch(() => undefined);
    throw error;
  }
}
