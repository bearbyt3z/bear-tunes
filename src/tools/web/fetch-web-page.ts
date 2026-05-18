import { JSDOM } from 'jsdom';

import { fetchPageWithPersistentProfile } from './browser-session.js';
import {
  PageFetchFailureReason,
  PageFetchMethod,
} from './browser-session.types.js';
import { looksLikeChallengeResponse } from './challenge-detection.js';
import {
  getFetchClientProfile,
  buildFetchHeaders,
} from './request-identity.js';

import type {
  HttpFailureReason,
  PageFetchAttempt,
  ParsedPageFetchResult,
} from './browser-session.types.js';

import type {
  FetchWebPageOptions,
} from './fetch-web-page.types.js';

function getHttpFailureReason(status: number): HttpFailureReason {
  return `http-${status}`;
}

/**
 * Fetches an HTML page and returns a parsed page fetch result.
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
 * @returns The parsed page fetch result, including the parsed document when
 * available and the full attempt history.
 */
export async function fetchWebPage(
  url: URL,
  options: FetchWebPageOptions,
): Promise<ParsedPageFetchResult> {
  const profile = await getFetchClientProfile(options.userAgentCacheFile);
  const headers = buildFetchHeaders(profile);

  const response = await fetch(url.toString(), {
    headers,
    redirect: 'follow',
  });

  const html = await response.text();

  if (looksLikeChallengeResponse(response, html)) {
    const fetchAttempt: PageFetchAttempt = {
      method: PageFetchMethod.Fetch,
      success: false,
      status: response.status,
      reason: PageFetchFailureReason.ChallengeResponse,
    };

    const result = await fetchPageWithPersistentProfile(url, {
      browserProfileDir: options.browserProfileDir,
      userAgentCacheFile: options.userAgentCacheFile,
    });

    return {
      success: result.success,
      document: result.html === null
        ? null
        : new JSDOM(result.html, { url: url.toString() }).window.document,
      attempts: [fetchAttempt, ...result.attempts],
    };
  }

  if (!response.ok) {
    return {
      success: false,
      document: null,
      attempts: [
        {
          method: PageFetchMethod.Fetch,
          success: false,
          status: response.status,
          reason: getHttpFailureReason(response.status),
        },
      ],
    };
  }

  return {
    success: true,
    document: new JSDOM(html, { url: url.toString() }).window.document,
    attempts: [
      {
        method: PageFetchMethod.Fetch,
        success: true,
        status: response.status,
      },
    ],
  };
}
