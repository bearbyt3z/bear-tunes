// Substrings used to identify common browser-verification and anti-bot
// challenge pages. HTML is normalized to lowercase before matching.
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
] as const;

/**
 * Returns a lowercase prefix of the provided HTML string.
 *
 * The helper trims the document to the requested maximum length so challenge
 * detection can inspect only the beginning of the HTML, where interstitial and
 * verification markers usually appear.
 *
 * @param html - Full HTML content to normalize and trim.
 * @param maxLength - Maximum number of characters to keep from the beginning of the HTML.
 * @returns The lowercased HTML prefix limited to `maxLength` characters.
 */
function getHtmlPrefix(html: string, maxLength = 16_000): string {
  return html.slice(0, maxLength).toLowerCase();
}

/**
 * Detects whether HTML looks like a browser-verification or anti-bot challenge page.
 *
 * The check examines the first 16,000 characters of the HTML, normalizes
 * them to lowercase, and searches for known challenge markers.
 *
 * @param html - HTML content to inspect.
 * @returns `true` if the inspected HTML prefix contains a known challenge marker;
 * otherwise, `false`.
 */
export function looksLikeChallengeHtml(html: string): boolean {
  const normalized = getHtmlPrefix(html);

  return CHALLENGE_MARKERS.some(
    (needle) => normalized.includes(needle),
  );
}

/**
 * Detects whether an HTTP response looks like a challenge or verification page.
 *
 * The check first uses response headers, then falls back to case-insensitive
 * HTML markers commonly found in anti-bot, CAPTCHA, or browser verification
 * responses.
 *
 * @param response - HTTP response metadata used for challenge detection.
 * @param html - Response HTML content to classify.
 * @returns `true` when the response appears to contain challenge-related content.
 */
export function looksLikeChallengeResponse(
  response: Pick<Response, 'headers'>,
  html: string,
): boolean {
  return response.headers.get('cf-mitigated') === 'challenge'
    || looksLikeChallengeHtml(html);
}
