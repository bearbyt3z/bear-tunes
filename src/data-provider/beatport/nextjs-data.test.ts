import { JSDOM } from 'jsdom';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractNextJSData } from './nextjs-data.js';

const mocks = vi.hoisted(() => ({
  fetchWebPage: vi.fn(),
  loggerDebug: vi.fn(),
}));

vi.mock('#config', () => ({
  BROWSER_PROFILE_DIR: '/test/browser-profile',
  USER_AGENT_CACHE_FILE: '/test/user-agent-cache.json',
}));

vi.mock('#logger', () => ({
  default: {
    debug: mocks.loggerDebug,
  },
}));

vi.mock('#tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#tools')>();

  return {
    ...actual,
    fetchWebPage: mocks.fetchWebPage,
  };
});

const pageUrl = new URL('https://www.beatport.com/track/example-track/123456');

function createNextJSPageDocument(queries: unknown[]): Document {
  const document = new JSDOM().window.document;
  const nextJSElement = document.createElement('script');

  nextJSElement.id = '__NEXT_DATA__';
  nextJSElement.type = 'application/json';
  nextJSElement.textContent = JSON.stringify({
    props: {
      pageProps: {
        dehydratedState: {
          queries,
        },
      },
    },
  });

  document.body.append(nextJSElement);

  return document;
}

function mockSuccessfulPage(queries: unknown[]): void {
  mocks.fetchWebPage.mockResolvedValueOnce({
    success: true,
    document: createNextJSPageDocument(queries),
    attempts: [],
  });
}

describe('extractNextJSData', () => {
  beforeEach(() => {
    mocks.fetchWebPage.mockReset();
    mocks.loggerDebug.mockReset();
  });

  it('returns undefined when the page fetch is unsuccessful', async () => {
    mocks.fetchWebPage.mockResolvedValueOnce({
      success: false,
      document: createNextJSPageDocument([]),
      attempts: [],
    });

    const result = await extractNextJSData(pageUrl);

    expect(result).toBeUndefined();
  });

  it('returns undefined when the fetched page has no document', async () => {
    mocks.fetchWebPage.mockResolvedValueOnce({
      success: true,
      document: null,
      attempts: [],
    });

    const result = await extractNextJSData(pageUrl);

    expect(result).toBeUndefined();
  });

  it('extracts the data array from the first dehydrated query', async () => {
    const firstQueryData = [
      { id: 101, name: 'First Track' },
      { id: 102, name: 'Second Track' },
    ];

    const secondQueryData = [
      { id: 201, name: 'Another Track' },
    ];

    mockSuccessfulPage([
      {
        state: {
          data: {
            data: firstQueryData,
            count: 2,
          },
        },
      },
      {
        state: {
          data: {
            data: secondQueryData,
            count: 1,
          },
        },
      },
    ]);

    const result = await extractNextJSData(pageUrl);

    expect(result).toEqual(firstQueryData);

    expect(mocks.fetchWebPage).toHaveBeenCalledOnce();
    expect(mocks.fetchWebPage).toHaveBeenCalledWith(pageUrl, {
      browserProfileDir: '/test/browser-profile',
      userAgentCacheFile: '/test/user-agent-cache.json',
    });
  });

  it('returns an empty data array when the query has no results', async () => {
    mockSuccessfulPage([
      {
        state: {
          data: {
            data: [],
            count: 0,
          },
        },
      },
    ]);

    const result = await extractNextJSData(pageUrl);

    expect(result).toEqual([]);
  });

  it.each([
    {
      description: 'when the payload has no data property',
      stateData: {
        id: 123,
        name: 'Example Payload',
      },
    },
    {
      description: 'when the data property is not an array',
      stateData: {
        data: {
          items: ['track-1', 'track-2'],
        },
      },
    },
  ])(
    'returns the entire query payload $description',
    async ({ stateData }) => {
      mockSuccessfulPage([
        {
          state: {
            data: stateData,
          },
        },
      ]);

      const result = await extractNextJSData(pageUrl);

      expect(result).toEqual(stateData);
    },
  );
});
