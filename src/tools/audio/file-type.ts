import * as path from 'node:path';

import { fileTypeFromFile } from 'file-type';

import { AudioFileType } from './file-type.types.js';

/**
 * Attempts to detect the MIME type of a local file.
 *
 * The MIME type is resolved from the file contents rather than from the file
 * extension. The function returns `undefined` when the file type cannot be
 * detected.
 *
 * @param filePath - Path to the local file to inspect.
 * @returns Detected MIME type, or `undefined` when the file type is unknown.
 */
export async function tryGetMimeTypeFromFile(filePath: string): Promise<string | undefined> {
  const fileType = await fileTypeFromFile(filePath);
  return fileType?.mime;
}

/**
 * Attempts to detect the audio file type of a local file.
 *
 * The audio type is resolved from the detected file signature first. When
 * content-based detection fails, the function falls back to the file extension.
 *
 * @param filePath - Path to the local file to inspect.
 * @returns Detected audio file type, or `undefined` when the file type is unknown.
 */
export async function tryGetAudioFileTypeFromFile(filePath: string): Promise<AudioFileType | undefined> {
  const detectedExtension = (await fileTypeFromFile(filePath))?.ext;

  if (detectedExtension) {
    switch (detectedExtension) {
      case 'mp3':
        return AudioFileType.Mp3;

      case 'flac':
        return AudioFileType.Flac;

      case 'aif':
      case 'aiff':
        return AudioFileType.Aiff;

      default:
        return undefined;
    }
  }

  const fallbackExtension = path.extname(filePath).toLowerCase();

  switch (fallbackExtension) {
    case '.mp3':
      return AudioFileType.Mp3;

    case '.flac':
      return AudioFileType.Flac;

    case '.aif':
    case '.aiff':
      return AudioFileType.Aiff;

    default:
      return undefined;
  }
}
