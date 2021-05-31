import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { TrackInfo } from './types';
import {
  ConverterResult, ConverterOptions,
  BitrateMethod, Quality, ChannelMode, ReplayGain,
  FlacImageBlockExport, FlacImageBlockType,
} from './converter.types';

// exporting types, so they will be included in the converter import
export {
  ConverterResult, ConverterOptions,
  BitrateMethod, Quality, ChannelMode, ReplayGain,
  FlacImageBlockExport, FlacImageBlockType,
};

const logger = require('./logger');
const tools = require('./tools');

const defaultConverterOptions: ConverterOptions = {
  bitrateMethod: BitrateMethod.CBR,
  bitrateValue: 320,
  bitrateValueMinimum: 256,
  bitrateValueMaximum: 320,
  quality: Quality.Q1,
  channelMode: ChannelMode.JointStereo,
  replayGain: ReplayGain.Accurate,
};

export class BearTunesConverter {
  converterOptions: ConverterOptions;

  verbose: boolean;

  constructor(options: ConverterOptions = {}, verbose: boolean = false) {
    this.converterOptions = Object.assign(options, defaultConverterOptions);
    this.verbose = verbose;
  }

  flacToMp3(flacFilePath: string, outputPath: string | null = null, deleteFlacAfterConvertion: boolean = false): ConverterResult {
    const result: ConverterResult = {
      status: 0,
      error: null,
      lameStdout: null,
      lameStderr: null,
      outputPath: '',
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

    let outputPathComputed;

    try {
      if (outputPath === null) {
        outputPathComputed = flacFilePath.replace(/\.flac$/, '.mp3');
      } else if (fs.lstatSync(outputPath).isDirectory()) {
        outputPathComputed = outputPath.replace(/\/+$/, path.sep) + path.basename(flacFilePath).replace(/\.flac$/, '.mp3');
      } else if (fs.lstatSync(outputPath).isFile() && !flacFilePath.match(/\.mp3$/)) {
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

    result.outputPath = outputPathComputed;

    if (result.status !== 0) {
      return result;
    }

    let bitrateOption = this.converterOptions.bitrateMethod.toString();
    switch (this.converterOptions.bitrateMethod) {
      default:
      case BitrateMethod.CBR:
        bitrateOption += ` -b${this.converterOptions.bitrateValue.toString()}`;
        break;
      case BitrateMethod.VBR:
        bitrateOption += ` -b${this.converterOptions.bitrateValueMinimum.toString()} -B${this.converterOptions.bitrateValueMaximum.toString()}`;
        break;
      case BitrateMethod.ABR:
        bitrateOption += ` ${this.converterOptions.bitrateValue.toString()}`;
        break;
    }

    const lameOptions = [
      bitrateOption,
      `-m ${this.converterOptions.channelMode.toString()}`,
      this.converterOptions.quality.toString(),
      this.converterOptions.replayGain.toString(),
    ];

    const lameOptionsJoined = lameOptions.join(' ');

    if (this.verbose) {
      logger.info(`Using following lame options: ${lameOptionsJoined}`);
    }

    const flacTrackInfo = this.extractTagsFromFlac(flacFilePath);
    const tagOptions = [
      '--add-id3v2',
      `--tt "${flacTrackInfo.title}"`,
      `--ta "${flacTrackInfo.artists}"`,
      `--tl "${flacTrackInfo.album.title}"`,
      `--tn "${flacTrackInfo.album.trackNumber}/${flacTrackInfo.album.trackTotal}"`,
      `--tg "${flacTrackInfo.genre}"`,
      `--ty "${flacTrackInfo.year}"`,
    ];

    if (flacTrackInfo.released && flacTrackInfo.released.length > 0) {
      tagOptions.push(`--tv TORY=${flacTrackInfo.released}`);
    }

    // lame codec supports only front cover option:
    const flacImages = BearTunesConverter.extractArtworkFromFlac(flacFilePath, [FlacImageBlockType.CoverFront]);
    if (flacImages.length > 0) {
      tagOptions.push(`--ti "${flacImages[0].imagePath}"`);
    }

    const tagOptionsJoined = tagOptions.join(' ');

    if (this.verbose) {
      logger.info(`Using following tag options: ${tagOptionsJoined}`);
    }

    const childResult = childProcess.spawnSync(
      `flac --decode --stdout "${flacFilePath}" | lame ${lameOptionsJoined} ${tagOptionsJoined} - "${outputPathComputed}"`,
      { shell: true, stdio: 'inherit' },
    );

    flacImages.forEach((imageInfo) => fs.unlinkSync(imageInfo.imagePath));

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
      if (this.verbose) {
        logger.error(`metaflac process returned with ${metaflacResult.status} code and stderr: ${metaflacResult.stderr.toString()}`);
      }
      return {};
    }

    const metaflacOutput = metaflacResult.stdout.toString();
    const dateTag = BearTunesConverter.extractFlacTagFromString(metaflacOutput, 'date');
    let year;
    let released;
    if (dateTag && dateTag.length > 0) {
      year = dateTag.match(/\d{4}/);
      year = (year.length > 0) ? year[0] : undefined;
      released = dateTag; // TODO: check if it is a real date
    }

    const result: TrackInfo = {
      artists: BearTunesConverter.extractFlacTagFromString(metaflacOutput, 'artist', true),
      title: BearTunesConverter.extractFlacTagFromString(metaflacOutput, 'title'),
      genre: BearTunesConverter.extractFlacTagFromString(metaflacOutput, 'genre'),
      year,
      released,
      album: {
        artists: BearTunesConverter.extractFlacTagFromString(metaflacOutput, 'albumartist', true),
        title: BearTunesConverter.extractFlacTagFromString(metaflacOutput, 'album'),
        trackNumber: BearTunesConverter.extractFlacTagFromString(metaflacOutput, 'tracknumber'),
        trackTotal: BearTunesConverter.extractFlacTagFromString(metaflacOutput, 'tracktotal'),
      },
    };

    return result;
  }

  static extractFlacTagFromString(inputText: string, tagName: string, multiOccurrence: boolean = false): string | undefined {
    let regexFlags = 'm';
    let joinString = '';
    if (multiOccurrence) {
      regexFlags += 'g';
      joinString = ', ';
    }
    const matchArray = inputText.match(new RegExp(`(?<=^${tagName}=).*$`, regexFlags));
    return (matchArray.length > 0) ? matchArray.join(joinString) : undefined;
  }

  static extractArtworkFromFlac(flacFilePath: string, imageBlockTypes: Array<FlacImageBlockType>): Array<FlacImageBlockExport> {
    const result: Array<FlacImageBlockExport> = [];

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

  static getFlacImageBlockExport(flacFilePath: string): Array<FlacImageBlockExport> {
    const result: Array<FlacImageBlockExport> = [];

    const metaflacResult = childProcess.spawnSync(
      `metaflac --list --block-type=PICTURE "${flacFilePath}" | grep -A8 -i metadata`,
      { shell: true },
    );

    if (metaflacResult.status !== 0) {
      return result;
    }

    const stdoutAsString = metaflacResult.stdout.toString();
    const blockNumbers = stdoutAsString.match(/(?<=METADATA block #)\d/gi);
    const mimeTypes = stdoutAsString.match(/(?<=MIME type: )[a-z]*\/[a-z]*/gi);

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
