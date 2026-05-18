export enum PageFetchFailureReason {
  ChallengeResponse = 'challenge-response',
  Captcha = 'captcha',
  ResolvedPageMarkerNotFound = 'resolved-page-marker-not-found',
}

export type HttpFailureReason = `http-${number}`;

export type PageFetchAttemptFailureReason =
  | PageFetchFailureReason
  | HttpFailureReason;

/**
 * Options controlling page loading through a persistent Playwright browser session.
 *
 * These options affect how the persistent browser profile is opened and how long
 * the caller waits for manual verification to complete when the target page
 * cannot be resolved automatically.
 */
export interface BrowserFetchOptions {
  /** Path to the persistent Playwright user data directory. */
  browserProfileDir: string;

  /** Path to the User-Agent identity cache file. */
  userAgentCacheFile: string;

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

/**
 * Identifies the transport used during a single page fetch attempt.
 */
export enum PageFetchMethod {
  Fetch = 'fetch',
  BrowserHeadless = 'browser-headless',
  BrowserHeadful = 'browser-headful',
}

/**
 * Describes one attempt made while resolving the target page.
 *
 * A single high-level page fetch may include multiple attempts, for example
 * an initial HTTP fetch followed by headless and headful browser fallbacks.
 */
export interface PageFetchAttempt {
  /** Transport used for this attempt. */
  method: PageFetchMethod;

  /** Whether this individual attempt succeeded. */
  success: boolean;

  /** Optional short reason explaining why the attempt failed. */
  reason?: PageFetchAttemptFailureReason;

  /** Optional HTTP status observed for this attempt when available. */
  status?: number;
}

/**
 * Common metadata returned by page fetch helpers.
 */
export interface BasePageFetchResult {
  /** Whether the overall page resolution succeeded. */
  success: boolean;

  /** Ordered history of attempts made while resolving the page. */
  attempts: PageFetchAttempt[];
}

/**
 * Result returned by low-level page fetch helpers that work with raw HTML.
 */
export interface RawPageFetchResult extends BasePageFetchResult {
  /** Final resolved HTML, or `null` when the page could not be resolved. */
  html: string | null;
}

/**
 * Result returned by high-level page fetch helpers that expose a parsed DOM.
 */
export interface ParsedPageFetchResult extends BasePageFetchResult {
  /** Parsed document created from the final HTML, or `null` on failure. */
  document: Document | null;
}
