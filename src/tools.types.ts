export type TimestampMs = number;

export type DeviceCategory = 'desktop' | 'mobile';

export interface UAFilter {
  deviceCategory: DeviceCategory;
  platform?: string;
}

export interface UAProfile {
  name: string;
  match: RegExp;
  filter: UAFilter;
}

export interface UACache {
  userAgent: string;
  profileName: string;
  createdAt: TimestampMs;
  expiresAt: TimestampMs;
}
