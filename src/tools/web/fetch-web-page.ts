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

/**
 * Converts an HTTP status code to the machine-readable failure reason format
 * used by page fetch attempt records.
 *
 * @param status - HTTP status code returned by the request.
 * @returns HTTP failure reason derived from the status code.
 */
function getHttpFailureReason(status: number): HttpFailureReason {
  return `http-${status}`;
}

/**
 * Resolves a web page and returns the parsed page fetch result.
 *
 * The operation first performs a regular HTTP fetch using headers built from
 * the canonical fetch client profile. When the response is classified as a
 * challenge page, the operation falls back to a persistent Playwright browser
 * session and returns the combined attempt history.
 *
 * @param url - Absolute page URL to resolve and parse.
 * @param options - File system locations required by the page fetch pipeline.
 * @returns Parsed page fetch result, including the resolved document when
 * available and the ordered attempt history.
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
