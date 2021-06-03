// type definitions

export interface TrackInfo {
  url?: URL,
  artists?: string, // TODO: change to array
  title?: string,
  remixers?: string,
  released?: string, // TODO: change to Date type
  year?: number,
  genre?: string,
  bpm?: number,
  key?: string,
  ufid?: string,
  waveform?: URL,
  publisher?: PublisherInfo,
  album?: AlbumInfo,
}

export interface AlbumInfo {
  artists?: string, // TODO: array
  title?: string,
  catalogNumber?: string, // TODO: int?
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
