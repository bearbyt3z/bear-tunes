import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { TrackInfo } from './types';
import {
  BearTunesConverterResult, BearTunesConverterOptions,
  BitrateMethod, Quality, ChannelMode, ReplayGain,
  FlacImageBlockExport, FlacImageBlockType,
} from './converter.types';

// exporting types, so they will be included in the converter import
export {
  BearTunesConverterResult, BearTunesConverterOptions,
  BitrateMethod, Quality, ChannelMode, ReplayGain,
  FlacImageBlockExport, FlacImageBlockType,
};

const logger = require('./logger');
const tools = require('./tools');

const defaultConverterOptions: BearTunesConverterOptions = {
  bitrateMethod: BitrateMethod.CBR,
  bitrateValue: 320,
  bitrateValueMinimum: 256,
  bitrateValueMaximum: 320,
  quality: Quality.Q1,
  channelMode: ChannelMode.JointStereo,
  replayGain: ReplayGain.Accurate,
  verbose: false,
} as const;

export class BearTunesConverter {
  options: BearTunesConverterOptions;

  constructor(options: Partial<BearTunesConverterOptions> = {}) {
    this.options = defaultConverterOptions;
    Object.assign(this.options, options);
  }

  flacToMp3(flacFilePath: string, outputPath: string | undefined = undefined, deleteFlacAfterConvertion: boolean = false): BearTunesConverterResult {
    const result: BearTunesConverterResult = {
      status: 0,
      error: undefined,
      lameStdout: undefined,
      lameStderr: undefined,
      outputPath: undefined,
    };

    try {
      if (!fs.lstatSync(flacFilePath).isFile() || !flacFilePath.match(/\.flac$/)) {
        result.status = 101;
        result.error = new TypeError(`${this.constructor.name}: Specified path ${flacFilePath} is not a file or does not have *.flac extension`);
      }
    } catch (error) {
      result.status = 102;
      result.error = new ReferenceError(`${this.constructor.name}: Cannot access file ${flacFilePath} (incorrect path?)`);
    }

    let outputPathComputed = outputPath;

    try {
      if (outputPathComputed === undefined) {
        outputPathComputed = flacFilePath.replace(/\.flac$/, '.mp3');
      } else if (fs.lstatSync(outputPathComputed).isDirectory()) {
        outputPathComputed = outputPathComputed.replace(/\/+$/, path.sep) + path.basename(flacFilePath).replace(/\.flac$/, '.mp3');
      } else if (fs.lstatSync(outputPathComputed).isFile() && !flacFilePath.match(/\.mp3$/)) {
        result.status = 103;
        result.error = new TypeError(`${this.constructor.name}: Specified output path ${outputPath} is a file but does not have *.mp3 extension`);
      } else {
        result.status = 104;
        result.error = new TypeError(`${this.constructor.name}: Specified output path ${outputPath} is neither a file nor directory`);
      }
    } catch (error) {
      result.status = 105;
      result.error = new ReferenceError(`${this.constructor.name}: Cannot access file ${outputPath} (incorrect path?)`);
    }

    if (result.status !== 0) {
      return result;
    }

    result.outputPath = outputPathComputed;

    let bitrateOption = this.options.bitrateMethod.toString();
    switch (this.options.bitrateMethod) {
      default:
      case BitrateMethod.CBR:
        bitrateOption += ` -b${this.options.bitrateValue.toString()}`;
        break;
      case BitrateMethod.VBR:
        bitrateOption += ` -b${this.options.bitrateValueMinimum.toString()} -B${this.options.bitrateValueMaximum.toString()}`;
        break;
      case BitrateMethod.ABR:
        bitrateOption += ` ${this.options.bitrateValue.toString()}`;
        break;
    }

    const lameOptions = [
      bitrateOption,
      `-m ${this.options.channelMode.toString()}`,
      this.options.quality.toString(),
      this.options.replayGain.toString(),
    ];

    const lameOptionsJoined = lameOptions.join(' ');

    if (this.options.verbose) {
      logger.info(`Using following lame options: ${lameOptionsJoined}`);
    }

    const flacTrackInfo = this.extractTagsFromFlac(flacFilePath);
    const tagOptions = ['--add-id3v2'];
    if (flacTrackInfo.title) {
      tagOptions.push(`--tt "${flacTrackInfo.title}"`);
    }
    if (flacTrackInfo.artists && flacTrackInfo.artists.length > 0) {
      tagOptions.push(`--ta "${flacTrackInfo.artists.join(', ')}"`);
    }
    if (flacTrackInfo.genre) {
      tagOptions.push(`--tg "${flacTrackInfo.genre}"`);
    }
    if (flacTrackInfo.year) {
      tagOptions.push(`--ty "${flacTrackInfo.year}"`);
    }
    if (flacTrackInfo.released) {
      tagOptions.push(`--tv TORY=${tools.convertDateToString(flacTrackInfo.released)}`);
    }

    if (flacTrackInfo.album) {
      if (flacTrackInfo.album.title) {
        tagOptions.push(`--tl "${flacTrackInfo.album.title}"`);
      }
      if (flacTrackInfo.album.trackNumber) {
        let albumNumbers = flacTrackInfo.album.trackNumber.toString();
        if (flacTrackInfo.album.trackTotal) {
          albumNumbers += `/${flacTrackInfo.album.trackTotal.toString()}`;
        }
        tagOptions.push(`--tn "${albumNumbers}"`);
      }
    }

    // lame codec supports only front cover option:
    const flacImages = BearTunesConverter.extractArtworkFromFlac(flacFilePath, [FlacImageBlockType.CoverFront]);
    if (flacImages.length > 0) {
      tagOptions.push(`--ti "${flacImages[0].imagePath}"`);
    }

    const tagOptionsJoined = (tagOptions.length > 1) ? tagOptions.join(' ') : ''; // length > 1 means there is at least one tag entry to set (the fist one is --add-id3v2)

    if (this.options.verbose) {
      logger.info(`Using following tag options: ${tagOptionsJoined}`);
    }

    const childResult = childProcess.spawnSync(
      `flac --decode --stdout "${flacFilePath}" | lame ${lameOptionsJoined} ${tagOptionsJoined} - "${outputPathComputed}"`,
      { shell: true, stdio: 'inherit' },
    );

    flacImages.forEach((imageInfo) => imageInfo.imagePath && fs.unlinkSync(imageInfo.imagePath));

    if (childResult.status === null) {
      result.status = 106;
      result.error = new Error(`Convertion failed due to a signal: ${childResult.signal ? childResult.signal : 'signal is null'}`);
      return result;
    }

    if (deleteFlacAfterConvertion) {
      fs.unlinkSync(flacFilePath);
    }

    result.status = childResult.status;
    result.error = childResult.error;
    result.lameStdout = childResult.stdout?.toString();
    result.lameStderr = childResult.stderr?.toString();

    return result;
  }

  extractTagsFromFlac(flacFilePath: string): TrackInfo {
    const metaflacResult = childProcess.spawnSync('metaflac', [
      '--show-tag=artist',
      '--show-tag=title',
      '--show-tag=album',
      '--show-tag=albumartist',
      '--show-tag=tracknumber',
      '--show-tag=tracktotal',
      '--show-tag=discnumber',
      '--show-tag=disctotal',
      '--show-tag=genre',
      '--show-tag=date',
      '--show-tag=composer',
      '--show-tag=isrc',
      flacFilePath,
    ]);

    if (metaflacResult.status !== 0) {
      if (this.options.verbose) {
        logger.warn(`metaflac process returned with ${metaflacResult.status} code and stderr: ${metaflacResult.stderr.toString()}`);
      }
      return {};
    }

    const metaflacOutput = metaflacResult.stdout.toString();
    const dateTag = BearTunesConverter.extractSingleTagFromMetaflacOutput(metaflacOutput, 'date');
    let year: number | undefined;
    let released: Date | undefined;
    if (dateTag && dateTag.length > 0) {
      const yearMatch = dateTag.match(/\d{4}/);
      if (yearMatch !== null && yearMatch.length > 0) {
        year = Number(yearMatch[0]);
        if (Number.isNaN(year)) year = undefined;
      }
      released = new Date(dateTag);
    }

    const result: TrackInfo = {
      artists: BearTunesConverter.extractMultiTagFromMetaflacOutput(metaflacOutput, 'artist'),
      title: BearTunesConverter.extractSingleTagFromMetaflacOutput(metaflacOutput, 'title'),
      genre: BearTunesConverter.extractSingleTagFromMetaflacOutput(metaflacOutput, 'genre'),
      year,
      released,
      album: {
        artists: BearTunesConverter.extractMultiTagFromMetaflacOutput(metaflacOutput, 'albumartist'),
        title: BearTunesConverter.extractSingleTagFromMetaflacOutput(metaflacOutput, 'album'),
        trackNumber: tools.getPositiveIntegerOrUndefined(BearTunesConverter.extractSingleTagFromMetaflacOutput(metaflacOutput, 'tracknumber')),
        trackTotal: tools.getPositiveIntegerOrUndefined(BearTunesConverter.extractSingleTagFromMetaflacOutput(metaflacOutput, 'tracktotal')),
      },
    };

    return result;
  }

  static extractSingleTagFromMetaflacOutput(metaflacOutput: string, tagName: string): string | undefined {
    const matchArray = BearTunesConverter.getMetaflacTagEntries(metaflacOutput, tagName, false);
    return (matchArray !== null && matchArray.length > 0) ? matchArray[0] : undefined;
  }

  static extractMultiTagFromMetaflacOutput(metaflacOutput: string, tagName: string): string[] | undefined {
    const matchArray = BearTunesConverter.getMetaflacTagEntries(metaflacOutput, tagName, true);
    return (matchArray !== null && matchArray.length > 0) ? matchArray : undefined;
  }

  static getMetaflacTagEntries(metaflacOutput: string, tagName: string, multi: boolean = false): string[] | null {
    return metaflacOutput.match(new RegExp(`(?<=^${tagName}=).+$`, multi ? 'gm' : 'm'));
  }

  static extractArtworkFromFlac(flacFilePath: string, imageBlockTypes: FlacImageBlockType[]): FlacImageBlockExport[] {
    const result: FlacImageBlockExport[] = [];

    const flacImageBlocks = BearTunesConverter.getFlacImageBlockExport(flacFilePath);
    if (flacImageBlocks.length < 1) {
      return result;
    }

    const matchingImageBlocks = flacImageBlocks.filter((info) => imageBlockTypes.includes(info.blockType));
    if (matchingImageBlocks.length < 1) {
      return result;
    }

    for (const imageBlockInfo of matchingImageBlocks) {
      const imageFileExtension = imageBlockInfo.mimeType.replace('image/', '');
      const imageFilePath = `${tools.getRandomString()}.${imageFileExtension}`;

      const metaflacResult = childProcess.spawnSync('metaflac', [
        `--block-number=${imageBlockInfo.blockType.toString()}`,
        `--export-picture-to=${imageFilePath}`,
        flacFilePath,
      ]);

      if (metaflacResult.status === 0) {
        imageBlockInfo.imagePath = imageFilePath;
        result.push(imageBlockInfo);
      }
    }

    return result;
  }

  static getFlacImageBlockExport(flacFilePath: string): FlacImageBlockExport[] {
    const result: FlacImageBlockExport[] = [];

    const metaflacResult = childProcess.spawnSync(
      `metaflac --list --block-type=PICTURE "${flacFilePath}" | grep -A8 -i metadata`,
      { shell: true },
    );

    if (metaflacResult.status !== 0) {
      return result;
    }

    const stdoutAsString = metaflacResult.stdout.toString();
    const blockNumbers = stdoutAsString.match(/(?<=METADATA block #)\d/gi) ?? [];
    const mimeTypes = stdoutAsString.match(/(?<=MIME type: )[a-z]*\/[a-z]*/gi) ?? [];

    const minLength = Math.min(blockNumbers.length, mimeTypes.length);

    if (minLength === 0) { // no images found
      return result;
    }

    if (blockNumbers.length !== mimeTypes.length) {
      logger.warn(`Amount of block numbers different than amount of mime types: only ${minLength} will be used`);
    }

    for (let i = 0; i < minLength; i += 1) {
      result.push({
        blockType: <FlacImageBlockType>Number(blockNumbers[i]),
        mimeType: mimeTypes[i],
      });
    }

    return result;
  }
}
