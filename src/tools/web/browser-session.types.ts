/**
 * Browser-detected reason why a page fetch attempt did not produce a resolved page.
 */
export enum PageFetchFailureReason {
  ChallengeResponse = 'challenge-response',
  Captcha = 'captcha',
  ResolvedPageMarkerNotFound = 'resolved-page-marker-not-found',
}

/**
 * HTTP status-based failure reason recorded in the attempt history.
 */
export type HttpFailureReason = `http-${number}`;

/**
 * Reason recorded for a single page fetch attempt that did not produce a
 * resolved page.
 *
 * The value can describe either a browser-detected failure condition or an
 * HTTP status-based failure reported by a non-browser transport.
 */
export type PageFetchAttemptFailureReason =
  | PageFetchFailureReason
  | HttpFailureReason;

/**
 * Configuration of a page fetch performed through a persistent Playwright
 * browser profile.
 *
 * The profile directory controls browser state continuity across runs, while
 * the remaining options define how the browser is launched and how long manual
 * verification may continue before the attempt is treated as failed.
 */
export interface BrowserFetchOptions {
  /** Path to the persistent Playwright user data directory. */
  browserProfileDir: string;

  /** Path to the User-Agent identity cache file. */
  userAgentCacheFile: string;

  /** Whether the persistent browser context is launched without a visible window. */
  headless?: boolean;

  /**
   * Maximum time allowed for manual verification in a visible browser session
   * before the attempt is treated as failed.
   */
  manualTimeoutMs?: number;
}

/**
 * Snapshot of the active page together with lightweight challenge indicators.
 *
 * This structure captures the minimal set of signals needed to distinguish a
 * resolved target page from an interstitial, challenge, or CAPTCHA page.
 */
export interface PageChallengeState {
  /** Page URL captured for the snapshot. */
  url: string;

  /** Document title captured for the snapshot, or an empty string when unavailable. */
  title: string;

  /** HTML captured for the snapshot, or an empty string when unavailable. */
  html: string;

  /** Whether the page exposes a visible reCAPTCHA frame marker. */
  hasRecaptchaFrame: boolean;

  /** Whether the captured title or HTML matches challenge detection heuristics. */
  looksLikeChallenge: boolean;
}

/**
 * Transport or execution mode used for a single page fetch attempt.
 */
export enum PageFetchMethod {
  Fetch = 'fetch',
  BrowserHeadless = 'browser-headless',
  BrowserHeadful = 'browser-headful',
}

/**
 * Outcome of one attempt made while resolving a page.
 *
 * A complete page resolution may consist of multiple attempts performed with
 * different transports or browser modes. Each attempt records its method,
 * result, and optional failure details.
 */
export interface PageFetchAttempt {
  /** Transport or browser mode used by the attempt. */
  method: PageFetchMethod;

  /** Whether the attempt produced a resolved page. */
  success: boolean;

  /** Failure reason recorded for an unsuccessful attempt. */
  reason?: PageFetchAttemptFailureReason;

  /** HTTP status associated with the attempt when one is available. */
  status?: number;
}

/**
 * Shared result metadata returned by page fetch operations.
 */
export interface BasePageFetchResult {
  /** Whether the page was resolved successfully. */
  success: boolean;

  /** Ordered list of attempts performed during page resolution. */
  attempts: PageFetchAttempt[];
}

/**
 * Result of a page fetch operation that returns raw HTML.
 */
export interface RawPageFetchResult extends BasePageFetchResult {
  /** Resolved HTML document, or `null` when resolution failed. */
  html: string | null;
}

/**
 * Result of a page fetch operation that returns a parsed document.
 */
export interface ParsedPageFetchResult extends BasePageFetchResult {
  /** Parsed document created from the resolved HTML, or `null` when resolution failed. */
  document: Document | null;
}
