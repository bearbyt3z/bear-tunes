/**
 * Supported local audio file types recognized by the audio tools layer.
 *
 * The enum is used as a normalized result of low-level audio file type
 * detection, so higher-level modules do not need to depend on raw MIME types,
 * filename extensions, or file-type package details.
 */
export enum AudioFileType {
  Mp3 = 'mp3',
  Flac = 'flac',
  Aiff = 'aiff',
}
