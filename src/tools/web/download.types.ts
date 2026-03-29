/**
 * Options for downloading a remote file to the local filesystem.
 */
export interface DownloadFileOptions {
  /**
   * Optional target output file path.
   */
  outputFilePath?: string;

  /**
   * Optional additional HTTP request headers.
   */
  headers?: Record<string, string>;

  /**
   * Optional response validator executed after successful response
   * is received but before writing the body to disk.
   */
  validateResponse?: (response: Response, outputFilePath: string) => void;
}

/**
 * Options for downloading an image with browser-like request headers.
 */
export interface DownloadImageOptions {
  /**
   * Optional target output file path.
   */
  outputFilePath?: string;

  /**
   * Optional referrer URL.
   */
  referer?: URL;
}
