/**
 * File system locations required to resolve a web page through the configured
 * fetch pipeline.
 */
export interface FetchWebPageOptions {
  /** Path to the persistent browser profile directory. */
  browserProfileDir: string;

  /** Path to the persisted request identity cache file. */
  userAgentCacheFile: string;
}
