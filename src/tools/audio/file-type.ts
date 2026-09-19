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
 * Errors encountered while reading the file are propagated to the caller.
 *
 * @param filePath - Path to the local file to inspect.
 * @returns Detected MIME type, or `undefined` when the file type is unknown.
 * @throws If reading or inspecting the file fails.
 */
export async function tryGetMimeTypeFromFile(filePath: string): Promise<string | undefined> {
  const fileType = await fileTypeFromFile(filePath);
  return fileType?.mime;
}

/**
 * Maps a file extension to the corresponding supported audio file type.
 *
 * A leading dot is ignored and the extension comparison is case-insensitive.
 * Extensions that are not supported by the audio tools layer return `undefined`.
 *
 * @param extension - File extension with or without a leading dot.
 * @returns The corresponding supported audio file type, or `undefined` for an unsupported extension.
 */
function getAudioFileType(extension: string): AudioFileType | undefined {
  switch (extension.replace(/^\./, '').toLowerCase()) {
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

/**
 * Attempts to detect the audio file type of a local file.
 *
 * The audio type is resolved from the detected file signature first. When
 * content-based detection does not return a file extension, the function
 * falls back to the file extension. If a detected or fallback extension does
 * not correspond to a supported audio file type, the function returns `undefined`.
 *
 * @param filePath - Path to the local file to inspect.
 * @returns Detected audio file type, or `undefined` when the file type is unknown
 * or unsupported.
 */
export async function tryGetAudioFileTypeFromFile(
  filePath: string,
): Promise<AudioFileType | undefined> {
  const detectedExtension = (await fileTypeFromFile(filePath))?.ext;

  if (detectedExtension) {
    return getAudioFileType(detectedExtension);
  }

  return getAudioFileType(path.extname(filePath));
}
