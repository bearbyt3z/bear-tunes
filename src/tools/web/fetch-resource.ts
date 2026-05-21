import { Readable } from 'node:stream';
import got from 'got';

import type {
  FetchResourceOptions,
  FetchedResource,
} from './fetch-resource.types.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Converts got response headers to the standard Headers interface.
 *
 * @param source - Raw headers object returned by got.
 * @returns Headers instance containing the response headers.
 */
function toHeaders(source: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      headers.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    }
  }

  return headers;
}

/**
 * Returns an ArrayBuffer containing the provided response body bytes.
 *
 * @param body - Response body bytes.
 * @returns ArrayBuffer containing the copied response body bytes.
 */
function toArrayBuffer(body: Uint8Array): ArrayBuffer {
  return Uint8Array.from(body).buffer;
}

/**
 * Fetches a remote resource through got with HTTP/2 enabled.
 *
 * @param url - Resource URL to fetch.
 * @param options - Resource fetch options.
 * @returns Fetched resource response wrapper.
 */
export async function fetchResource(
  url: URL,
  options: FetchResourceOptions = {},
): Promise<FetchedResource> {
  const response = await got(url.toString(), {
    http2: true,
    headers: options.headers,
    followRedirect: options.followRedirect ?? true,
    throwHttpErrors: false,
    responseType: 'buffer',
    timeout: {
      request: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    },
  });

  const body = Buffer.from(response.rawBody);
  const headers = toHeaders(response.headers);

  return {
    url: response.url,
    status: response.statusCode,
    ok: response.statusCode >= 200 && response.statusCode < 300,
    headers,
    text(): Promise<string> {
      return Promise.resolve(body.toString('utf8'));
    },
    json(): Promise<unknown> {
      return Promise.resolve(JSON.parse(body.toString('utf8')));
    },
    arrayBuffer(): Promise<ArrayBuffer> {
      return Promise.resolve(toArrayBuffer(body));
    },
    buffer(): Promise<Buffer> {
      return Promise.resolve(body);
    },
    stream(): Readable {
      return Readable.from([body]);
    },
  };
}
