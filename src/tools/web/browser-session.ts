import * as fs from 'node:fs';
import * as path from 'node:path';

import { chromium } from 'playwright';

import { looksLikeChallengeHtml } from './challenge-detection.js';
import { buildPlaywrightContextOptions, getClientProfile } from './request-identity.js';

import type { Page, BrowserContextOptions } from 'playwright';

import type { BrowserFetchOptions, PageChallengeState } from './browser-session.types.js';

/** Returns the persistent Playwright profile directory, creating it if needed. */
function getUserDataDir(cacheDir?: string): string {
  const dir = cacheDir ?? path.join(process.cwd(), '.cache', 'playwright-profile');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Reads the current page state needed to detect challenge responses safely. */
async function safeGetPageState(page: Page): Promise<PageChallengeState> {
  const title = await page.title().catch(() => '');
  const html = await page.content().catch(() => '');
  const hasRecaptchaFrame =
    (await page.$('iframe[title*="reCAPTCHA"]').catch(() => null)) !== null;

  const challenge =
    hasRecaptchaFrame || looksLikeChallengeHtml(`${title}\n${html}`);

  return {
    title,
    html,
    hasRecaptchaFrame,
    challenge,
  };
}

/** Waits for the page to finish its main navigation and post-load updates. */
async function waitUntilPageSettles(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForURL('**', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

/** Polls the page until challenge markers disappear or the timeout is reached. */
async function waitUntilChallengeIsGone(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();

  while (true) {
    try {
      await waitUntilPageSettles(page);
      const state = await safeGetPageState(page);

      if (!state.challenge) {
        await waitUntilPageSettles(page);
        return;
      }
    } catch {
      // A navigation may have occurred and destroyed the previous execution context.
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Challenge was not solved within manual timeout.');
    }

    await page.waitForTimeout(1000);
  }
}

/** Loads a page through a persistent browser context configured with the given
 * options and returns its current state. */
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
 * The function first tries to load the page in headless mode using the existing
 * persistent browser state. If the page still looks like a challenge response,
 * it retries in headful mode so the verification can be completed manually, then
 * loads the page once more in headless mode using the same persistent state.
 *
 * @param url - The target page URL.
 * @param options - Persistent browser loading options.
 * @returns The final resolved HTML content.
 * @throws {Error} When the challenge is still present after manual verification.
 */
export async function fetchPageWithPersistentProfile(
  url: URL,
  options: BrowserFetchOptions = {},
): Promise<string> {
  const profile = await getClientProfile();
  const contextOptions = buildPlaywrightContextOptions(profile);

  const firstTry = await readPageViaPersistentContext(url, contextOptions, {
    ...options,
    headless: true,
  });

  if (!firstTry.challenge) {
    return firstTry.html;
  }

  const userDataDir = getUserDataDir(options.cacheDir);
  const manualTimeoutMs = options.manualTimeoutMs ?? 180_000;

  const context = await chromium.launchPersistentContext(userDataDir, {
    ...contextOptions,
    headless: false,
  });

  try {
    const page = context.pages()[0] ?? await context.newPage();

    await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await waitUntilChallengeIsGone(page, manualTimeoutMs);
  } finally {
    await context.close();
  }

  const secondTry = await readPageViaPersistentContext(url, contextOptions, {
    ...options,
    headless: true,
  });

  if (secondTry.challenge) {
    throw new Error(`Challenge still present after manual verification for "${url.toString()}"`);
  }

  return secondTry.html;
}
