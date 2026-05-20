import * as fs from 'node:fs';

import { chromium } from 'playwright';

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
  const looksLikeChallenge = looksLikeChallengeHtml(`${title}\n${html}`);

  return {
    url,
    title,
    html,
    hasRecaptchaFrame,
    looksLikeChallenge,
  };
}

/**
 * Returns whether the current page state already represents the resolved
 * target page HTML expected by the caller.
 *
 * @param state - Page state snapshot to evaluate.
 * @returns `true` when the target page is considered resolved.
 */
function isResolvedPageState(state: PageChallengeState): boolean {
  return state.html.includes('__NEXT_DATA__');
}

/**
 * Waits for the page to finish its main navigation and a short post-load
 * settling period before the next state inspection.
 *
 * @param page - Playwright page to wait on.
 */
async function waitUntilPageSettles(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(ignoreError);
  await page.waitForLoadState('load').catch(ignoreError);
  await page.waitForURL('**', { timeout: 10_000 }).catch(ignoreError);
  await page.waitForTimeout(1000);
}

/**
 * Polls the page until the resolved target page is available or the timeout
 * is reached.
 *
 * The function returns the first resolved page state. If the timeout expires
 * first, it returns the most recent page state so the caller can decide
 * whether to treat it as a failure.
 *
 * @param page - Playwright page to observe.
 * @param timeoutMs - Maximum time to wait for the resolved target page.
 * @returns The resolved page state or the last observed page state on timeout.
 */
async function waitUntilResolvedPage(
  page: Page,
  timeoutMs: number,
): Promise<PageChallengeState> {
  const startedAt = Date.now();

  while (true) {
    await waitUntilPageSettles(page);
    const state = await safeGetPageState(page);

    if (isResolvedPageState(state)) {
      return state;
    }

    if (Date.now() - startedAt > timeoutMs) {
      return state;
    }

    await page.waitForTimeout(1000);
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
