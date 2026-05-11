import { JSDOM } from 'jsdom';

import { fetchPageWithPersistentProfile } from './browser-session.js';
import { looksLikeChallengeResponse } from './challenge-detection.js';
import { getClientProfile, buildFetchHeaders } from './request-identity.js';

import type { ParsedPageFetchResult } from './browser-session.types.js';

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
 * @throws {Error} When the HTTP request returns a non-success status code
 * and the response does not look like a challenge page.
 */
export async function fetchWebPage(url: URL): Promise<ParsedPageFetchResult> {
  const profile = await getClientProfile();
  const headers = buildFetchHeaders(profile);

  const response = await fetch(url.toString(), {
    headers,
    redirect: 'follow',
  });

  const html = await response.text();

  if (looksLikeChallengeResponse(response, html)) {
    const result = await fetchPageWithPersistentProfile(url, {
      cacheDir: '.cache/playwright-profile',
    });

    return {
      success: result.success,
      method: result.method,
      document: result.html === null
        ? null
        : new JSDOM(result.html, { url: url.toString() }).window.document,
    };
  }

  if (!response.ok) {
    return {
      success: false,
      method: null,
      document: null,
    };
  }

  return {
    success: true,
    method: 'fetch',
    document: new JSDOM(html, { url: url.toString() }).window.document,
  };
}
