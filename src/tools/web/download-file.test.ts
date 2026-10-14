import * as nodeFs from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadFile } from './download-file.js';

const DOWNLOAD_URL = new URL(
  'https://example.test/downloads/song.mp3?source=test',
);

const fetchMock = vi.fn<typeof fetch>();

let temporaryDirectory = '';
let originalWorkingDirectory = '';

async function expectFileNotToExist(filePath: string): Promise<void> {
  await expect(fs.access(filePath)).rejects.toMatchObject({
    code: 'ENOENT',
  });
}

beforeEach(async () => {
  originalWorkingDirectory = process.cwd();
  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'download-file-test-'),
  );

  process.chdir(temporaryDirectory);

  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();

  if (originalWorkingDirectory.length > 0) {
    process.chdir(originalWorkingDirectory);
  }

  if (temporaryDirectory.length > 0) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }

  temporaryDirectory = '';
  originalWorkingDirectory = '';
});

describe('downloadFile', () => {
  describe('output filename', () => {
    it('derives the filename from the URL and writes the response body', async () => {
      const content = 'Downloaded file content';

      fetchMock.mockResolvedValueOnce(new Response(content));

      const outputFilePath = await downloadFile(DOWNLOAD_URL);

      expect(outputFilePath).toBe('song.mp3');
      await expect(
        fs.readFile(path.join(temporaryDirectory, outputFilePath), 'utf8'),
      ).resolves.toBe(content);

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        DOWNLOAD_URL.toString(),
        { headers: undefined },
      );
    });

    it('generates a fallback filename when the URL has no filename', async () => {
      const url = new URL('https://example.test/');

      fetchMock.mockResolvedValueOnce(new Response('Fallback content'));

      const outputFilePath = await downloadFile(url);

      expect(outputFilePath).toMatch(/^unnamed-download-/);

      await expect(
        fs.readFile(path.join(temporaryDirectory, outputFilePath), 'utf8'),
      ).resolves.toBe('Fallback content');
    });

    it('appends the URL extension when the output path has no extension', async () => {
      const outputPathWithoutExtension = path.join(
        temporaryDirectory,
        'custom-track',
      );
      const expectedFilePath = `${outputPathWithoutExtension}.mp3`;

      fetchMock.mockResolvedValueOnce(new Response('Track content'));

      const outputFilePath = await downloadFile(DOWNLOAD_URL, {
        outputFilePath: outputPathWithoutExtension,
      });

      expect(outputFilePath).toBe(expectedFilePath);

      await expect(fs.readFile(expectedFilePath, 'utf8')).resolves.toBe(
        'Track content',
      );
    });

    it('preserves an explicit output path that already has an extension', async () => {
      const outputFilePath = path.join(
        temporaryDirectory,
        'renamed-track.bin',
      );

      fetchMock.mockResolvedValueOnce(new Response('Renamed content'));

      await expect(
        downloadFile(DOWNLOAD_URL, { outputFilePath }),
      ).resolves.toBe(outputFilePath);

      await expect(fs.readFile(outputFilePath, 'utf8')).resolves.toBe(
        'Renamed content',
      );
    });

    it('does not append an extension when the URL filename has none', async () => {
      const url = new URL('https://example.test/downloads/resource');
      const outputFilePath = path.join(temporaryDirectory, 'local-copy');

      fetchMock.mockResolvedValueOnce(new Response('Resource content'));

      await expect(
        downloadFile(url, { outputFilePath }),
      ).resolves.toBe(outputFilePath);

      await expect(fs.readFile(outputFilePath, 'utf8')).resolves.toBe(
        'Resource content',
      );
    });
  });

  describe('request', () => {
    it('passes custom headers to fetch', async () => {
      const headers = {
        'x-api-key': 'test-token',
      };
      const outputFilePath = path.join(temporaryDirectory, 'with-headers.bin');

      fetchMock.mockResolvedValueOnce(new Response('Authorized content'));

      await downloadFile(DOWNLOAD_URL, {
        outputFilePath,
        headers,
      });

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        DOWNLOAD_URL.toString(),
        { headers },
      );

      await expect(fs.readFile(outputFilePath, 'utf8')).resolves.toBe(
        'Authorized content',
      );
    });

    it('propagates a fetch error without creating an output file', async () => {
      const error = new Error('Network request failed');
      const outputFilePath = path.join(temporaryDirectory, 'failed.bin');

      fetchMock.mockRejectedValueOnce(error);

      await expect(
        downloadFile(DOWNLOAD_URL, { outputFilePath }),
      ).rejects.toBe(error);

      await expectFileNotToExist(outputFilePath);
    });
  });

  describe('HTTP responses', () => {
    it('rejects unsuccessful responses, cancels the body, and skips validation', async () => {
      let cancellationCount = 0;
      const responseBody = new ReadableStream<Uint8Array>({
        cancel(): void {
          cancellationCount += 1;
        },
      });
      const response = new Response(responseBody, { status: 503 });
      const outputFilePath = path.join(temporaryDirectory, 'http-error.bin');
      const validateResponse = vi.fn((): void => undefined);

      fetchMock.mockResolvedValueOnce(response);

      await expect(
        downloadFile(DOWNLOAD_URL, {
          outputFilePath,
          validateResponse,
        }),
      ).rejects.toThrow(
        `Failed to download file: HTTP 503 for "${DOWNLOAD_URL.toString()}"`,
      );

      expect(cancellationCount).toBe(1);
      expect(validateResponse).not.toHaveBeenCalled();
      await expectFileNotToExist(outputFilePath);
    });

    it('rejects a successful response with a missing body before validation', async () => {
      const response = new Response(null, { status: 200 });
      const outputFilePath = path.join(temporaryDirectory, 'no-body.bin');
      const validateResponse = vi.fn((): void => undefined);

      fetchMock.mockResolvedValueOnce(response);

      await expect(
        downloadFile(DOWNLOAD_URL, {
          outputFilePath,
          validateResponse,
        }),
      ).rejects.toThrow(
        `Failed to download a file: ${outputFilePath} (response body is null)`,
      );

      expect(validateResponse).not.toHaveBeenCalled();
      await expectFileNotToExist(outputFilePath);
    });
  });

  describe('response validation', () => {
    it('awaits an asynchronous validator before writing the response body', async () => {
      const content = 'Validated content';
      const response = new Response(content);
      const outputFilePath = path.join(temporaryDirectory, 'validated.bin');

      let releaseValidation = (): void => undefined;
      const validationGate = new Promise<void>((resolve) => {
        releaseValidation = resolve;
      });

      const validateResponse = vi.fn(
        async (
          receivedResponse: Response,
          receivedFilePath: string,
        ): Promise<void> => {
          expect(receivedResponse).toBe(response);
          expect(receivedFilePath).toBe(outputFilePath);

          await validationGate;
        },
      );

      fetchMock.mockResolvedValueOnce(response);

      const downloadPromise = downloadFile(DOWNLOAD_URL, {
        outputFilePath,
        validateResponse,
      });

      try {
        await vi.waitFor(() => {
          expect(validateResponse).toHaveBeenCalledExactlyOnceWith(
            response,
            outputFilePath,
          );
        });

        await expectFileNotToExist(outputFilePath);
      } finally {
        releaseValidation();
      }

      await expect(downloadPromise).resolves.toBe(outputFilePath);

      await expect(fs.readFile(outputFilePath, 'utf8')).resolves.toBe(
        content,
      );
    });

    it('preserves the validation error when cancelling the response body also fails', async () => {
      const validationError = new Error('Response validation failed');
      const cancellationError = new Error('Response cancellation failed');
      let cancellationCount = 0;

      const responseBody = new ReadableStream<Uint8Array>({
        cancel(): void {
          cancellationCount += 1;
          throw cancellationError;
        },
      });

      const response = new Response(responseBody);
      const outputFilePath = path.join(
        temporaryDirectory,
        'validation-error.bin',
      );

      const validateResponse = vi.fn(
        (): Promise<void> => Promise.reject(validationError),
      );

      fetchMock.mockResolvedValueOnce(response);

      await expect(
        downloadFile(DOWNLOAD_URL, {
          outputFilePath,
          validateResponse,
        }),
      ).rejects.toBe(validationError);

      expect(cancellationCount).toBe(1);
      expect(validateResponse).toHaveBeenCalledExactlyOnceWith(
        response,
        outputFilePath,
      );

      await expectFileNotToExist(outputFilePath);
    });
  });

  describe('streaming and cleanup', () => {
    it('removes a partially downloaded file when the response stream fails', async () => {
      const streamError = new Error('Response stream failed');
      const outputFilePath = path.join(
        temporaryDirectory,
        'partial-download.bin',
      );

      let chunkSent = false;

      const responseBody = new ReadableStream<Uint8Array>({
        pull(controller): void {
          if (!chunkSent) {
            chunkSent = true;
            controller.enqueue(
              new TextEncoder().encode('Partial file content'),
            );
            return;
          }

          controller.error(streamError);
        },
      });

      fetchMock.mockResolvedValueOnce(new Response(responseBody));

      await expect(
        downloadFile(DOWNLOAD_URL, { outputFilePath }),
      ).rejects.toThrow('Response stream failed');

      await expectFileNotToExist(outputFilePath);
    });

    it('preserves the stream error when removing a partial file fails', async () => {
      const streamError = new Error('Response stream failed');
      const cleanupError = new Error('Partial file cleanup failed');
      const outputFilePath = path.join(
        temporaryDirectory,
        'partial-cleanup-failure.bin',
      );

      let chunkSent = false;

      const responseBody = new ReadableStream<Uint8Array>({
        pull(controller): void {
          if (!chunkSent) {
            chunkSent = true;
            controller.enqueue(
              new TextEncoder().encode('Partial file content'),
            );
            return;
          }

          controller.error(streamError);
        },
      });

      fetchMock.mockResolvedValueOnce(new Response(responseBody));

      const removeSpy = vi
        .spyOn(nodeFs.promises, 'rm')
        .mockRejectedValueOnce(cleanupError);

      try {
        await expect(
          downloadFile(DOWNLOAD_URL, { outputFilePath }),
        ).rejects.toBe(streamError);

        expect(removeSpy).toHaveBeenCalledWith(outputFilePath, {
          force: true,
        });
      } finally {
        removeSpy.mockRestore();
      }
    });
  });
});
