// type definitions

export interface TrackInfo {
  url?: string,
  artists?: string, // TODO: change to array
  title?: string,
  remixers?: string,
  released?: string, // TODO: change to Date type
  year?: string, // TODO: change to number/bigint/Date?
  genre?: string,
  bpm?: string, // TODO: int?
  key?: string,
  ufid?: string,
  waveform?: string, // TODO: URL
  publisher?: PublisherInfo,
  album?: AlbumInfo,
}

export interface AlbumInfo {
  artists?: string, // TODO: array
  title: string,
  catalogNumber?: string, // TODO: int?
  trackNumber?: string, // TODO: int
  trackTotal?: string, // TODO: int
  url?: string, // TODO: URL
  artwork?: string, // TODO: URL
}

export interface PublisherInfo {
  name: string,
  url?: string, // TODO: URL
  logotype?: string, // TODO: URL
}
