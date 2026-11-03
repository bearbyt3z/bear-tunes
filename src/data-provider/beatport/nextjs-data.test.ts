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

function createNextJSPageDocument(nextJSText?: string): Document {
  const document = new JSDOM().window.document;

  if (nextJSText !== undefined) {
    const nextJSElement = document.createElement('script');

    nextJSElement.id = '__NEXT_DATA__';
    nextJSElement.type = 'application/json';
    nextJSElement.textContent = nextJSText;

    document.body.append(nextJSElement);
  }

  return document;
}

function mockSuccessfulPageWithText(nextJSText?: string): void {
  mocks.fetchWebPage.mockResolvedValueOnce({
    success: true,
    document: createNextJSPageDocument(nextJSText),
    attempts: [],
  });
}

function mockSuccessfulPageWithPayload(payload: unknown): void {
  const nextJSText = JSON.stringify(payload);

  if (nextJSText === undefined) {
    throw new Error('Cannot serialize Next.js test payload.');
  }

  mockSuccessfulPageWithText(nextJSText);
}

function createNextJSPageData(queries: unknown[]): unknown {
  return {
    props: {
      pageProps: {
        dehydratedState: {
          queries,
        },
      },
    },
  };
}

function mockSuccessfulPage(queries: unknown[]): void {
  mockSuccessfulPageWithPayload(createNextJSPageData(queries));
}

async function expectTypeError(
  operation: Promise<unknown>,
  expectedMessage: string,
): Promise<TypeError> {
  const error = await operation.then(
    () => undefined,
    (reason: unknown) => reason,
  );

  expect(error).toBeInstanceOf(TypeError);

  if (!(error instanceof TypeError)) {
    throw new Error('Expected extractNextJSData() to reject with TypeError.');
  }

  expect(error.message).toBe(expectedMessage);

  return error;
}

describe('extractNextJSData', () => {
  beforeEach(() => {
    mocks.fetchWebPage.mockReset();
    mocks.loggerDebug.mockReset();
  });

  it('returns undefined when the page fetch is unsuccessful', async () => {
    mocks.fetchWebPage.mockResolvedValueOnce({
      success: false,
      document: createNextJSPageDocument('{}'),
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

  describe('invalid Next.js data', () => {
    it('throws when the Next.js data element is missing', async () => {
      mockSuccessfulPageWithText();

      await expectTypeError(
        extractNextJSData(pageUrl),
        'Cannot obtain Next.js object.',
      );
    });

    it('throws when the Next.js data element has empty text', async () => {
      mockSuccessfulPageWithText('');

      await expectTypeError(
        extractNextJSData(pageUrl),
        'Cannot obtain Next.js object.',
      );
    });

    it('throws when the Next.js data contains invalid JSON', async () => {
      mockSuccessfulPageWithText('{"props":');

      const error = await expectTypeError(
        extractNextJSData(pageUrl),
        'Cannot parse Next.js object.',
      );

      expect(error.cause).toBeInstanceOf(SyntaxError);
    });

    it.each([
      {
        description: 'null',
        payload: null,
      },
      {
        description: 'an array',
        payload: [],
      },
      {
        description: 'a string',
        payload: 'invalid payload',
      },
    ])(
      'throws when the parsed Next.js value is $description',
      async ({ payload }) => {
        mockSuccessfulPageWithPayload(payload);

        await expectTypeError(
          extractNextJSData(pageUrl),
          'Parsed Next.js object is not an object.',
        );
      },
    );

    it.each([
      {
        description: '`props` is not an object',
        payload: {
          props: null,
        },
        expectedMessage: 'Cannot unpack props from Next.js object.',
      },
      {
        description: '`pageProps` is missing',
        payload: {
          props: {},
        },
        expectedMessage: 'Cannot unpack pageProps from Next.js object.',
      },
      {
        description: '`dehydratedState` is missing',
        payload: {
          props: {
            pageProps: {},
          },
        },
        expectedMessage: 'Cannot unpack dehydratedState from Next.js object.',
      },
      {
        description: '`queries` is not an array',
        payload: {
          props: {
            pageProps: {
              dehydratedState: {
                queries: {},
              },
            },
          },
        },
        expectedMessage: 'Cannot unpack queries from Next.js object.',
      },
      {
        description: '`queries` is empty',
        payload: {
          props: {
            pageProps: {
              dehydratedState: {
                queries: [],
              },
            },
          },
        },
        expectedMessage: 'Cannot unpack queries from Next.js object.',
      },
      {
        description: 'the first query is not an object',
        payload: createNextJSPageData([null]),
        expectedMessage: 'Cannot unpack first query from Next.js object.',
      },
      {
        description: 'the first query has no state',
        payload: createNextJSPageData([{}]),
        expectedMessage: 'Cannot unpack state from Next.js object.',
      },
    ])(
      'throws when $description',
      async ({ payload, expectedMessage }) => {
        mockSuccessfulPageWithPayload(payload);

        await expectTypeError(
          extractNextJSData(pageUrl),
          expectedMessage,
        );
      },
    );

    it.each([
      {
        description: 'missing',
        state: {},
      },
      {
        description: 'null',
        state: {
          data: null,
        },
      },
      {
        description: 'false',
        state: {
          data: false,
        },
      },
      {
        description: 'zero',
        state: {
          data: 0,
        },
      },
      {
        description: 'an empty string',
        state: {
          data: '',
        },
      },
    ])(
      'throws when query state data is $description',
      async ({ state }) => {
        mockSuccessfulPageWithPayload(
          createNextJSPageData([{ state }]),
        );

        await expectTypeError(
          extractNextJSData(pageUrl),
          'Cannot unpack state data from Next.js object.',
        );
      },
    );
  });
});
