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

  vi.unstubAllGlobals();
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
  onAddInitScript?: (
    script: (overrides: BrowserNavigatorContext) => void,
    navigatorContext: BrowserNavigatorContext,
  ) => void,
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
      onAddInitScript?.(script, navigatorContext);

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

  it('returns the resolved headless page when load-state waits fail', async () => {
    const { page } = createMockPage(
      {},
      undefined,
      undefined,
      (loadState) => Promise.reject(
        new Error(`Unable to wait for ${loadState}`),
      ),
    );

    const { context } = createMockContext(page);

    mocks.launchPersistentContext.mockResolvedValueOnce(context);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
      },
    );

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

    expect(page.waitForLoadState).toHaveBeenNthCalledWith(
      1,
      'domcontentloaded',
    );
    expect(page.waitForLoadState).toHaveBeenNthCalledWith(
      2,
      'load',
      { timeout: 10_000 },
    );

    expect(page.waitForTimeout).toHaveBeenCalledWith(1000);
    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(1);
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

  it.each([
    {
      description: 'a non-HTML response',
      html: 'The upstream response did not contain an HTML document.',
    },
    {
      description: 'an HTML document without a body',
      html: '<html><head><title>Example Page</title></head></html>',
    },
  ])(
    'reports a missing resolved-page marker for $description',
    async ({ html }) => {
      const unexpectedPage: Partial<MockPageState> = {
        title: 'Example Page',
        html,
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
    },
  );

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

  it('treats page URL read errors as an unresolved page', async () => {
    const { page: headlessPage } = createMockPage();
    const { context: headlessContext } = createMockContext(headlessPage);

    const { page: headfulPage } = createMockPage();
    const { context: headfulContext } = createMockContext(headfulPage);

    vi.spyOn(headlessPage, 'url').mockImplementation(() => {
      throw new Error('Unable to read headless page URL');
    });

    vi.spyOn(headfulPage, 'url').mockImplementation(() => {
      throw new Error('Unable to read headful page URL');
    });

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
        manualTimeoutMs: 0,
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

    expect(headlessPage.url).toHaveBeenCalledTimes(1);
    expect(headfulPage.url).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
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

  it('propagates accepted navigator identity read errors and closes both browser contexts', async () => {
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

    const identityError = new Error(
      'Unable to read accepted browser navigator context',
    );

    vi.spyOn(headfulPage, 'evaluate')
      .mockResolvedValueOnce(NAVIGATOR_CONTEXT)
      .mockRejectedValueOnce(identityError);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      ),
    ).rejects.toBe(identityError);

    expect(headlessPage.evaluate).toHaveBeenCalledTimes(1);
    expect(headfulPage.evaluate).toHaveBeenCalledTimes(2);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('propagates browser User-Agent override errors and closes the browser context', async () => {
    const { page } = createMockPage();
    const { context, cdpSession } = createMockContext(page);

    const userAgentOverrideError = new Error(
      'Unable to apply browser User-Agent override',
    );

    vi.spyOn(cdpSession, 'send').mockRejectedValueOnce(
      userAgentOverrideError,
    );

    mocks.launchPersistentContext.mockResolvedValueOnce(context);

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      ),
    ).rejects.toBe(userAgentOverrideError);

    expect(cdpSession.send).toHaveBeenCalledWith(
      'Network.setUserAgentOverride',
      { userAgent: NAVIGATOR_CONTEXT.userAgent },
    );

    expect(context.addInitScript).not.toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();

    expect(context.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('propagates stealth init script installation errors and closes the browser context', async () => {
    const { page } = createMockPage();
    const { context, cdpSession } = createMockContext(page);

    const initScriptError = new Error(
      'Unable to install browser stealth init script',
    );

    vi.spyOn(context, 'addInitScript').mockRejectedValueOnce(
      initScriptError,
    );

    mocks.launchPersistentContext.mockResolvedValueOnce(context);

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      ),
    ).rejects.toBe(initScriptError);

    expect(cdpSession.send).toHaveBeenCalledWith(
      'Network.setUserAgentOverride',
      { userAgent: NAVIGATOR_CONTEXT.userAgent },
    );

    expect(context.addInitScript).toHaveBeenCalledWith(
      expect.any(Function),
      NAVIGATOR_CONTEXT,
    );

    expect(page.goto).not.toHaveBeenCalled();

    expect(context.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
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

  it('propagates browser context configuration errors before launching a browser', async () => {
    const configurationError = new Error(
      'Unable to get browser context options',
    );

    mocks.getBrowserContextOptions.mockImplementationOnce(() => {
      throw configurationError;
    });

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      ),
    ).rejects.toBe(configurationError);

    expect(mocks.getBrowserContextOptions).toHaveBeenCalledTimes(1);
    expect(mocks.launchPersistentContext).not.toHaveBeenCalled();
    expect(mocks.resolveBrowserNavigatorContext).not.toHaveBeenCalled();
    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('propagates headless browser launch errors', async () => {
    const launchError = new Error('Unable to launch headless browser');

    mocks.launchPersistentContext.mockRejectedValueOnce(launchError);

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      ),
    ).rejects.toBe(launchError);

    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(1);

    expect(mocks.launchPersistentContext).toHaveBeenCalledWith(
      browserProfileDir,
      expect.objectContaining({ headless: true }),
    );

    expect(mocks.resolveBrowserNavigatorContext).not.toHaveBeenCalled();
    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('propagates headful browser launch errors after closing the headless context', async () => {
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

    const launchError = new Error('Unable to launch headful browser');

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockRejectedValueOnce(launchError);

    await expect(
      fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      ),
    ).rejects.toBe(launchError);

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

    expect(headlessPage.goto).toHaveBeenCalledTimes(1);
    expect(headlessContext.close).toHaveBeenCalledTimes(1);

    expect(mocks.resolveBrowserNavigatorContext).toHaveBeenCalledTimes(1);
    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('stops before waiting for a load state when the deadline expires', async () => {
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

    const manualTimeoutMs = 500;
    let restoreDateNow: (() => void) | undefined;

    const {
      page: headfulPage,
    } = createMockPage(
      challengeState,
      undefined,
      () => {
        const startTime = Date.now();
        let dateNowCalls = 0;

        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
          dateNowCalls += 1;

          return dateNowCalls <= 2
            ? startTime
            : startTime + manualTimeoutMs;
        });

        restoreDateNow = (): void => dateNowSpy.mockRestore();

        return Promise.resolve(null);
      },
    );

    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    try {
      const result = await fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
          manualTimeoutMs,
        },
      );

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

      expect(headfulPage.waitForLoadState).not.toHaveBeenCalled();
      expect(headfulPage.waitForTimeout).not.toHaveBeenCalled();

      expect(headlessContext.close).toHaveBeenCalledTimes(1);
      expect(headfulContext.close).toHaveBeenCalledTimes(1);

      expect(
        mocks.saveAcceptedBrowserNavigatorContext,
      ).not.toHaveBeenCalled();
    } finally {
      restoreDateNow?.();
    }
  });

  it('stops page settling when waiting for the load state times out', async () => {
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

    const manualTimeoutMs = 500;

    const { page: headfulPage } = createMockPage(
      challengeState,
      undefined,
      undefined,
      async (loadState, options) => {
        if (loadState !== 'load' || options?.timeout === undefined) {
          return;
        }

        await vi.advanceTimersByTimeAsync(options.timeout);

        throw new mocks.TimeoutError('Load state wait timed out');
      },
    );

    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
        manualTimeoutMs,
      },
    );

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

    expect(headfulPage.waitForLoadState).toHaveBeenNthCalledWith(
      1,
      'domcontentloaded',
      { timeout: manualTimeoutMs },
    );

    expect(headfulPage.waitForLoadState).toHaveBeenNthCalledWith(
      2,
      'load',
      { timeout: manualTimeoutMs },
    );

    expect(headfulPage.waitForTimeout).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('skips the settling delay when the load state completes at the deadline', async () => {
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

    const manualTimeoutMs = 500;

    const { page: headfulPage } = createMockPage(
      challengeState,
      undefined,
      undefined,
      async (loadState, options) => {
        if (loadState === 'load' && options?.timeout !== undefined) {
          await vi.advanceTimersByTimeAsync(options.timeout);
        }
      },
    );

    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
        manualTimeoutMs,
      },
    );

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

    expect(headfulPage.waitForLoadState).toHaveBeenCalledTimes(2);
    expect(headfulPage.waitForTimeout).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);
  });

  it('returns the last page state when the deadline expires during the initial inspection', async () => {
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

    const manualTimeoutMs = 500;

    const {
      page: headfulPage,
      state: headfulState,
    } = createMockPage(challengeState);

    vi.spyOn(headfulPage, 'title').mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(manualTimeoutMs);

      return headfulState.title;
    });

    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
        manualTimeoutMs,
      },
    );

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

    expect(headfulPage.waitForLoadState).not.toHaveBeenCalled();
    expect(headfulPage.waitForTimeout).not.toHaveBeenCalled();

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });

  it('installs navigator overrides and masks webdriver in the init script', async () => {
    class MockNavigator { }

    const navigatorInstance: Record<string, unknown> = {};

    vi.stubGlobal('Navigator', MockNavigator);
    vi.stubGlobal('navigator', navigatorInstance);

    const { page } = createMockPage();

    const { context } = createMockContext(
      page,
      [page],
      (script, navigatorContext): void => {
        script(navigatorContext);
      },
    );

    mocks.launchPersistentContext.mockResolvedValueOnce(context);

    const result = await fetchPageWithPersistentProfile(
      new URL('https://example.test/page'),
      {
        browserProfileDir,
        userAgentCacheFile,
      },
    );

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

    expect(context.addInitScript).toHaveBeenCalledWith(
      expect.any(Function),
      NAVIGATOR_CONTEXT,
    );

    const navigatorProperties: (keyof BrowserNavigatorContext)[] = [
      'userAgent',
      'platform',
      'language',
      'vendor',
    ];

    for (const property of navigatorProperties) {
      const instanceValue: unknown = Reflect.get(
        navigatorInstance,
        property,
      );

      const prototypeValue: unknown = Reflect.get(
        MockNavigator.prototype,
        property,
      );

      expect(instanceValue).toBe(NAVIGATOR_CONTEXT[property]);
      expect(prototypeValue).toBe(NAVIGATOR_CONTEXT[property]);

      expect(
        Object.getOwnPropertyDescriptor(navigatorInstance, property)
          ?.configurable,
      ).toBe(true);

      expect(
        Object.getOwnPropertyDescriptor(MockNavigator.prototype, property)
          ?.configurable,
      ).toBe(true);
    }

    const instanceWebdriver: unknown = Reflect.get(
      navigatorInstance,
      'webdriver',
    );

    const prototypeWebdriver: unknown = Reflect.get(
      MockNavigator.prototype,
      'webdriver',
    );

    expect(instanceWebdriver).toBeUndefined();
    expect(prototypeWebdriver).toBeUndefined();

    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('continues when navigator property overrides cannot be defined', async () => {
    class MockNavigator { }

    const navigatorInstance: Record<string, unknown> = {};

    vi.stubGlobal('Navigator', MockNavigator);
    vi.stubGlobal('navigator', navigatorInstance);

    const { page } = createMockPage();

    const { context } = createMockContext(
      page,
      [page],
      (script, navigatorContext): void => {
        script(navigatorContext);
      },
    );

    mocks.launchPersistentContext.mockResolvedValueOnce(context);

    const originalDefineProperty = Object.defineProperty;

    const definePropertySpy = vi.spyOn(
      Object,
      'defineProperty',
    ).mockImplementation(
      (
        target: unknown,
        propertyKey: PropertyKey,
        attributes: PropertyDescriptor,
      ): unknown => {
        if (
          target === MockNavigator.prototype ||
          target === navigatorInstance
        ) {
          throw new Error(
            `Unable to define navigator property ${String(propertyKey)}`,
          );
        }

        if (
          (typeof target !== 'object' || target === null) &&
          typeof target !== 'function'
        ) {
          throw new TypeError('Object.defineProperty target must be an object.');
        }

        return originalDefineProperty(target, propertyKey, attributes);
      },
    );

    try {
      const result = await fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
        },
      );

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

      const navigatorPropertyCalls = definePropertySpy.mock.calls.filter(
        ([target]) =>
          target === MockNavigator.prototype ||
          target === navigatorInstance,
      );

      expect(navigatorPropertyCalls).toHaveLength(10);
      expect(context.close).toHaveBeenCalledTimes(1);
    } finally {
      definePropertySpy.mockRestore();
    }
  });

  it('wraps non-Error load-state rejections and preserves the original cause', async () => {
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

    const loadStateRejection = 'Unexpected load-state rejection';

    const { page: headfulPage } = createMockPage(
      challengeState,
      undefined,
      undefined,
      (): Promise<void> => {
        // Simulate a dependency rejecting with a non-Error value:
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(loadStateRejection);
      },
    );

    const { context: headfulContext } = createMockContext(headfulPage);

    mocks.launchPersistentContext
      .mockResolvedValueOnce(headlessContext)
      .mockResolvedValueOnce(headfulContext);

    let caughtError: unknown;

    try {
      await fetchPageWithPersistentProfile(
        new URL('https://example.test/page'),
        {
          browserProfileDir,
          userAgentCacheFile,
          manualTimeoutMs: 5000,
        },
      );
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);

    if (!(caughtError instanceof Error)) {
      throw new Error('Expected a wrapped load-state error.');
    }

    expect(caughtError.message).toBe(
      'Unexpected non-Error value while waiting for page load state.',
    );
    expect(caughtError.cause).toBe(loadStateRejection);

    expect(headfulPage.waitForLoadState).toHaveBeenCalledWith(
      'domcontentloaded',
      { timeout: 1000 },
    );

    expect(headlessContext.close).toHaveBeenCalledTimes(1);
    expect(headfulContext.close).toHaveBeenCalledTimes(1);

    expect(
      mocks.saveAcceptedBrowserNavigatorContext,
    ).not.toHaveBeenCalled();
  });
});
