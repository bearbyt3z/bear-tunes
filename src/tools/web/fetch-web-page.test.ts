import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { fetchWebPage } from './fetch-web-page.js';
import {
  PageFetchFailureReason,
  PageFetchMethod,
} from './browser-session.types.js';

import type { FetchWebPageOptions } from './fetch-web-page.types.js';

const mocks = vi.hoisted(() => ({
  fetchPageWithPersistentProfile: vi.fn(),
  looksLikeChallengeResponse: vi.fn(),
  fetchResource: vi.fn(),
  getFetchClientProfile: vi.fn(),
  buildFetchHeaders: vi.fn(),
}));

vi.mock('./browser-session.js', () => ({
  fetchPageWithPersistentProfile: mocks.fetchPageWithPersistentProfile,
}));

vi.mock('./challenge-detection.js', () => ({
  looksLikeChallengeResponse: mocks.looksLikeChallengeResponse,
}));

vi.mock('./fetch-resource.js', () => ({
  fetchResource: mocks.fetchResource,
}));

vi.mock('./request-identity.js', () => ({
  getFetchClientProfile: mocks.getFetchClientProfile,
  buildFetchHeaders: mocks.buildFetchHeaders,
}));

const FETCH_CLIENT_PROFILE = {
  userAgent: 'Mozilla/5.0 Test Browser',
};

const FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 Test Browser',
  'accept': 'text/html',
};

const FETCH_OPTIONS: FetchWebPageOptions = {
  browserProfileDir: '/tmp/browser-profile',
  userAgentCacheFile: '/tmp/user-agent-cache.json',
};

const HTML = `<!doctype html>
<html>
  <head><title>Example Page</title></head>
  <body><main id="content">Loaded</main></body>
</html>`;

interface MockFetchResponse {
  ok: boolean;
  status: number;
  text: Mock<() => Promise<string>>;
};

function createMockResponse(
  html: string,
  options: {
    ok?: boolean;
    status?: number;
  } = {},
): MockFetchResponse {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    text: vi.fn<() => Promise<string>>().mockResolvedValue(html),
  };
}

describe('fetchWebPage', () => {
  beforeEach(() => {
    mocks.fetchPageWithPersistentProfile.mockReset();

    mocks.looksLikeChallengeResponse.mockReset();
    mocks.looksLikeChallengeResponse.mockReturnValue(false);

    mocks.fetchResource.mockReset();

    mocks.getFetchClientProfile.mockReset();
    mocks.getFetchClientProfile.mockResolvedValue(FETCH_CLIENT_PROFILE);

    mocks.buildFetchHeaders.mockReset();
    mocks.buildFetchHeaders.mockReturnValue(FETCH_HEADERS);
  });

  it('returns a parsed document when the HTTP response is successful', async () => {
    const url = new URL('https://example.test/page?source=test');
    const response = createMockResponse(HTML);

    mocks.fetchResource.mockResolvedValueOnce(response);

    const result = await fetchWebPage(url, FETCH_OPTIONS);

    expect(result.success).toBe(true);
    expect(result.attempts).toEqual([
      {
        method: PageFetchMethod.Fetch,
        success: true,
        status: 200,
      },
    ]);

    expect(result.document).not.toBeNull();

    if (result.document === null) {
      throw new Error('Expected a parsed HTML document.');
    }

    expect(result.document.URL).toBe(url.toString());
    expect(result.document.title).toBe('Example Page');
    expect(result.document.querySelector('#content')?.textContent).toBe(
      'Loaded',
    );

    expect(mocks.getFetchClientProfile).toHaveBeenCalledWith(
      FETCH_OPTIONS.userAgentCacheFile,
    );

    expect(mocks.buildFetchHeaders).toHaveBeenCalledWith(
      FETCH_CLIENT_PROFILE,
    );

    expect(mocks.fetchResource).toHaveBeenCalledWith(url, {
      headers: FETCH_HEADERS,
      followRedirect: true,
    });

    expect(response.text).toHaveBeenCalledTimes(1);

    expect(mocks.looksLikeChallengeResponse).toHaveBeenCalledWith(
      response,
      HTML,
    );

    expect(
      mocks.fetchPageWithPersistentProfile,
    ).not.toHaveBeenCalled();
  });

  it('returns an HTTP failure when the response is unsuccessful and is not a challenge', async () => {
    const url = new URL('https://example.test/missing-page');
    const response = createMockResponse('Page not found', {
      ok: false,
      status: 404,
    });

    mocks.fetchResource.mockResolvedValueOnce(response);

    const result = await fetchWebPage(url, FETCH_OPTIONS);

    expect(result).toEqual({
      success: false,
      document: null,
      attempts: [
        {
          method: PageFetchMethod.Fetch,
          success: false,
          status: 404,
          reason: 'http-404',
        },
      ],
    });

    expect(response.text).toHaveBeenCalledTimes(1);

    expect(mocks.looksLikeChallengeResponse).toHaveBeenCalledWith(
      response,
      'Page not found',
    );

    expect(
      mocks.fetchPageWithPersistentProfile,
    ).not.toHaveBeenCalled();
  });

  it('falls back to the browser and combines attempts when a challenge is detected', async () => {
    const url = new URL('https://example.test/protected');
    const challengeHtml = '<html><body>Verify your browser</body></html>';
    const browserHtml = `<!doctype html>
<html>
  <head><title>Browser Resolved</title></head>
  <body><main id="browser-content">Resolved by browser</main></body>
</html>`;

    const response = createMockResponse(challengeHtml, {
      ok: false,
      status: 403,
    });

    mocks.fetchResource.mockResolvedValueOnce(response);
    mocks.looksLikeChallengeResponse.mockReturnValueOnce(true);
    mocks.fetchPageWithPersistentProfile.mockResolvedValueOnce({
      success: true,
      html: browserHtml,
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

    const result = await fetchWebPage(url, FETCH_OPTIONS);

    expect(result.success).toBe(true);
    expect(result.attempts).toEqual([
      {
        method: PageFetchMethod.Fetch,
        success: false,
        status: 403,
        reason: PageFetchFailureReason.ChallengeResponse,
      },
      {
        method: PageFetchMethod.BrowserHeadless,
        success: false,
        reason: PageFetchFailureReason.ChallengeResponse,
      },
      {
        method: PageFetchMethod.BrowserHeadful,
        success: true,
      },
    ]);

    expect(result.document).not.toBeNull();

    if (result.document === null) {
      throw new Error('Expected a parsed browser HTML document.');
    }

    expect(result.document.URL).toBe(url.toString());
    expect(result.document.title).toBe('Browser Resolved');
    expect(
      result.document.querySelector('#browser-content')?.textContent,
    ).toBe('Resolved by browser');

    expect(mocks.fetchPageWithPersistentProfile).toHaveBeenCalledWith(
      url,
      {
        browserProfileDir: FETCH_OPTIONS.browserProfileDir,
        userAgentCacheFile: FETCH_OPTIONS.userAgentCacheFile,
      },
    );

    expect(response.text).toHaveBeenCalledTimes(1);
  });

  it('returns a failed result with combined attempts when browser fallback fails', async () => {
    const url = new URL('https://example.test/protected');
    const challengeHtml = '<html><body>Verify your browser</body></html>';

    const response = createMockResponse(challengeHtml, {
      ok: false,
      status: 403,
    });

    mocks.fetchResource.mockResolvedValueOnce(response);
    mocks.looksLikeChallengeResponse.mockReturnValueOnce(true);
    mocks.fetchPageWithPersistentProfile.mockResolvedValueOnce({
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
          reason: PageFetchFailureReason.ResolvedPageMarkerNotFound,
        },
      ],
    });

    const result = await fetchWebPage(url, FETCH_OPTIONS);

    expect(result).toEqual({
      success: false,
      document: null,
      attempts: [
        {
          method: PageFetchMethod.Fetch,
          success: false,
          status: 403,
          reason: PageFetchFailureReason.ChallengeResponse,
        },
        {
          method: PageFetchMethod.BrowserHeadless,
          success: false,
          reason: PageFetchFailureReason.ChallengeResponse,
        },
        {
          method: PageFetchMethod.BrowserHeadful,
          success: false,
          reason: PageFetchFailureReason.ResolvedPageMarkerNotFound,
        },
      ],
    });

    expect(mocks.fetchPageWithPersistentProfile).toHaveBeenCalledWith(
      url,
      {
        browserProfileDir: FETCH_OPTIONS.browserProfileDir,
        userAgentCacheFile: FETCH_OPTIONS.userAgentCacheFile,
      },
    );

    expect(response.text).toHaveBeenCalledTimes(1);
  });

  it('propagates resource fetch errors without attempting browser fallback', async () => {
    const url = new URL('https://example.test/page');
    const fetchError = new Error('Unable to fetch page resource');

    mocks.fetchResource.mockRejectedValueOnce(fetchError);

    await expect(
      fetchWebPage(url, FETCH_OPTIONS),
    ).rejects.toBe(fetchError);

    expect(mocks.getFetchClientProfile).toHaveBeenCalledWith(
      FETCH_OPTIONS.userAgentCacheFile,
    );

    expect(mocks.buildFetchHeaders).toHaveBeenCalledWith(
      FETCH_CLIENT_PROFILE,
    );

    expect(mocks.fetchResource).toHaveBeenCalledWith(url, {
      headers: FETCH_HEADERS,
      followRedirect: true,
    });

    expect(mocks.looksLikeChallengeResponse).not.toHaveBeenCalled();

    expect(
      mocks.fetchPageWithPersistentProfile,
    ).not.toHaveBeenCalled();
  });

  it('propagates response body read errors without attempting browser fallback', async () => {
    const url = new URL('https://example.test/page');
    const response = createMockResponse('');
    const bodyReadError = new Error('Unable to read response body');

    response.text.mockRejectedValueOnce(bodyReadError);
    mocks.fetchResource.mockResolvedValueOnce(response);

    await expect(
      fetchWebPage(url, FETCH_OPTIONS),
    ).rejects.toBe(bodyReadError);

    expect(mocks.fetchResource).toHaveBeenCalledWith(url, {
      headers: FETCH_HEADERS,
      followRedirect: true,
    });

    expect(response.text).toHaveBeenCalledTimes(1);

    expect(mocks.looksLikeChallengeResponse).not.toHaveBeenCalled();

    expect(
      mocks.fetchPageWithPersistentProfile,
    ).not.toHaveBeenCalled();
  });
});
