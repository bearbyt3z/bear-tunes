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
    'recaptcha',
    'g-recaptcha',
    'verify you are human',
    'captcha',
    'cf-challenge',
  ].some((needle) => normalized.includes(needle));
}
