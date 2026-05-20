/** Timestamp expressed in milliseconds since the Unix epoch. */
export type TimestampMs = number;

/** Device class used when selecting a matching client or User-Agent profile. */
export type DeviceCategory = 'desktop' | 'mobile';

/** Identity family resolved for an outgoing request flow. */
export enum RequestIdentityType {
  Fetch = 'fetch',
  Browser = 'browser',
}

/** Source of the browser navigator identity stored in the cache. */
export enum BrowserUserAgentSource {
  HeadfulObserved = 'headful-observed',
  HeadlessNormalized = 'headless-normalized',
}

/**
 * Navigator properties used to describe a browser identity that can be replayed
 * or persisted across browser-based page fetch attempts.
 */
export interface BrowserNavigatorContext {
  /** Browser User-Agent value exposed through navigator. */
  userAgent: string;

  /** Browser platform value exposed through navigator. */
  platform: string;

  /** Primary browser language exposed through navigator. */
  language: string;

  /** Browser vendor value exposed through navigator. */
  vendor: string;
}

/**
 * Filter criteria used to select a matching User-Agent profile.
 */
export interface UAFilter {
  /** Device class required by the selected profile. */
  deviceCategory: DeviceCategory;

  /** Optional platform substring required by the selected profile. */
  platform?: string;
}

/**
 * Named User-Agent profile definition with matching rules and selection
 * filters.
 */
export interface UAProfile {
  /** Stable profile name used for cache entries and diagnostics. */
  name: string;

  /** Pattern used to recognize User-Agent strings belonging to the profile. */
  match: RegExp;

  /** Selection filter describing when the profile is applicable. */
  filter: UAFilter;
}

/**
 * Common cache entry metadata shared by persisted request identity records.
 */
export interface FingerprintCacheEntry {
  /** Cached User-Agent value. */
  userAgent: string;

  /** Timestamp when the cache entry was created. */
  createdAt: TimestampMs;

  /** Timestamp after which the cache entry is no longer valid. */
  expiresAt: TimestampMs;
}

/**
 * Cached request identity entry used for non-browser fetch traffic.
 */
export interface FetchIdentityCache extends FingerprintCacheEntry {
  /** Name of the client profile associated with the cached User-Agent. */
  profileName: string;
}

/**
 * Cached browser identity entry derived from an accepted browser navigator
 * context.
 */
export interface BrowserIdentityCache extends FingerprintCacheEntry, BrowserNavigatorContext {
  /** Origin of the cached browser navigator identity. */
  source: BrowserUserAgentSource;
}

/**
 * Container holding cached request identities for supported transport types.
 */
export interface IdentityCache {
  /** Cached identity used for non-browser fetch requests. */
  fetch?: FetchIdentityCache;

  /** Cached identity used for browser-based page fetch requests. */
  browser?: BrowserIdentityCache;
}

/**
 * Core client identity fields shared by a generated request profile.
 */
export interface ClientIdentity {
  /** User-Agent header value used by the client profile. */
  userAgent: string;

  /** Primary locale associated with the client profile. */
  locale: string;

  /** IANA timezone identifier associated with the client profile. */
  timezoneId: string;
}

/**
 * Device characteristics associated with a generated client profile.
 */
export interface ClientDeviceProfile {
  /** Viewport dimensions exposed by the client profile. */
  viewport: { width: number; height: number };

  /** Screen dimensions exposed by the client profile. */
  screen: { width: number; height: number };

  /** Device pixel ratio associated with the client profile. */
  deviceScaleFactor: number;

  /** Whether the client profile represents a mobile device class. */
  isMobile: boolean;

  /** Whether the client profile exposes touch input support. */
  hasTouch: boolean;
}

/**
 * Canonical request header values associated with a generated client profile.
 */
export interface ClientRequestProfile {
  /** Accept header value. */
  accept: string;

  /** Accept-Language header value. */
  acceptLanguage: string;

  /** Accept-Encoding header value. */
  acceptEncoding: string;

  /** Connection header value. */
  connection: string;

  /** Upgrade-Insecure-Requests header value. */
  upgradeInsecureRequests: string;
}

/**
 * Canonical client profile combining identity, device, and request header
 * settings.
 */
export interface FetchClientProfile {
  /** Core client identity settings. */
  identity: ClientIdentity;

  /** Device characteristics associated with the client profile. */
  device: ClientDeviceProfile;

  /** Canonical request headers associated with the client profile. */
  request: ClientRequestProfile;
}
