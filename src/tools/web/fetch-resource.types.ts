import type { Readable } from 'node:stream';

/**
 * Options controlling a resource fetch performed by the shared HTTP transport.
 */
export interface FetchResourceOptions {
  /** Optional additional HTTP request headers. */
  headers?: Record<string, string>;

  /** Whether redirects should be followed automatically. */
  followRedirect?: boolean;

  /** Optional request timeout expressed in milliseconds. */
  timeoutMs?: number;
}

/**
 * HTTP resource response returned by the shared transport wrapper.
 */
export interface FetchedResource {
  /** Final response URL. */
  url: string;

  /** HTTP status code returned by the server. */
  status: number;

  /** Whether the status code represents a successful response. */
  ok: boolean;

  /** Response headers exposed through the standard Headers interface. */
  headers: Headers;

  /** Returns the response body decoded as UTF-8 text. */
  text(): Promise<string>;

  /** Parses the response body as JSON and returns the decoded value. */
  json(): Promise<unknown>;

  /** Returns the response body as an ArrayBuffer. */
  arrayBuffer(): Promise<ArrayBuffer>;

  /** Returns the raw response body buffer. */
  buffer(): Promise<Buffer>;

  /** Returns a Node.js readable stream created from the buffered response body. */
  stream(): Readable;
}
