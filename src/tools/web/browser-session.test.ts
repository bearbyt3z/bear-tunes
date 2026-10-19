import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPageWithPersistentProfile } from './browser-session.js';
import {
  PageFetchFailureReason,
  PageFetchMethod,
} from './browser-session.types.js';

import type { BrowserNavigatorContext } from './request-identity.types.js';

const mocks = vi.hoisted(() => ({
  launchPersistentContext: vi.fn(),
  getBrowserContextOptions: vi.fn(),
  resolveBrowserNavigatorContext: vi.fn(),
  saveAcceptedBrowserNavigatorContext: vi.fn(),
  TimeoutError: class TimeoutError extends Error { },
}));

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: mocks.launchPersistentContext,
  },
  errors: {
    TimeoutError: mocks.TimeoutError,
  },
}));

vi.mock('./request-identity.js', () => ({
  getBrowserContextOptions: mocks.getBrowserContextOptions,
  resolveBrowserNavigatorContext: mocks.resolveBrowserNavigatorContext,
  saveAcceptedBrowserNavigatorContext:
    mocks.saveAcceptedBrowserNavigatorContext,
}));

const RESOLVED_HTML =
  '<html><head><title>Example Page</title></head><body><main>Loaded</main></body></html>';

const NAVIGATOR_CONTEXT: BrowserNavigatorContext = {
  userAgent: 'Mozilla/5.0 TestBrowser',
  platform: 'Linux x86_64',
  language: 'en-US',
  vendor: 'Google Inc.',
};

const FIXED_NOW = new Date('2026-10-19T12:00:00.000Z');

type LoadState = 'domcontentloaded' | 'load';

interface MockPageState {
  url: string;
  title: string;
  html: string;
  hasRecaptchaFrame: boolean;
}

interface MockPage {
  url: () => string;
  title: () => Promise<string>;
  content: () => Promise<string>;
  $: (selector: string) => Promise<object | null>;
  evaluate: (callback: () => unknown) => Promise<BrowserNavigatorContext>;
  goto: (
    url: string,
    options: {
      waitUntil: 'domcontentloaded';
      timeout: number;
    },
  ) => Promise<null>;
  waitForLoadState: (
    state: LoadState,
    options?: { timeout?: number },
  ) => Promise<void>;
  waitForTimeout: (timeoutMs: number) => Promise<void>;
}

interface MockCdpSession {
  send: (
    method: string,
    parameters: { userAgent: string },
  ) => Promise<void>;
}

interface MockContext {
  pages: () => MockPage[];
  newPage: () => Promise<MockPage>;
  newCDPSession: (page: MockPage) => Promise<MockCdpSession>;
  addInitScript: (
    script: (overrides: BrowserNavigatorContext) => void,
    navigatorContext: BrowserNavigatorContext,
  ) => Promise<void>;
  close: () => Promise<void>;
}

let temporaryDirectory = '';
let browserProfileDir = '';
let userAgentCacheFile = '';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  mocks.launchPersistentContext.mockReset();

  mocks.getBrowserContextOptions.mockReset();
  mocks.getBrowserContextOptions.mockReturnValue({});

  mocks.resolveBrowserNavigatorContext.mockReset();
  mocks.resolveBrowserNavigatorContext.mockResolvedValue(
    NAVIGATOR_CONTEXT,
  );

  mocks.saveAcceptedBrowserNavigatorContext.mockReset();
  mocks.saveAcceptedBrowserNavigatorContext.mockResolvedValue(undefined);

  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'browser-session-test-'),
  );

  browserProfileDir = path.join(temporaryDirectory, 'browser-profile');
  userAgentCacheFile = path.join(
    temporaryDirectory,
    'user-agent-cache.json',
  );
});

afterEach(async () => {
  if (temporaryDirectory.length > 0) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }

  temporaryDirectory = '';
  browserProfileDir = '';
  userAgentCacheFile = '';

  vi.useRealTimers();
});

function createMockPage(
  overrides: Partial<MockPageState> = {},
  onWaitForTimeout?: (
    timeoutMs: number,
    state: MockPageState,
  ) => void,
  onGoto?: (
    url: string,
    options: {
      waitUntil: 'domcontentloaded';
      timeout: number;
    },
  ) => Promise<null>,
  onWaitForLoadState?: (
    loadState: LoadState,
    options: { timeout?: number } | undefined,
    state: MockPageState,
  ) => Promise<void>,
): { page: MockPage; state: MockPageState } {
  const state: MockPageState = {
    url: overrides.url ?? 'https://example.test/page',
    title: overrides.title ?? 'Example Page',
    html: overrides.html ?? RESOLVED_HTML,
    hasRecaptchaFrame: overrides.hasRecaptchaFrame ?? false,
  };

  const page: MockPage = {
    url: vi.fn((): string => state.url),

    title: vi.fn((): Promise<string> => Promise.resolve(state.title)),

    content: vi.fn((): Promise<string> => Promise.resolve(state.html)),

    $: vi.fn((selector: string): Promise<object | null> => {
      void selector;

      return Promise.resolve(state.hasRecaptchaFrame ? {} : null);
    }),

    evaluate: vi.fn(
      (callback: () => unknown): Promise<BrowserNavigatorContext> => {
        void callback;

        return Promise.resolve(NAVIGATOR_CONTEXT);
      },
    ),

    goto: vi.fn((
      url: string,
      options: {
        waitUntil: 'domcontentloaded';
        timeout: number;
      },
    ): Promise<null> => {
      if (onGoto !== undefined) {
        return onGoto(url, options);
      }

      return Promise.resolve(null);
    }),

    waitForLoadState: vi.fn((
      loadState: LoadState,
      options?: { timeout?: number },
    ): Promise<void> => {
      if (onWaitForLoadState !== undefined) {
        return onWaitForLoadState(loadState, options, state);
      }

      return Promise.resolve();
    }),

    waitForTimeout: vi.fn(async (timeoutMs: number): Promise<void> => {
      await vi.advanceTimersByTimeAsync(timeoutMs);
      onWaitForTimeout?.(timeoutMs, state);
    }),
  };

  return { page, state };
}

function createMockContext(
  page: MockPage,
  existingPages: MockPage[] = [page],
): {
  context: MockContext;
  cdpSession: MockCdpSession;
} {
  const cdpSession: MockCdpSession = {
    send: vi.fn((
      method: string,
      parameters: { userAgent: string },
    ): Promise<void> => {
      void method;
      void parameters;

      return Promise.resolve();
    }),
  };

  const context: MockContext = {
    pages: vi.fn((): MockPage[] => existingPages),

    newPage: vi.fn((): Promise<MockPage> => Promise.resolve(page)),

    newCDPSession: vi.fn((observedPage: MockPage): Promise<MockCdpSession> => {
      void observedPage;

      return Promise.resolve(cdpSession);
    }),

    addInitScript: vi.fn((
      script: (overrides: BrowserNavigatorContext) => void,
      navigatorContext: BrowserNavigatorContext,
    ): Promise<void> => {
      void script;
      void navigatorContext;

      return Promise.resolve();
    }),

    close: vi.fn((): Promise<void> => Promise.resolve()),
  };

  return { context, cdpSession };
}

describe('fetchPageWithPersistentProfile', () => {
  it('returns the resolved page from the headless attempt', async () => {
    const { page } = createMockPage();
    const { context, cdpSession } = createMockContext(page);

    mocks.launchPersistentContext.mockResolvedValue(context);

    const url = new URL('https://example.test/page');

    const result = await fetchPageWithPersistentProfile(url, {
      browserProfileDir,
      userAgentCacheFile,
    });

    expect(result).toEqual({
      success: true,
      html: RESOLVED_HTML,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: true,
        },
      ],
    });

    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(1);
    expect(mocks.launchPersistentContext).toHaveBeenCalledWith(
      browserProfileDir,
      expect.objectContaining({ headless: true }),
    );

    expect(page.goto).toHaveBeenCalledWith(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    expect(cdpSession.send).toHaveBeenCalledWith(
      'Network.setUserAgentOverride',
      { userAgent: NAVIGATOR_CONTEXT.userAgent },
    );

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('falls back to a headful browser when the headless attempt detects a challenge', async () => {
    const challengeState: Partial<MockPageState> = {
      title: 'Just a moment...',
      html: `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="challenge-stage">Checking your browser</div>
        </body>
      </html>
    `,
    };

    const { page: headlessPage } = createMockPage(challengeState);
    const { context: headlessContext } = createMockContext(headlessPage);

    const { page: headfulPage } = createMockPage(
      challengeState,
      (timeoutMs, state) => {
        if (timeoutMs > 0) {
          state.title = 'Example Page';
          state.html = RESOLVED_HTML;
        }
      },
    );

    const {
      context: headfulContext,
      cdpSession: headfulCdpSession,
    } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const url = new URL('https://example.test/page');

    const result = await fetchPageWithPersistentProfile(url, {
      browserProfileDir,
      userAgentCacheFile,
    });

    expect(result).toEqual({
      success: true,
      html: RESOLVED_HTML,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: false,
          reason: PageFetchFailureReason.ChallengeResponse,
        },
        {
          method: PageFetchMethod.BrowserHeadful,
          success: true,
        },
      ],
    });

    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(2);

    expect(mocks.launchPersistentContext).toHaveBeenNthCalledWith(
      1,
      browserProfileDir,
      expect.objectContaining({ headless: true }),
    );

    expect(mocks.launchPersistentContext).toHaveBeenNthCalledWith(
      2,
      browserProfileDir,
      expect.objectContaining({ headless: false }),
    );

    expect(headlessPage.goto).toHaveBeenCalledWith(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    expect(headfulPage.goto).toHaveBeenCalledWith(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    expect(headfulPage.waitForTimeout).toHaveBeenCalledWith(1000);

    expect(headfulCdpSession.send).toHaveBeenCalledWith(
      'Network.setUserAgentOverride',
      { userAgent: NAVIGATOR_CONTEXT.userAgent },
    );

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).toHaveBeenCalledWith(NAVIGATOR_CONTEXT, userAgentCacheFile);

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('returns failure when the headful attempt does not resolve the challenge before the timeout', async () => {
    const challengeState: Partial<MockPageState> = {
      title: 'Just a moment...',
      html: `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="challenge-stage">Checking your browser</div>
        </body>
      </html>
    `,
    };

    const { page: headlessPage } = createMockPage(challengeState);
    const { context: headlessContext } = createMockContext(headlessPage);

    const { page: headfulPage } = createMockPage(challengeState);
    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const url = new URL('https://example.test/page');
    const manualTimeoutMs = 2500;

    const result = await fetchPageWithPersistentProfile(url, {
      browserProfileDir,
      userAgentCacheFile,
      manualTimeoutMs,
    });

    expect(result).toEqual({
      success: false,
      html: null,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: false,
          reason: PageFetchFailureReason.ChallengeResponse,
        },
        {
          method: PageFetchMethod.BrowserHeadful,
          success: false,
          reason: PageFetchFailureReason.ChallengeResponse,
        },
      ],
    });

    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(2);

    expect(mocks.launchPersistentContext).toHaveBeenNthCalledWith(
      1,
      browserProfileDir,
      expect.objectContaining({ headless: true }),
    );

    expect(mocks.launchPersistentContext).toHaveBeenNthCalledWith(
      2,
      browserProfileDir,
      expect.objectContaining({ headless: false }),
    );

    expect(headfulPage.waitForTimeout).toHaveBeenCalledTimes(3);
    expect(headfulPage.waitForTimeout).toHaveBeenNthCalledWith(1, 1000);
    expect(headfulPage.waitForTimeout).toHaveBeenNthCalledWith(2, 1000);
    expect(headfulPage.waitForTimeout).toHaveBeenNthCalledWith(3, 500);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('propagates headless navigation errors and closes the browser context', async () => {
    const navigationError = new Error('Headless navigation failed');
    const { page } = createMockPage(
      {},
      undefined,
      () => Promise.reject(navigationError),
    );
    const { context } = createMockContext(page);

    mocks.launchPersistentContext.mockResolvedValueOnce(context);

    const url = new URL('https://example.test/page');

    await expect(
      fetchPageWithPersistentProfile(url, {
        browserProfileDir,
        userAgentCacheFile,
      }),
    ).rejects.toBe(navigationError);

    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(1);

    expect(page.goto).toHaveBeenCalledWith(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    expect(context.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('propagates headful navigation errors and closes both browser contexts', async () => {
    const challengeState: Partial<MockPageState> = {
      title: 'Just a moment...',
      html: `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="challenge-stage">Checking your browser</div>
        </body>
      </html>
    `,
    };

    const { page: headlessPage } = createMockPage(challengeState);
    const { context: headlessContext } = createMockContext(headlessPage);

    const navigationError = new Error('Headful navigation failed');
    const { page: headfulPage } = createMockPage(
      challengeState,
      undefined,
      () => Promise.reject(navigationError),
    );
    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const url = new URL('https://example.test/page');

    await expect(
      fetchPageWithPersistentProfile(url, {
        browserProfileDir,
        userAgentCacheFile,
      }),
    ).rejects.toBe(navigationError);

    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(2);

    expect(headlessPage.goto).toHaveBeenCalledWith(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    expect(headfulPage.goto).toHaveBeenCalledWith(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('reports a CAPTCHA failure when a reCAPTCHA frame remains present', async () => {
    const captchaState: Partial<MockPageState> = {
      title: 'Just a moment...',
      html: `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="challenge-stage">Checking your browser</div>
        </body>
      </html>
    `,
      hasRecaptchaFrame: true,
    };

    const { page: headlessPage } = createMockPage(captchaState);
    const { context: headlessContext } = createMockContext(headlessPage);

    const { page: headfulPage } = createMockPage(captchaState);
    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
        manualTimeoutMs: 500,
      },
    );

    expect(result).toEqual({
      success: false,
      html: null,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: false,
          reason: PageFetchFailureReason.Captcha,
        },
        {
          method: PageFetchMethod.BrowserHeadful,
          success: false,
          reason: PageFetchFailureReason.Captcha,
        },
      ],
    });

    expect(headfulPage.waitForTimeout).toHaveBeenCalledWith(500);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('reports a missing resolved-page marker when the response is not a usable HTML document', async () => {
    const unexpectedPage: Partial<MockPageState> = {
      title: 'Example Page',
      html: 'The upstream response did not contain an HTML document.',
    };

    const { page: headlessPage } = createMockPage(unexpectedPage);
    const { context: headlessContext } = createMockContext(headlessPage);

    const { page: headfulPage } = createMockPage(unexpectedPage);
    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
        manualTimeoutMs: 500,
      },
    );

    expect(result).toEqual({
      success: false,
      html: null,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: false,
          reason: PageFetchFailureReason.ResolvedPageMarkerNotFound,
        },
        {
          method: PageFetchMethod.BrowserHeadful,
          success: false,
          reason: PageFetchFailureReason.ResolvedPageMarkerNotFound,
        },
      ],
    });

    expect(headfulPage.waitForTimeout).toHaveBeenCalledWith(500);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('rechecks page state after a load-state timeout and accepts the resolved page', async () => {
    const challengeState: Partial<MockPageState> = {
      title: 'Just a moment...',
      html: `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="challenge-stage">Checking your browser</div>
        </body>
      </html>
    `,
    };

    const { page: headlessPage } = createMockPage(challengeState);
    const { context: headlessContext } = createMockContext(headlessPage);

    const { page: headfulPage } = createMockPage(
      challengeState,
      undefined,
      undefined,
      async (loadState, options, state) => {
        if (loadState !== 'domcontentloaded' || options?.timeout === undefined) {
          return;
        }

        await vi.advanceTimersByTimeAsync(options.timeout);

        state.title = 'Example Page';
        state.html = RESOLVED_HTML;

        throw new mocks.TimeoutError('Load-state wait timed out');
      },
    );

    const {
      context: headfulContext,
      cdpSession: headfulCdpSession,
    } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
        manualTimeoutMs: 2500,
      },
    );

    expect(result).toEqual({
      success: true,
      html: RESOLVED_HTML,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: false,
          reason: PageFetchFailureReason.ChallengeResponse,
        },
        {
          method: PageFetchMethod.BrowserHeadful,
          success: true,
        },
      ],
    });

    expect(headfulPage.waitForLoadState).toHaveBeenCalledWith(
      'domcontentloaded',
      { timeout: 1000 },
    );

    expect(headfulPage.waitForLoadState).toHaveBeenCalledTimes(1);

    expect(headfulCdpSession.send).toHaveBeenCalledWith(
      'Network.setUserAgentOverride',
      { userAgent: NAVIGATOR_CONTEXT.userAgent },
    );

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).toHaveBeenCalledWith(NAVIGATOR_CONTEXT, userAgentCacheFile);

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('propagates non-timeout errors from load-state waits and closes browser contexts', async () => {
    const challengeState: Partial<MockPageState> = {
      title: 'Just a moment...',
      html: `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="challenge-stage">Checking your browser</div>
        </body>
      </html>
    `,
    };

    const { page: headlessPage } = createMockPage(challengeState);
    const { context: headlessContext } = createMockContext(headlessPage);

    const loadStateError = new Error('Load-state wait failed');

    const { page: headfulPage } = createMockPage(
      challengeState,
      undefined,
      undefined,
      () => Promise.reject(loadStateError),
    );

    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
          manualTimeoutMs: 5000,
        },
      ),
    ).rejects.toBe(loadStateError);

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('creates a new page when the persistent context has no existing pages', async () => {
    const { page } = createMockPage();
    const { context } = createMockContext(page, []);

    mocks.launchPersistentContext.mockResolvedValueOnce(context);

    const url = new URL('https://example.test/page');

    const result = await fetchPageWithPersistentProfile(url, {
      browserProfileDir,
      userAgentCacheFile,
    });

    expect(result).toEqual({
      success: true,
      html: RESOLVED_HTML,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: true,
        },
      ],
    });

    expect(context.pages).toHaveBeenCalledTimes(1);
    expect(context.newPage).toHaveBeenCalledTimes(1);

    expect(page.goto).toHaveBeenCalledWith(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    expect(context.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('handles page state read errors as an unresolved page', async () => {
    const { page: headlessPage } = createMockPage();
    const { context: headlessContext } = createMockContext(headlessPage);

    const { page: headfulPage } = createMockPage();
    const { context: headfulContext } = createMockContext(headfulPage);

    vi.spyOn(headlessPage, 'title').mockRejectedValue(
      new Error('Unable to read headless page title'),
    );
    vi.spyOn(headlessPage, 'content').mockRejectedValue(
      new Error('Unable to read headless page HTML'),
    );
    vi.spyOn(headlessPage, '$').mockRejectedValue(
      new Error('Unable to inspect headless page frames'),
    );

    vi.spyOn(headfulPage, 'title').mockRejectedValue(
      new Error('Unable to read headful page title'),
    );
    vi.spyOn(headfulPage, 'content').mockRejectedValue(
      new Error('Unable to read headful page HTML'),
    );
    vi.spyOn(headfulPage, '$').mockRejectedValue(
      new Error('Unable to inspect headful page frames'),
    );

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
        manualTimeoutMs: 500,
      },
    );

    expect(result).toEqual({
      success: false,
      html: null,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: false,
          reason: PageFetchFailureReason.ResolvedPageMarkerNotFound,
        },
        {
          method: PageFetchMethod.BrowserHeadful,
          success: false,
          reason: PageFetchFailureReason.ResolvedPageMarkerNotFound,
        },
      ],
    });

    expect(headlessPage.title).toHaveBeenCalled();
    expect(headlessPage.content).toHaveBeenCalled();
    expect(headlessPage.$).toHaveBeenCalled();

    expect(headfulPage.title).toHaveBeenCalled();
    expect(headfulPage.content).toHaveBeenCalled();
    expect(headfulPage.$).toHaveBeenCalled();

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('propagates navigator identity persistence errors and closes both browser contexts', async () => {
    const challengeState: Partial<MockPageState> = {
      title: 'Just a moment...',
      html: `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="challenge-stage">Checking your browser</div>
        </body>
      </html>
    `,
    };

    const { page: headlessPage } = createMockPage(challengeState);
    const { context: headlessContext } = createMockContext(headlessPage);

    const { page: headfulPage } = createMockPage();
    const { context: headfulContext } = createMockContext(headfulPage);

    const persistenceError = new Error(
      'Unable to save accepted navigator context',
    );

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    mocks.saveAcceptedBrowserNavigatorContext.mockRejectedValueOnce(
      persistenceError,
    );

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      ),
    ).rejects.toBe(persistenceError);

    expect(mocks.resolveBrowserNavigatorContext).toHaveBeenNthCalledWith(
      1,
      NAVIGATOR_CONTEXT,
      userAgentCacheFile,
      true,
    );

    expect(mocks.resolveBrowserNavigatorContext).toHaveBeenNthCalledWith(
      2,
      NAVIGATOR_CONTEXT,
      userAgentCacheFile,
      false,
    );

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).toHaveBeenCalledWith(NAVIGATOR_CONTEXT, userAgentCacheFile);

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('propagates navigator identity resolution errors and closes the headless browser context', async () => {
    const identityError = new Error(
      'Unable to resolve browser navigator context',
    );

    const { page } = createMockPage();
    const { context } = createMockContext(page);

    mocks.launchPersistentContext.mockResolvedValueOnce(context);
    mocks.resolveBrowserNavigatorContext.mockRejectedValueOnce(identityError);

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      ),
    ).rejects.toBe(identityError);

    expect(mocks.resolveBrowserNavigatorContext).toHaveBeenCalledWith(
      NAVIGATOR_CONTEXT,
      userAgentCacheFile,
      true,
    );

    expect(page.goto).not.toHaveBeenCalled();

    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });
});
