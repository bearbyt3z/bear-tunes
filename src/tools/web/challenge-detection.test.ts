import { describe, expect, it } from 'vitest';

import {
  looksLikeChallengeHtml,
  looksLikeChallengeResponse,
} from './challenge-detection.js';

const HTML_PREFIX_LENGTH = 16_000;

const CHALLENGE_MARKERS = [
  'checking your browser',
  'verify you are human',
  'enable javascript and cookies to continue',
  'challenge-error-text',
  'cf-challenge',
  'cf-browser-verification',
  'just a moment',
  '/cdn-cgi/challenge-platform/',
  'turnstile',
];

describe('looksLikeChallengeHtml', () => {
  it.each(CHALLENGE_MARKERS)(
    'detects the "%s" marker case-insensitively',
    (marker) => {
      expect(
        looksLikeChallengeHtml(
          `<html><body>${marker.toUpperCase()}</body></html>`,
        ),
      ).toBe(true);
    },
  );

  it('detects Cloudflare Turnstile markup', () => {
    expect(
      looksLikeChallengeHtml(
        '<div class="cf-turnstile"></div>',
      ),
    ).toBe(true);
  });

  it('returns false when HTML contains no challenge markers', () => {
    expect(
      looksLikeChallengeHtml(
        '<html><body><h1>Track metadata</h1><p>Page loaded successfully.</p></body></html>',
      ),
    ).toBe(false);
  });

  it.each([
    '',
    ' ',
    '\n\t',
  ])('returns false for empty or whitespace-only HTML: %j', (html) => {
    expect(looksLikeChallengeHtml(html)).toBe(false);
  });

  it('detects a marker ending at the 16,000-character limit', () => {
    const marker = 'checking your browser';

    const html = (
      'a'.repeat(HTML_PREFIX_LENGTH - marker.length)
      + marker
    );

    expect(html).toHaveLength(HTML_PREFIX_LENGTH);
    expect(looksLikeChallengeHtml(html)).toBe(true);
  });

  it('ignores a marker that starts after the 16,000-character limit', () => {
    const html = (
      'a'.repeat(HTML_PREFIX_LENGTH)
      + 'checking your browser'
    );

    expect(looksLikeChallengeHtml(html)).toBe(false);
  });

  it('ignores a marker truncated by the 16,000-character limit', () => {
    const marker = 'checking your browser';

    const html = (
      'a'.repeat(HTML_PREFIX_LENGTH - marker.length + 1)
      + marker
    );

    expect(looksLikeChallengeHtml(html)).toBe(false);
  });
});

describe('looksLikeChallengeResponse', () => {
  it('returns true when the cf-mitigated header indicates a challenge', () => {
    const response = {
      headers: new Headers({
        'cf-mitigated': 'challenge',
      }),
    };

    expect(
      looksLikeChallengeResponse(
        response,
        '<html><body>Ordinary page content.</body></html>',
      ),
    ).toBe(true);
  });

  it('detects challenge HTML when the cf-mitigated header is absent', () => {
    const response = {
      headers: new Headers(),
    };

    expect(
      looksLikeChallengeResponse(
        response,
        '<html><body>Just a moment</body></html>',
      ),
    ).toBe(true);
  });

  it('falls back to HTML detection when the cf-mitigated header has another value', () => {
    const response = {
      headers: new Headers({
        'cf-mitigated': 'none',
      }),
    };

    expect(
      looksLikeChallengeResponse(
        response,
        '<html><body>Verify you are human</body></html>',
      ),
    ).toBe(true);
  });

  it('returns false when the cf-mitigated header is absent and HTML has no challenge markers', () => {
    const response = {
      headers: new Headers(),
    };

    expect(
      looksLikeChallengeResponse(
        response,
        '<html><body><h1>Track metadata</h1></body></html>',
      ),
    ).toBe(false);
  });

  it('returns false when the header has another value and HTML has no challenge markers', () => {
    const response = {
      headers: new Headers({
        'cf-mitigated': 'none',
      }),
    };

    expect(
      looksLikeChallengeResponse(
        response,
        '<html><body>Page loaded successfully.</body></html>',
      ),
    ).toBe(false);
  });
});
