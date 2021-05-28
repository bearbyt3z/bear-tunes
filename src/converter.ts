'use strict';

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const logger = require('./logger');

export interface ConverterResult {
  status: number,
  error: Error|null,
  lameStdout: string|null,
  lameStderr: string|null,
  outputPath: string,
};

enum BitrateMethod {
  CBR = '--cbr',
  VBR = '--vbr-new',
  ABR = '--abr',
}

enum Quality {
  Q0 = '-q0',
  Q1 = '-q1',
  Q2 = '-q2',
  Q3 = '-q3',
  Q4 = '-q4',
  Q5 = '-q5',
  Q6 = '-q6',
  Q7 = '-q7',
  Q8 = '-q8',
  Q9 = '-q9',
}

enum ChannelMode {
  JointStereo = 'j',
  Stereo = 's',
  Mono = 'm',
}

enum ReplayGain {
  Accurate = '--replaygain-accurate',
  Fast = '--replaygain-fast',
  None = '--noreplaygain',
}

interface ConverterOptions {
  bitrateMethod?: BitrateMethod,
  bitrateValue?: number, // for CBR & ABR
  bitrateValueMinimum?: number, // for VBR
  bitrateValueMaximum?: number, // for VBR
  quality?: Quality,
  channelMode?: ChannelMode,
  replayGain?: ReplayGain,
};

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

  flacToMp3(flacFilePath: string, outputPath: string|null = null, deleteFlacAfterConvertion: boolean = false): ConverterResult {

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

    try {
      if (outputPath === null) {
        outputPath = flacFilePath.replace(/\.flac$/, '.mp3');
      } else if (fs.lstatSync(outputPath).isDirectory()) {
        outputPath = outputPath.replace(/\/+$/, path.sep) + path.basename(flacFilePath).replace(/\.flac$/, '.mp3');
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

    result.outputPath = outputPath;

    if (result.status !== 0) {
      return result;
    }
    
    let bitrateOption: string = BitrateMethod.CBR.toString();
    
    switch (this.converterOptions.bitrateMethod) {
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

    const lameOptions: Array<string> = [
      bitrateOption,
      `-m ${this.converterOptions.channelMode.toString()}`,
      this.converterOptions.quality.toString(),
      this.converterOptions.replayGain.toString(),
    ];

    if (this.verbose)
      logger.info(`Using following lame options: ${lameOptions.join(' ')}`);
    
    const childResult: childProcess.SpawnSyncReturns<Buffer> = childProcess.spawnSync(
      `flac --decode --stdout "${flacFilePath}" | lame ${lameOptions.join(' ')} - "${outputPath}"`,
      { shell: true, stdio: 'inherit' }
    );

    result.status = childResult.status;
    result.error = childResult.error;
    result.lameStdout = childResult.stdout?.toString();
    result.lameStderr = childResult.stderr?.toString();

    return result;

    // if (child.error) {
    //   logger.error(`ERROR: Failed to start child process: ${child.error}`);
    // } else if (child.status !== 0) {
    //   logger.error(`ERROR: Child process (v${version}) exited with code ${child.status}:\n${tools.leaveOnlyFirstLine(child.stderr)}`);
    // // } else if (child.stderr) {
    // //   console.error(`Error occured when saving ID3v${version} tag:`);
    // } else {
    //   console.log(verbose ? child.stdout : `ID3v${version} tag was saved to ${filename}`);
    // }


    // const flacProcess = childProcess.spawn('flac', [
    //   '--decode',
    //   '--stdout',
    //   `"${flacFilePath}"`,
    // ]);
    // const lameProcess = childProcess.spawn('lame', [
    //   '--preset',
    //   'extreme',
    //   '-',
    //   'flac/output.mp3'
    // ]);
    // // ], {
    // //   encoding: 'utf8',
    // // });
    // // flacProcess.stdout.pipe(lameProcess.stdin);
    // // lameProcess.stdout.pipe(process.stdout)
    // for await (const data of flacProcess.stdout)
    //   console.log(data);

    // if (child.error) {
    //   logger.error(`ERROR: Failed to start child process: ${child.error}`);
    // } else if (child.status !== 0) {
    //   logger.error(`ERROR: Child process (v${version}) exited with code ${child.status}:\n${tools.leaveOnlyFirstLine(child.stderr)}`);
    // // } else if (child.stderr) {
    // //   console.error(`Error occured when saving ID3v${version} tag:`);
    // } else {
    //   console.log(verbose ? child.stdout : `ID3v${version} tag was saved to ${filename}`);
    // }
  }
}
