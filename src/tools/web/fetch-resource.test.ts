import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchResource } from './fetch-resource.js';

interface MockGotRequestOptions {
  http2: true;
  headers: Record<string, string> | undefined;
  followRedirect: boolean;
  throwHttpErrors: false;
  responseType: 'buffer';
  timeout: {
    request: number;
  };
};

interface MockGotResponse {
  url: string;
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
};

type MockGot = (
  url: string,
  options: MockGotRequestOptions,
) => Promise<MockGotResponse>;

const { gotMock } = vi.hoisted(() => ({
  gotMock: vi.fn<MockGot>(),
}));

vi.mock('got', () => ({
  default: gotMock,
}));

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

const REQUEST_URL = new URL(
  'https://example.test/resource?source=test',
);

const RESPONSE_URL = 'https://cdn.example.test/final-resource';

function createGotResponse(
  overrides: Partial<MockGotResponse> = {},
): MockGotResponse {
  return {
    url: RESPONSE_URL,
    statusCode: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
    rawBody: Buffer.from('test response'),
    ...overrides,
  };
}

function readReadableStream(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: unknown) => {
      if (!Buffer.isBuffer(chunk)) {
        reject(
          new TypeError('Expected the response stream to emit Buffer chunks.'),
        );
        return;
      }

      chunks.push(chunk);
    });

    stream.once('error', reject);
    stream.once('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

beforeEach(() => {
  gotMock.mockReset();
  gotMock.mockResolvedValue(createGotResponse());
});

describe('fetchResource', () => {
  describe('request configuration', () => {
    it('uses the default request options', async () => {
      await fetchResource(REQUEST_URL);

      expect(gotMock).toHaveBeenCalledExactlyOnceWith(
        REQUEST_URL.toString(),
        {
          http2: true,
          headers: undefined,
          followRedirect: true,
          throwHttpErrors: false,
          responseType: 'buffer',
          timeout: {
            request: DEFAULT_REQUEST_TIMEOUT_MS,
          },
        },
      );
    });

    it('passes custom headers, redirect behavior, and timeout to got', async () => {
      const options = {
        headers: {
          'Accept': 'application/json',
          'x-request-id': 'request-123',
        },
        followRedirect: false,
        timeoutMs: 2_500,
      };

      await fetchResource(REQUEST_URL, options);

      expect(gotMock).toHaveBeenCalledExactlyOnceWith(
        REQUEST_URL.toString(),
        {
          http2: true,
          headers: options.headers,
          followRedirect: false,
          throwHttpErrors: false,
          responseType: 'buffer',
          timeout: {
            request: 2_500,
          },
        },
      );
    });
  });

  describe('HTTP response', () => {
    it('returns the response URL, status, success flag, and Headers instance', async () => {
      gotMock.mockResolvedValueOnce(
        createGotResponse({
          url: RESPONSE_URL,
          statusCode: 202,
          headers: {
            'content-type': 'application/json',
          },
        }),
      );

      const resource = await fetchResource(REQUEST_URL);

      expect(resource.url).toBe(RESPONSE_URL);
      expect(resource.status).toBe(202);
      expect(resource.ok).toBe(true);
      expect(resource.headers).toBeInstanceOf(Headers);
      expect(resource.headers.get('content-type')).toBe(
        'application/json',
      );
    });

    it.each([
      { statusCode: 199, expectedOk: false },
      { statusCode: 200, expectedOk: true },
      { statusCode: 299, expectedOk: true },
      { statusCode: 300, expectedOk: false },
      { statusCode: 404, expectedOk: false },
      { statusCode: 500, expectedOk: false },
    ])(
      'sets ok=$expectedOk for HTTP status $statusCode',
      async ({ statusCode, expectedOk }) => {
        gotMock.mockResolvedValueOnce(
          createGotResponse({ statusCode }),
        );

        const resource = await fetchResource(REQUEST_URL);

        expect(resource.status).toBe(statusCode);
        expect(resource.ok).toBe(expectedOk);
      },
    );
  });

  describe('response headers', () => {
    it('converts string, multi-value, and undefined headers correctly', async () => {
      const cookieHeaders = [
        'session=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
        'theme=dark; Path=/',
      ];

      gotMock.mockResolvedValueOnce(
        createGotResponse({
          headers: {
            'content-type': 'application/json',
            'x-custom-values': ['first', 'second'],
            'set-cookie': cookieHeaders,
            'x-omitted': undefined,
          },
        }),
      );

      const resource = await fetchResource(REQUEST_URL);

      expect(resource.headers.get('content-type')).toBe(
        'application/json',
      );
      expect(resource.headers.get('x-custom-values')).toBe(
        'first, second',
      );
      expect(resource.headers.has('x-omitted')).toBe(false);

      expect(resource.headers.getSetCookie()).toStrictEqual(
        cookieHeaders,
      );
    });
  });

  describe('response body', () => {
    it('returns the body decoded as UTF-8 text', async () => {
      const text = 'Zażółć gęślą jaźń — muzyka 🎧';

      gotMock.mockResolvedValueOnce(
        createGotResponse({
          rawBody: Buffer.from(text, 'utf8'),
        }),
      );

      const resource = await fetchResource(REQUEST_URL);

      await expect(resource.text()).resolves.toBe(text);
    });

    it('parses a valid JSON response', async () => {
      const expectedBody = {
        title: 'Żółć 🎧',
        nested: {
          count: 3,
          active: true,
        },
      };

      gotMock.mockResolvedValueOnce(
        createGotResponse({
          rawBody: Buffer.from(JSON.stringify(expectedBody), 'utf8'),
        }),
      );

      const resource = await fetchResource(REQUEST_URL);

      await expect(resource.json()).resolves.toStrictEqual(
        expectedBody,
      );
    });

    it('rejects when the response body contains invalid JSON', async () => {
      gotMock.mockResolvedValueOnce(
        createGotResponse({
          rawBody: Buffer.from('{ invalid JSON', 'utf8'),
        }),
      );

      const resource = await fetchResource(REQUEST_URL);

      await expect(resource.json()).rejects.toThrow(SyntaxError);
    });

    it('returns the response body as an ArrayBuffer containing exactly the response bytes', async () => {
      const expectedBody = Buffer.from([0, 10, 127, 128, 255]);

      gotMock.mockResolvedValueOnce(
        createGotResponse({
          rawBody: expectedBody,
        }),
      );

      const resource = await fetchResource(REQUEST_URL);
      const result = await resource.arrayBuffer();

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(expectedBody.length);
      expect(Buffer.from(result)).toEqual(expectedBody);
    });

    it('returns the response body as a Buffer', async () => {
      const expectedBody = Buffer.from([0, 10, 127, 128, 255]);

      gotMock.mockResolvedValueOnce(
        createGotResponse({
          rawBody: expectedBody,
        }),
      );

      const resource = await fetchResource(REQUEST_URL);
      const result = await resource.buffer();

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result).toEqual(expectedBody);
    });

    it('returns a readable stream containing the response bytes', async () => {
      const expectedBody = Buffer.from([0, 10, 127, 128, 255]);

      gotMock.mockResolvedValueOnce(
        createGotResponse({
          rawBody: expectedBody,
        }),
      );

      const resource = await fetchResource(REQUEST_URL);
      const stream = resource.stream();

      expect(stream).toBeInstanceOf(Readable);
      await expect(readReadableStream(stream)).resolves.toEqual(
        expectedBody,
      );
    });
  });

  describe('transport errors', () => {
    it('propagates the original transport error', async () => {
      const error = new Error('Network request failed');

      gotMock.mockRejectedValueOnce(error);

      await expect(fetchResource(REQUEST_URL)).rejects.toBe(error);
    });
  });
});
