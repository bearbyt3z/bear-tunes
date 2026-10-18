import * as fs from 'node:fs';

import { chromium, errors } from 'playwright';

import {
  PageFetchFailureReason,
  PageFetchMethod,
} from './browser-session.types.js';
import { looksLikeChallengeHtml } from './challenge-detection.js';
import {
  getBrowserContextOptions,
  resolveBrowserNavigatorContext,
  saveAcceptedBrowserNavigatorContext,
} from './request-identity.js';
import { ignoreError } from '../utils/error.js';

import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from 'playwright';

import type {
  BrowserFetchOptions,
  PageChallengeState,
  PageFetchAttempt,
  PageFetchAttemptFailureReason,
  RawPageFetchResult,
} from './browser-session.types.js';
import type {
  BrowserNavigatorContext,
} from './request-identity.types.js';

/**
 * Returns the persistent Playwright user data directory used by browser-based
 * page fetch operations.
 *
 * The directory is created before use so persistent browser state can be
 * reused across runs.
 *
 * @param browserProfileDir - Path to the persistent Playwright profile directory.
 * @returns The ensured persistent profile directory path.
 */
function getUserDataDir(browserProfileDir: string): string {
  fs.mkdirSync(browserProfileDir, { recursive: true });
  return browserProfileDir;
}

/**
 * Installs a Playwright init script that masks common WebDriver markers
 * before any page scripts run in the given browser context.
 *
 * The injected script overrides `navigator.webdriver` on both
 * `Navigator.prototype` and the current `navigator` instance so pages are
 * less likely to detect the automated browser environment.
 *
 * @param context - Playwright browser context to patch before navigation.
 * @param navigatorContext - Navigator property values replayed into the page.
 */
async function installStealthInitScript(
  context: BrowserContext,
  navigatorContext: BrowserNavigatorContext,
): Promise<void> {
  await context.addInitScript((overrides: BrowserNavigatorContext) => {
    const defineNavigatorValue = <K extends keyof BrowserNavigatorContext>(
      property: K,
      value: BrowserNavigatorContext[K],
    ): void => {
      try {
        Object.defineProperty(Navigator.prototype, property, {
          get: () => value,
          configurable: true,
        });
      } catch (error: unknown) {
        void error;
      }

      try {
        Object.defineProperty(navigator, property, {
          get: () => value,
          configurable: true,
        });
      } catch (error: unknown) {
        void error;
      }
    };

    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
    } catch (error: unknown) {
      void error;
    }

    try {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
    } catch (error: unknown) {
      void error;
    }

    // Keep the replayed navigator fingerprint intentionally minimal.
    // Replaying navigator.languages caused a Cloudflare captcha loop,
    // so do not add it back unless this behavior is re-tested.
    defineNavigatorValue('userAgent', overrides.userAgent);
    defineNavigatorValue('platform', overrides.platform);
    defineNavigatorValue('language', overrides.language);
    defineNavigatorValue('vendor', overrides.vendor);
  }, navigatorContext);
}

/**
 * Reads the current page state without throwing on common page access failures.
 *
 * The returned snapshot includes the current URL, title, HTML, and lightweight
 * challenge indicators that can be evaluated by higher-level helpers.
 *
 * @param page - Playwright page to inspect.
 * @returns The current page state snapshot.
 */
async function safeGetPageState(page: Page): Promise<PageChallengeState> {
  const url = page.url();
  const title = await page.title().catch(() => '');
  const html = await page.content().catch(() => '');
  const hasRecaptchaFrame =
    (await page.$('iframe[title*="reCAPTCHA"]').catch(() => null)) !== null;
  const looksLikeChallenge =
    looksLikeChallengeHtml(title) || looksLikeChallengeHtml(html);

  return {
    url,
    title,
    html,
    hasRecaptchaFrame,
    looksLikeChallenge,
  };
}

/**
 * Returns whether the current page state looks like a resolved, usable HTML document.
 *
 * A page state is considered resolved when it contains basic document structure
 * and does not appear to be an active challenge or CAPTCHA page.
 *
 * @param state - Page state snapshot to evaluate.
 * @returns `true` when the page contains a usable HTML document without active challenge indicators.
 */
function isResolvedPageState(state: PageChallengeState): boolean {
  const normalizedHtml = state.html.toLowerCase();

  const hasUsableDocument =
    state.url.trim().length > 0 &&
    state.title.trim().length > 0 &&
    normalizedHtml.includes('<html') &&
    normalizedHtml.includes('<body');

  return hasUsableDocument
    && !state.hasRecaptchaFrame
    && !state.looksLikeChallenge;
}

/**
 * Waits for the current document's load states, then allows a short
 * settling period before inspecting the page state.
 *
 * @param page - Playwright page to wait on.
 */
async function waitUntilPageSettles(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(ignoreError);
  await page.waitForLoadState('load').catch(ignoreError);
  await page.waitForTimeout(1000);
}

/**
 * Waits for a Playwright load state using the remaining time before a deadline.
 *
 * Each wait is capped at one second. A Playwright timeout is treated as an
 * unsuccessful wait, while other errors are propagated.
 *
 * @param page - Playwright page to wait on.
 * @param state - Page load state to wait for.
 * @param deadline - Absolute deadline in milliseconds, based on `Date.now()`.
 * @returns Whether the requested load state was reached without a timeout.
 */
async function waitForLoadStateWithinDeadline(
  page: Page,
  state: 'domcontentloaded' | 'load',
  deadline: number,
): Promise<boolean> {
  const remainingMs = deadline - Date.now();

  if (remainingMs <= 0) {
    return false;
  }

  try {
    await page.waitForLoadState(state, {
      timeout: Math.min(1000, remainingMs),
    });

    return true;
  } catch (error: unknown) {
    if (error instanceof errors.TimeoutError) {
      return false;
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      'Unexpected non-Error value while waiting for page load state.',
      { cause: error },
    );
  }
}

/**
 * Waits for the document's loading states and a short settling period
 * without scheduling waits beyond the supplied deadline.
 *
 * Each load-state wait is capped at one second, and the settling period is
 * limited by the remaining time. Returns early if a load state cannot be
 * reached within the available time.
 *
 * @param page - Playwright page to wait on.
 * @param deadline - Absolute deadline in milliseconds, based on `Date.now()`.
 */
async function waitUntilPageSettlesWithinDeadline(
  page: Page,
  deadline: number,
): Promise<void> {
  const domContentLoaded = await waitForLoadStateWithinDeadline(
    page,
    'domcontentloaded',
    deadline,
  );

  if (!domContentLoaded) {
    return;
  }

  const loaded = await waitForLoadStateWithinDeadline(
    page,
    'load',
    deadline,
  );

  if (!loaded) {
    return;
  }

  const remainingMs = deadline - Date.now();

  if (remainingMs <= 0) {
    return;
  }

  await page.waitForTimeout(Math.min(1000, remainingMs));
}

/**
 * Polls the page until a resolved target page is detected or the timeout
 * is reached.
 *
 * The function waits for page load states and a short settling period
 * between state inspections. Individual waits are bounded by the remaining
 * timeout, but page-state inspection may extend the total elapsed time.
 *
 * If the timeout is reached before the target page is resolved, the function
 * returns the last inspected page state so the caller can determine failure.
 *
 * @param page - Playwright page to observe.
 * @param timeoutMs - Maximum requested wait duration in milliseconds.
 * @returns The resolved page state or the last inspected state on timeout.
 */
async function waitUntilResolvedPage(
  page: Page,
  timeoutMs: number,
): Promise<PageChallengeState> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let state = await safeGetPageState(page);

  while (true) {
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      return state;
    }

    await waitUntilPageSettlesWithinDeadline(page, deadline);

    state = await safeGetPageState(page);

    if (isResolvedPageState(state)) {
      return state;
    }

    if (Date.now() >= deadline) {
      return state;
    }
  }
}

/**
 * Reads the navigator values exposed by the live browser page.
 *
 * The returned snapshot represents the runtime browser identity observed after
 * the page has been created and can be persisted as an accepted browser
 * navigator context.
 *
 * @param page - Playwright page whose navigator properties are read.
 * @returns Navigator values exposed by the live browser page.
 */
async function readRuntimeBrowserNavigatorContext(
  page: Page,
): Promise<BrowserNavigatorContext> {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    vendor: navigator.vendor,
  }));
}

/**
 * Applies navigator-related browser identity overrides before page navigation.
 *
 * The override starts from the runtime browser navigator values and resolves
 * them through the request identity policy so browser-based fetches reuse an
 * accepted navigator context more consistently.
 *
 * @param context - Browser context owning the page.
 * @param page - Page that will perform the navigation.
 * @param userAgentCacheFile - Path to the persisted navigator identity cache file.
 * @param preferCached - Whether a cached accepted navigator context should be preferred.
 * @returns The navigator context applied to the browser page.
 */
async function applyBrowserNavigatorOverrides(
  context: BrowserContext,
  page: Page,
  userAgentCacheFile: string,
  preferCached: boolean,
): Promise<BrowserNavigatorContext> {
  const runtimeNavigator = await readRuntimeBrowserNavigatorContext(page);

  const navigatorContext = await resolveBrowserNavigatorContext(
    runtimeNavigator,
    userAgentCacheFile,
    preferCached,
  );

  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send('Network.setUserAgentOverride', {
    userAgent: navigatorContext.userAgent,
  });

  return navigatorContext;
}

/**
 * Opens a persistent Playwright browser context, navigates to the target page,
 * and returns the page state produced by the supplied final-state reader.
 *
 * The helper centralizes persistent profile startup, navigator override
 * application, stealth script installation, and initial navigation.
 *
 * @param url - Target page URL.
 * @param contextOptions - Browser context options used to launch the persistent context.
 * @param options - Browser fetch configuration controlling profile reuse and browser mode.
 * @param readFinalState - Callback that reads the final page state after navigation.
 * @returns The page state returned by the final-state reader.
 */
async function readPageStateViaPersistentContext(
  url: URL,
  contextOptions: BrowserContextOptions,
  options: BrowserFetchOptions,
  readFinalState: (page: Page) => Promise<PageChallengeState> = async (
    page,
  ): Promise<PageChallengeState> => {
    await waitUntilPageSettles(page);
    return safeGetPageState(page);
  },
): Promise<PageChallengeState> {
  const userDataDir = getUserDataDir(options.browserProfileDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    ...contextOptions,
    headless: options.headless ?? true,
  });

  try {
    const page = context.pages()[0] ?? await context.newPage();

    const navigatorContext = await applyBrowserNavigatorOverrides(
      context,
      page,
      options.userAgentCacheFile,
      true,
    );

    await installStealthInitScript(context, navigatorContext);

    await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    return await readFinalState(page);
  } finally {
    await context.close();
  }
}

/**
 * Maps an observed page state to the browser failure reason recorded for the
 * attempt.
 *
 * @param state - Page state snapshot to classify.
 * @returns The browser failure reason derived from the observed page state.
 */
function getBrowserFailureReason(state: PageChallengeState): PageFetchAttemptFailureReason {
  if (state.hasRecaptchaFrame) {
    return PageFetchFailureReason.Captcha;
  }

  if (state.looksLikeChallenge) {
    return PageFetchFailureReason.ChallengeResponse;
  }

  return PageFetchFailureReason.ResolvedPageMarkerNotFound;
}

/**
 * Resolves a page through a persistent Playwright browser profile.
 *
 * The operation first attempts to load the page in a headless persistent
 * browser context. If that attempt does not produce a resolved page, the same
 * persistent profile is retried in a visible browser session and allowed to
 * continue until the page resolves or the manual timeout expires.
 *
 * The returned result contains the final HTML on success and a complete
 * attempt history describing both browser phases.
 *
 * @param url - Target page URL.
 * @param options - Browser fetch configuration controlling profile reuse and manual timeout.
 * @returns The resolved page result together with the ordered browser attempt history.
 */
export async function fetchPageWithPersistentProfile(
  url: URL,
  options: BrowserFetchOptions,
): Promise<RawPageFetchResult> {
  const contextOptions = getBrowserContextOptions();

  const firstTry = await readPageStateViaPersistentContext(
    url,
    contextOptions,
    {
      ...options,
      headless: true,
    },
  );

  if (isResolvedPageState(firstTry)) {
    return {
      success: true,
      html: firstTry.html,
      attempts: [
        {
          method: PageFetchMethod.BrowserHeadless,
          success: true,
        },
      ],
    };
  }

  const headlessAttempt: PageFetchAttempt = {
    method: PageFetchMethod.BrowserHeadless,
    success: false,
    reason: getBrowserFailureReason(firstTry),
  };

  const manualTimeoutMs = options.manualTimeoutMs ?? 180_000;
  const userDataDir = getUserDataDir(options.browserProfileDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    ...contextOptions,
    headless: false,
  });

  try {
    const page = context.pages()[0] ?? await context.newPage();

    const navigatorContext = await applyBrowserNavigatorOverrides(
      context,
      page,
      options.userAgentCacheFile,
      false,
    );

    await installStealthInitScript(context, navigatorContext);

    await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const finalState = await waitUntilResolvedPage(page, manualTimeoutMs);

    if (!isResolvedPageState(finalState)) {
      const headfulAttempt: PageFetchAttempt = {
        method: PageFetchMethod.BrowserHeadful,
        success: false,
        reason: getBrowserFailureReason(finalState),
      };

      return {
        success: false,
        html: null,
        attempts: [headlessAttempt, headfulAttempt],
      };
    }

    const acceptedNavigator = await readRuntimeBrowserNavigatorContext(page);
    await saveAcceptedBrowserNavigatorContext(
      acceptedNavigator,
      options.userAgentCacheFile,
    );

    const headfulAttempt: PageFetchAttempt = {
      method: PageFetchMethod.BrowserHeadful,
      success: true,
    };

    return {
      success: true,
      html: finalState.html,
      attempts: [headlessAttempt, headfulAttempt],
    };
  } finally {
    await context.close();
  }
}
