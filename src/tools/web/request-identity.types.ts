/** Timestamp expressed in milliseconds since the Unix epoch. */
export type TimestampMs = number;

export type DeviceCategory = 'desktop' | 'mobile';

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

/** Cached User-Agent entry persisted on disk with creation and expiration timestamps. */
export interface UACache {
  userAgent: string;
  profileName: string;
  createdAt: TimestampMs;
  expiresAt: TimestampMs;
}

/** Canonical client profile describing identity, device, and request settings. */
export interface ClientProfile {
  identity: {
    userAgent: string;
    locale: string;
    timezoneId: string;
  };
  device: {
    viewport: { width: number; height: number };
    screen: { width: number; height: number };
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
  };
  request: {
    accept: string;
    acceptLanguage: string;
    acceptEncoding: string;
    connection: string;
    upgradeInsecureRequests: string;
  };
}
