import * as jsdom from 'jsdom';
import { looksLikeChallengeHtml } from './challenge-detection';
import { fetchPageWithPersistentProfile } from './browser-session';
import { buildSafeHeaders } from './request-identity';

/**
 * Fetches an HTML page and returns it as a parsed DOM document.
 *
 * The function first tries to download the page with a regular HTTP fetch using
 * browser-like request headers. If the response looks like a challenge page,
 * it falls back to a persistent Playwright browser profile to resolve the page
 * through a browser session instead of plain HTTP.
 *
 * @remarks
 * The Playwright fallback uses a multi-step flow. It first retries the page in
 * headless mode with a persistent profile directory. If the challenge is still
 * present, it opens a headful browser window so the verification can be completed
 * manually, then retries the page again in headless mode using the same profile
 * state and cookies.
 *
 * @param url - The absolute page URL to download and parse.
 * @returns A parsed DOM document created from the final HTML response.
 * @throws {Error} When the initial HTTP request returns a non-success status code.
 */
export async function fetchWebPage(url: URL): Promise<Document> {
  const headers = await buildSafeHeaders();

  const response = await fetch(url.toString(), {
    headers,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for "${url.toString()}"`);
  }

  const html = await response.text();

  if (!looksLikeChallengeHtml(html)) {
    return new jsdom.JSDOM(html, { url: url.toString() }).window.document;
  }

  const resolvedHtml = await fetchPageWithPersistentProfile(url, {
    cacheDir: '.cache/playwright-profile',
  });

  return new jsdom.JSDOM(resolvedHtml, { url: url.toString() }).window.document;
}
