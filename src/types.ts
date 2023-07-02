// type definitions

export interface TrackInfo {
  url?: URL,
  artists?: string[],
  title?: string,
  remixers?: string[],
  released?: Date,
  year?: number,
  genre?: string,
  bpm?: number,
  key?: string,
  ufid?: string,
  waveform?: URL,
  publisher?: PublisherInfo,
  album?: AlbumInfo,
  details?: TrackDetails,
}

export interface AlbumInfo {
  artists?: string[],
  title?: string,
  catalogNumber?: string,
  trackNumber?: number,
  trackTotal?: number,
  url?: URL,
  artwork?: URL,
}

export interface PublisherInfo {
  name: string,
  url?: URL,
  logotype?: URL,
}

export interface TrackDetails {
  duration: number, // seconds
}
