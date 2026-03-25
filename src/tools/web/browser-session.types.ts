/** Options controlling page loading through a persistent browser session. */
export interface BrowserFetchOptions {
  cacheDir?: string;
  headless?: boolean;
  /** Maximum time to wait for manual challenge completion. */
  manualTimeoutMs?: number;
}

/** Snapshot of the current page state, including challenge detection signals. */
export interface PageChallengeState {
  title: string;
  html: string;
  hasRecaptchaFrame: boolean;
  challenge: boolean;
}
