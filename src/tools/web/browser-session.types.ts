/**
 * Options controlling page loading through a persistent Playwright browser session.
 *
 * These options affect how the persistent browser profile is opened and how long
 * the caller waits for manual verification to complete when the target page
 * cannot be resolved automatically.
 */
export interface BrowserFetchOptions {
  /** Optional path to the persistent Playwright user data directory. */
  cacheDir?: string;

  /** Whether to launch the persistent browser context in headless mode. */
  headless?: boolean;

  /**
  * Maximum time to wait for manual verification in a headful browser window
  * before treating the page resolution as failed.
  */
  manualTimeoutMs?: number;
}

/**
 * Snapshot of the currently loaded page together with lightweight signals used
 * to evaluate whether the target page was resolved successfully or still looks
 * like a challenge/interstitial page.
 */
export interface PageChallengeState {
  /** Current page URL at the time of the snapshot. */
  url: string;

  /** Current document title, or an empty string when it cannot be read. */
  title: string;

  /** Current page HTML content, or an empty string when it cannot be read. */
  html: string;

  /** Whether the page currently exposes a visible reCAPTCHA iframe marker. */
  hasRecaptchaFrame: boolean;

  /** Whether the current title/HTML matches known challenge page heuristics. */
  looksLikeChallenge: boolean;
}

export type PageFetchMethod = 'fetch' | 'browser-headless' | 'browser-headful';

export interface BasePageFetchResult {
  success: boolean;
  method: PageFetchMethod | null;
}

export interface RawPageFetchResult extends BasePageFetchResult {
  html: string | null;
}

export interface ParsedPageFetchResult extends BasePageFetchResult {
  document: Document | null;
}
