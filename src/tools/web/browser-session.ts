import * as fs from 'node:fs';
import * as path from 'node:path';

import { chromium } from 'playwright';

import { looksLikeChallengeHtml } from './challenge-detection.js';
import { buildPlaywrightContextOptions, getClientProfile } from './request-identity.js';
import { ignoreError } from '../utils/error.js';

import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from 'playwright';

import type {
  BrowserFetchOptions,
  PageChallengeState,
  RawPageFetchResult,
} from './browser-session.types.js';

/** Returns the persistent Playwright profile directory, creating it when needed. */
function getUserDataDir(cacheDir?: string): string {
  const dir = cacheDir ?? path.join(process.cwd(), '.cache', 'playwright-profile');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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
 */
async function installStealthInitScript(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
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
  });
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
 * Loads a page through a persistent browser context configured with the given
 * options and returns the current page state after initial settling.
 *
 * @param url - Target page URL.
 * @param contextOptions - Playwright browser context options.
 * @param options - Persistent browser loading options.
 * @returns The current page state read from the persistent context.
 */
async function readPageViaPersistentContext(
  url: URL,
  contextOptions: BrowserContextOptions,
  options: BrowserFetchOptions = {},
): Promise<PageChallengeState> {
  const userDataDir = getUserDataDir(options.cacheDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    ...contextOptions,
    headless: options.headless ?? true,
  });

  await installStealthInitScript(context);

  try {
    const page = context.pages()[0] ?? await context.newPage();

    await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await waitUntilPageSettles(page);

    return await safeGetPageState(page);
  } finally {
    await context.close();
  }
}

/**
 * Resolves a page through a persistent browser context and returns its final HTML.
 *
 * The function first attempts to load the target page in headless mode using
 * the existing persistent browser state. If the resolved target page is not
 * available, it retries in headful mode so any manual verification can be
 * completed in the same persistent profile, then waits for the resolved target
 * page and returns its HTML.
 *
 * @param url - Target page URL.
 * @param options - Persistent browser loading options.
 * @returns The resolved target page HTML.
 * @throws {Error} When the resolved target page could not be obtained within
 * the manual verification timeout.
 */
export async function fetchPageWithPersistentProfile(
  url: URL,
  options: BrowserFetchOptions = {},
): Promise<RawPageFetchResult> {
  const profile = await getClientProfile();
  const contextOptions = buildPlaywrightContextOptions(profile);

  const firstTry = await readPageViaPersistentContext(url, contextOptions, {
    ...options,
    headless: true,
  });

  if (isResolvedPageState(firstTry)) {
    return {
      success: true,
      method: 'browser-headless',
      html: firstTry.html,
    };
  }

  const userDataDir = getUserDataDir(options.cacheDir);
  const manualTimeoutMs = options.manualTimeoutMs ?? 180_000;

  const context = await chromium.launchPersistentContext(userDataDir, {
    ...contextOptions,
    headless: false,
  });

  await installStealthInitScript(context);

  try {
    const page = context.pages()[0] ?? await context.newPage();

    await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const finalState = await waitUntilResolvedPage(page, manualTimeoutMs);

    if (!isResolvedPageState(finalState)) {
      throw new Error(`Failed to resolve target page after manual verification for "${url.toString()}"`);
    }

    return {
      success: true,
      method: 'browser-headful',
      html: finalState.html,
    };
  } finally {
    await context.close();
  }
}
