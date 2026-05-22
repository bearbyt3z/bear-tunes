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
 * Detects whether HTML looks like an active challenge or verification page.
 *
 * The check inspects a normalized lowercase prefix of the HTML and searches for
 * marker strings commonly found in anti-bot or browser verification interstitials.
 *
 * @param html - HTML content to classify.
 * @returns `true` when the HTML prefix appears to match a challenge or verification page.
 */
export function looksLikeChallengeHtml(html: string): boolean {
  const normalized = getHtmlPrefix(html);

  return [
    'checking your browser',
    'verify you are human',
    'enable javascript and cookies to continue',
    'challenge-error-text',
    'cf-challenge',
    'cf-browser-verification',
    'just a moment',
    '/cdn-cgi/challenge-platform/',
    'cf-turnstile',
    'turnstile',
  ].some((needle) => normalized.includes(needle));
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
