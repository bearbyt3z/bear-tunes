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
   *
   * The validator may be asynchronous, but must not read, consume, or cancel
   * response.body because the body is streamed to the output file after
   * validation succeeds.
   */
  validateResponse?: (
    response: Response,
    outputFilePath: string,
  ) => void | Promise<void>;
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
