import * as jsdom from 'jsdom';
import { looksLikeChallengeHtml } from './challenge-detection';
import { fetchPageWithPersistentProfile } from './browser-session';
import { getClientProfile, buildFetchHeaders } from './request-identity';

/**
 * Fetches an HTML page and returns it as a parsed DOM document.
 *
 * The function first tries to download the page with a regular HTTP fetch using
 * request headers built from the client profile. If the response looks like a
 * challenge page, it falls back to a persistent Playwright browser session.
 *
 * @remarks
 * The Playwright fallback may retry the page in headless and headful modes
 * while reusing the same persistent profile state until the final page content
 * can be retrieved.
 *
 * @param url - The absolute page URL to download and parse.
 * @returns A parsed DOM document created from the final HTML response.
 * @throws {Error} When the initial HTTP request returns a non-success status code.
 */
export async function fetchWebPage(url: URL): Promise<Document> {
  const profile = await getClientProfile();
  const headers = buildFetchHeaders(profile);

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
