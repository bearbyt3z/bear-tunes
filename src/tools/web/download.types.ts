/**
 * Options controlling remote file downloads to the local filesystem.
 */
export interface DownloadFileOptions {
  /** Optional target output file path override. */
  outputFilePath?: string;

  /** Optional additional HTTP request headers. */
  headers?: Record<string, string>;

  /**
   * Optional response validator executed after a successful response is received
   * and before writing the response body to disk.
   */
  validateResponse?: (response: Response, outputFilePath: string) => void;
}

/**
 * Options controlling image downloads with browser-like request headers.
 */
export interface DownloadImageOptions {
  /** Optional target output file path override. */
  outputFilePath?: string;

  /** Optional referer URL sent with the image request. */
  referer?: URL;
}
