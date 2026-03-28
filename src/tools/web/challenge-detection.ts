/**
 * Detects whether an HTML document looks like a challenge or verification page.
 *
 * The check uses a small set of case-insensitive marker strings commonly found
 * in anti-bot, CAPTCHA, or browser verification responses.
 *
 * @returns True when the HTML appears to contain challenge-related content.
 */
export function looksLikeChallengeHtml(html: string): boolean {
  const normalized = html.toLowerCase();

  return [
    'checking your browser',
    'verify you are human',
    'enable javascript and cookies to continue',
    'challenge-error-text',
    'cf-challenge',
    '__cf_chl_',
    'cf-browser-verification',
    'just a moment',
    'captcha',
    'recaptcha',
    'g-recaptcha',
  ].some((needle) => normalized.includes(needle));
}

/**
 * Detects whether an HTTP response looks like a challenge or verification page.
 *
 * The check first uses response headers, then falls back to case-insensitive
 * HTML markers commonly found in anti-bot, CAPTCHA, or browser verification responses.
 *
 * @returns True when the response appears to contain challenge-related content.
 */
export function looksLikeChallengeResponse(
  response: Pick<Response, 'headers'>,
  html: string,
): boolean {
  return response.headers.get('cf-mitigated') === 'challenge'
    || looksLikeChallengeHtml(html);
}
