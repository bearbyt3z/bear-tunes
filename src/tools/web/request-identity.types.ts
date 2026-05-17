/** Timestamp expressed in milliseconds since the Unix epoch. */
export type TimestampMs = number;

export type DeviceCategory = 'desktop' | 'mobile';

export enum RequestIdentityType {
  Fetch = 'fetch',
  Browser = 'browser',
}

export enum BrowserUserAgentSource {
  HeadfulObserved = 'headful-observed',
  HeadlessNormalized = 'headless-normalized',
}

/** Filters used when generating a matching User-Agent profile. */
export interface UAFilter {
  deviceCategory: DeviceCategory;
  platform?: string;
}

/** A named User-Agent generation preset with matching rules and filters. */
export interface UAProfile {
  name: string;
  match: RegExp;
  filter: UAFilter;
}

export interface FingerprintCacheEntry {
  userAgent: string;
  createdAt: TimestampMs;
  expiresAt: TimestampMs;
}

export interface FetchIdentityCache extends FingerprintCacheEntry {
  profileName: string;
}

export interface BrowserIdentityCache extends FingerprintCacheEntry {
  source: BrowserUserAgentSource;
}

export interface IdentityCache {
  fetch?: FetchIdentityCache;
  browser?: BrowserIdentityCache;
}

export interface ClientIdentity {
  userAgent: string;
  locale: string;
  timezoneId: string;
}

export interface ClientDeviceProfile {
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

export interface ClientRequestProfile {
  accept: string;
  acceptLanguage: string;
  acceptEncoding: string;
  connection: string;
  upgradeInsecureRequests: string;
}

/** Canonical client profile describing identity, device, and request settings. */
export interface FetchClientProfile {
  identity: ClientIdentity;
  device: ClientDeviceProfile;
  request: ClientRequestProfile;
}
