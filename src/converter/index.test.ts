import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BearTunesConverter,
  BearTunesConverterFailureCode,
  LameQuality,
  Mp3BitrateMode,
  Mp3ChannelMode,
  ReplayGainMode,
} from './index.js';

import type { BearTunesConverterResult } from './index.js';

interface MockCommandOutput {
  stdout: Buffer | undefined;
  stderr: Buffer | undefined;
  status: number;
  signal: NodeJS.Signals | null;
}

interface MockPipelineCommand {
  commandName: string;
  args: readonly string[];
}

interface MockPipelineCaptureOptions {
  firstStdout?: boolean;
  firstStderr?: boolean;
  secondStdout?: boolean;
  secondStderr?: boolean;
}

interface MockPipelineResult {
  first: MockCommandOutput;
  second: MockCommandOutput;
}

type SkipTest = (message?: string) => void;

const commandMocks = vi.hoisted(() => ({
  executeCommandSync: vi.fn<
    (commandName: string, args: readonly string[]) => MockCommandOutput
  >(),
  executeCommandPipeline: vi.fn<
    (
      firstCommand: MockPipelineCommand,
      secondCommand: MockPipelineCommand,
      captureOptions?: MockPipelineCaptureOptions,
    ) => Promise<MockPipelineResult>
  >(),
}));

vi.mock('#tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#tools')>();

  return {
    ...actual,
    executeCommandSync: commandMocks.executeCommandSync,
    executeCommandPipeline: commandMocks.executeCommandPipeline,
  };
});

const sourceFileContent = 'Example audio file content';

let temporaryDirectory = '';
let sourceDirectory = '';

function createSourceAudioFile(filename: string): string {
  const filePath = path.join(sourceDirectory, filename);

  fs.writeFileSync(filePath, sourceFileContent);

  return filePath;
}

function expectConverterFailure(
  result: BearTunesConverterResult,
  failureCode: BearTunesConverterFailureCode,
): void {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error('Expected conversion to fail.');
  }

  expect(result.failureCode).toBe(failureCode);
  expect(result.error).toBeInstanceOf(Error);
}

function createSymlinkOrSkip(
  targetPath: string,
  symlinkPath: string,
  type: 'dir' | 'file',
  skip: SkipTest,
): void {
  const symlinkType =
    process.platform === 'win32' && type === 'dir' ? 'junction' : type;

  try {
    fs.symlinkSync(targetPath, symlinkPath, symlinkType);
  } catch (error: unknown) {
    const errorCode =
      error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string'
        ? error.code
        : undefined;
    const isWindowsSymlinkPermissionError =
      process.platform === 'win32' &&
      errorCode !== undefined &&
      ['EACCES', 'EPERM', 'ENOTSUP'].includes(errorCode);

    if (isWindowsSymlinkPermissionError) {
      skip(
        `Symbolic link creation is not permitted in this Windows environment (${errorCode}).`,
      );
      return;
    }

    throw error;
  }
}

describe('BearTunesConverter', () => {
  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'bear-tunes-converter-test-'),
    );
    sourceDirectory = path.join(temporaryDirectory, 'source');

    fs.mkdirSync(sourceDirectory);

    commandMocks.executeCommandSync.mockReset();
    commandMocks.executeCommandSync.mockReturnValue({
      stdout: Buffer.from('FLAC encoder stdout'),
      stderr: Buffer.from('FLAC encoder stderr'),
      status: 0,
      signal: null,
    });

    commandMocks.executeCommandPipeline.mockReset();
    commandMocks.executeCommandPipeline.mockResolvedValue({
      first: {
        stdout: undefined,
        stderr: Buffer.from('FLAC decoder stderr'),
        status: 0,
        signal: null,
      },
      second: {
        stdout: Buffer.from('LAME encoder stdout'),
        stderr: Buffer.from('LAME encoder stderr'),
        status: 0,
        signal: null,
      },
    });
  });

  afterEach(() => {
    if (temporaryDirectory.length > 0) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }

    temporaryDirectory = '';
    sourceDirectory = '';
  });

  describe('aiffToFlac', () => {
    it('converts an AIFF file to FLAC using the derived output path and default command arguments', () => {
      const inputFilePath = createSourceAudioFile('example-track.aiff');
      const outputFilePath = path.join(sourceDirectory, 'example-track.flac');
      const converter = new BearTunesConverter();

      const result = converter.aiffToFlac(inputFilePath);

      expect(result).toEqual({
        ok: true,
        outputPath: outputFilePath,
        encoderStdout: 'FLAC encoder stdout',
        encoderStderr: 'FLAC encoder stderr',
      });
      expect(commandMocks.executeCommandSync).toHaveBeenCalledOnce();
      expect(commandMocks.executeCommandSync).toHaveBeenCalledWith('flac', [
        '--verify',
        '-8',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);
      expect(commandMocks.executeCommandPipeline).not.toHaveBeenCalled();
      expect(fs.readFileSync(inputFilePath, 'utf8')).toBe(sourceFileContent);
    });

    it('passes the force argument when output file overwriting is enabled', () => {
      const inputFilePath = createSourceAudioFile('overwrite-track.aiff');
      const outputFilePath = path.join(sourceDirectory, 'overwrite-track.flac');
      const converter = new BearTunesConverter({
        forceOverwriteOutputFile: true,
      });

      const result = converter.aiffToFlac(inputFilePath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });
      expect(commandMocks.executeCommandSync).toHaveBeenCalledWith('flac', [
        '--verify',
        '-8',
        '--force',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);
    });
  });

  describe('flacToMp3', () => {
    it('converts a FLAC file to MP3 using the derived output path and default LAME options', async () => {
      const inputFilePath = createSourceAudioFile('example-track.flac');
      const outputFilePath = path.join(sourceDirectory, 'example-track.mp3');
      const converter = new BearTunesConverter();

      const result = await converter.flacToMp3(inputFilePath);

      expect(result).toEqual({
        ok: true,
        outputPath: outputFilePath,
        encoderStdout: 'LAME encoder stdout',
        encoderStderr: 'LAME encoder stderr',
      });
      expect(commandMocks.executeCommandPipeline).toHaveBeenCalledOnce();
      expect(commandMocks.executeCommandPipeline).toHaveBeenCalledWith(
        {
          commandName: 'flac',
          args: ['--decode', '--stdout', inputFilePath],
        },
        {
          commandName: 'lame',
          args: [
            Mp3BitrateMode.CBR,
            '-b320',
            '-m',
            Mp3ChannelMode.JointStereo,
            LameQuality.Q1,
            ReplayGainMode.Accurate,
            '-',
            outputFilePath,
          ],
        },
        {
          firstStdout: false,
          firstStderr: true,
          secondStdout: true,
          secondStderr: true,
        },
      );
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
      expect(fs.readFileSync(inputFilePath, 'utf8')).toBe(sourceFileContent);
    });

    it('applies custom VBR bitrate bounds while retaining other default options', async () => {
      const inputFilePath = createSourceAudioFile('custom-track.flac');
      const outputFilePath = path.join(sourceDirectory, 'custom-track.mp3');
      const converter = new BearTunesConverter({
        mp3BitrateMode: Mp3BitrateMode.VBR,
        mp3VbrMinBitrateKbps: 192,
        mp3VbrMaxBitrateKbps: 256,
      });

      const result = await converter.flacToMp3(inputFilePath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });
      expect(commandMocks.executeCommandPipeline).toHaveBeenCalledWith(
        {
          commandName: 'flac',
          args: ['--decode', '--stdout', inputFilePath],
        },
        {
          commandName: 'lame',
          args: [
            Mp3BitrateMode.VBR,
            '-b192',
            '-B256',
            '-m',
            Mp3ChannelMode.JointStereo,
            LameQuality.Q1,
            ReplayGainMode.Accurate,
            '-',
            outputFilePath,
          ],
        },
        {
          firstStdout: false,
          firstStderr: true,
          secondStdout: true,
          secondStderr: true,
        },
      );
      expect(fs.readFileSync(inputFilePath, 'utf8')).toBe(sourceFileContent);
    });

    it('uses the configured target bitrate in ABR mode', async () => {
      const inputFilePath = createSourceAudioFile('average-bitrate-track.flac');
      const outputFilePath = path.join(
        sourceDirectory,
        'average-bitrate-track.mp3',
      );
      const converter = new BearTunesConverter({
        mp3BitrateMode: Mp3BitrateMode.ABR,
        mp3BitrateKbps: 224,
      });

      const result = await converter.flacToMp3(inputFilePath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });
      expect(commandMocks.executeCommandPipeline).toHaveBeenCalledWith(
        {
          commandName: 'flac',
          args: ['--decode', '--stdout', inputFilePath],
        },
        {
          commandName: 'lame',
          args: [
            Mp3BitrateMode.ABR,
            '224',
            '-m',
            Mp3ChannelMode.JointStereo,
            LameQuality.Q1,
            ReplayGainMode.Accurate,
            '-',
            outputFilePath,
          ],
        },
        {
          firstStdout: false,
          firstStderr: true,
          secondStdout: true,
          secondStderr: true,
        },
      );
      expect(fs.readFileSync(inputFilePath, 'utf8')).toBe(sourceFileContent);
    });
  });

  describe('input file validation', () => {
    it('returns InputFileAccessError when the AIFF input file does not exist', () => {
      const inputFilePath = path.join(sourceDirectory, 'missing-track.aiff');
      const converter = new BearTunesConverter();

      const result = converter.aiffToFlac(inputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InputFileAccessError,
      );
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
      expect(commandMocks.executeCommandPipeline).not.toHaveBeenCalled();
    });

    it('returns InvalidInputFile when the AIFF input file has an unsupported extension', () => {
      const inputFilePath = createSourceAudioFile('unsupported-track.wav');
      const converter = new BearTunesConverter();

      const result = converter.aiffToFlac(inputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidInputFile,
      );
      expect(fs.readFileSync(inputFilePath, 'utf8')).toBe(sourceFileContent);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });

    it('returns InvalidInputFile when the AIFF input path points to a directory', () => {
      const converter = new BearTunesConverter();

      const result = converter.aiffToFlac(sourceDirectory);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidInputFile,
      );
      expect(fs.statSync(sourceDirectory).isDirectory()).toBe(true);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });

    it('rejects a symbolic link used as the AIFF input file', ({ skip }) => {
      const actualInputFilePath = createSourceAudioFile('actual-track.aiff');
      const inputFilePath = path.join(sourceDirectory, 'linked-track.aiff');
      const converter = new BearTunesConverter();

      createSymlinkOrSkip(actualInputFilePath, inputFilePath, 'file', skip);

      const result = converter.aiffToFlac(inputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidInputFile,
      );
      expect(fs.lstatSync(inputFilePath).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(actualInputFilePath, 'utf8')).toBe(sourceFileContent);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });

    it('returns InputFileAccessError when the FLAC input file does not exist', async () => {
      const inputFilePath = path.join(sourceDirectory, 'missing-track.flac');
      const converter = new BearTunesConverter();

      const result = await converter.flacToMp3(inputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InputFileAccessError,
      );
      expect(commandMocks.executeCommandPipeline).not.toHaveBeenCalled();
    });

    it('follows symbolic links in parent directory components of the AIFF input path', ({ skip }) => {
      const actualInputDirectory = path.join(temporaryDirectory, 'actual-source');
      const linkedInputDirectory = path.join(temporaryDirectory, 'linked-source');
      const inputFileName = 'linked-parent-track.aiff';
      const actualInputFilePath = path.join(actualInputDirectory, inputFileName);
      const inputFilePath = path.join(linkedInputDirectory, inputFileName);
      const outputFilePath = path.join(linkedInputDirectory, 'linked-parent-track.flac');
      const converter = new BearTunesConverter();

      fs.mkdirSync(actualInputDirectory);
      fs.writeFileSync(actualInputFilePath, sourceFileContent);
      createSymlinkOrSkip(actualInputDirectory, linkedInputDirectory, 'dir', skip);

      const result = converter.aiffToFlac(inputFilePath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });
      expect(commandMocks.executeCommandSync).toHaveBeenCalledWith('flac', [
        '--verify',
        '-8',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);
      expect(fs.readFileSync(actualInputFilePath, 'utf8')).toBe(sourceFileContent);
    });
  });

  describe('output path resolution', () => {
    it('uses an existing output directory and appends the converted input filename', () => {
      const inputFilePath = createSourceAudioFile('directory-output-track.aiff');
      const outputDirectoryPath = path.join(temporaryDirectory, 'flac-output');
      const outputFilePath = path.join(
        outputDirectoryPath,
        'directory-output-track.flac',
      );
      const converter = new BearTunesConverter();

      fs.mkdirSync(outputDirectoryPath);

      const result = converter.aiffToFlac(inputFilePath, outputDirectoryPath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });
      expect(commandMocks.executeCommandSync).toHaveBeenCalledWith('flac', [
        '--verify',
        '-8',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);
    });

    it('accepts a non-existing output file path with the expected extension', () => {
      const inputFilePath = createSourceAudioFile('explicit-output-track.aiff');
      const outputFilePath = path.join(sourceDirectory, 'custom-output.flac');
      const converter = new BearTunesConverter();

      const result = converter.aiffToFlac(inputFilePath, outputFilePath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });
      expect(commandMocks.executeCommandSync).toHaveBeenCalledWith('flac', [
        '--verify',
        '-8',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);
    });

    it('returns InvalidOutputFileExtension when an existing output file has an unsupported extension', () => {
      const inputFilePath = createSourceAudioFile('invalid-output-track.aiff');
      const outputFilePath = path.join(sourceDirectory, 'custom-output.wav');
      const existingOutputFileContent = 'Existing unrelated file';
      const converter = new BearTunesConverter();

      fs.writeFileSync(outputFilePath, existingOutputFileContent);

      const result = converter.aiffToFlac(inputFilePath, outputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidOutputFileExtension,
      );
      expect(fs.readFileSync(outputFilePath, 'utf8')).toBe(existingOutputFileContent);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });

    it('returns InvalidOutputFileExtension when a non-existing output file path has an unsupported extension', () => {
      const inputFilePath = createSourceAudioFile('invalid-output-track.aiff');
      const outputFilePath = path.join(sourceDirectory, 'custom-output.wav');
      const converter = new BearTunesConverter();

      const result = converter.aiffToFlac(inputFilePath, outputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidOutputFileExtension,
      );
      expect(fs.existsSync(outputFilePath)).toBe(false);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });

    it('returns OutputPathAccessError when the parent directory of a new output file does not exist', () => {
      const inputFilePath = createSourceAudioFile('missing-parent-track.aiff');
      const outputFilePath = path.join(
        temporaryDirectory,
        'missing-output-directory',
        'track.flac',
      );
      const converter = new BearTunesConverter();

      const result = converter.aiffToFlac(inputFilePath, outputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.OutputPathAccessError,
      );
      expect(fs.existsSync(path.dirname(outputFilePath))).toBe(false);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });
  });

  describe('output file validation', () => {
    it('returns OutputFileAlreadyExists when the derived AIFF output file exists and overwriting is disabled', () => {
      const inputFilePath = createSourceAudioFile('existing-output-track.aiff');
      const outputFilePath = path.join(sourceDirectory, 'existing-output-track.flac');
      const existingOutputContent = 'Existing FLAC output';
      const converter = new BearTunesConverter();

      fs.writeFileSync(outputFilePath, existingOutputContent);

      const result = converter.aiffToFlac(inputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.OutputFileAlreadyExists,
      );
      expect(fs.readFileSync(inputFilePath, 'utf8')).toBe(sourceFileContent);
      expect(fs.readFileSync(outputFilePath, 'utf8')).toBe(existingOutputContent);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });

    it('returns OutputFileAlreadyExists when the derived FLAC output file exists and overwriting is disabled', async () => {
      const inputFilePath = createSourceAudioFile('existing-output-track.flac');
      const outputFilePath = path.join(sourceDirectory, 'existing-output-track.mp3');
      const existingOutputContent = 'Existing MP3 output';
      const converter = new BearTunesConverter();

      fs.writeFileSync(outputFilePath, existingOutputContent);

      const result = await converter.flacToMp3(inputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.OutputFileAlreadyExists,
      );
      expect(fs.readFileSync(inputFilePath, 'utf8')).toBe(sourceFileContent);
      expect(fs.readFileSync(outputFilePath, 'utf8')).toBe(existingOutputContent);
      expect(commandMocks.executeCommandPipeline).not.toHaveBeenCalled();
    });

    it('replaces an existing AIFF output file when overwriting is enabled', () => {
      const inputFilePath = createSourceAudioFile('replace-output-track.aiff');
      const outputFilePath = path.join(sourceDirectory, 'replace-output-track.flac');
      const existingOutputContent = 'Existing FLAC output';
      const convertedOutputContent = 'Converted FLAC output';
      const converter = new BearTunesConverter({
        forceOverwriteOutputFile: true,
      });

      fs.writeFileSync(outputFilePath, existingOutputContent);

      commandMocks.executeCommandSync.mockImplementation(() => {
        fs.writeFileSync(outputFilePath, convertedOutputContent);

        return {
          stdout: Buffer.from('FLAC encoder stdout'),
          stderr: Buffer.from('FLAC encoder stderr'),
          status: 0,
          signal: null,
        };
      });

      const result = converter.aiffToFlac(inputFilePath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });

      expect(commandMocks.executeCommandSync).toHaveBeenCalledWith('flac', [
        '--verify',
        '-8',
        '--force',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);

      expect(fs.readFileSync(outputFilePath, 'utf8')).toBe(
        convertedOutputContent,
      );
    });

    it('replaces an existing FLAC output file when overwriting is enabled', async () => {
      const inputFilePath = createSourceAudioFile('replace-output-track.flac');
      const outputFilePath = path.join(sourceDirectory, 'replace-output-track.mp3');
      const existingOutputContent = 'Existing MP3 output';
      const convertedOutputContent = 'Converted MP3 output';
      const converter = new BearTunesConverter({
        forceOverwriteOutputFile: true,
      });

      fs.writeFileSync(outputFilePath, existingOutputContent);

      commandMocks.executeCommandPipeline.mockImplementation(() => {
        fs.writeFileSync(outputFilePath, convertedOutputContent);

        return Promise.resolve({
          first: {
            stdout: undefined,
            stderr: Buffer.from('FLAC decoder stderr'),
            status: 0,
            signal: null,
          },
          second: {
            stdout: Buffer.from('LAME encoder stdout'),
            stderr: Buffer.from('LAME encoder stderr'),
            status: 0,
            signal: null,
          },
        });
      });

      const result = await converter.flacToMp3(inputFilePath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });

      expect(commandMocks.executeCommandPipeline).toHaveBeenCalledWith(
        {
          commandName: 'flac',
          args: ['--decode', '--stdout', inputFilePath],
        },
        {
          commandName: 'lame',
          args: [
            Mp3BitrateMode.CBR,
            '-b320',
            '-m',
            Mp3ChannelMode.JointStereo,
            LameQuality.Q1,
            ReplayGainMode.Accurate,
            '-',
            outputFilePath,
          ],
        },
        {
          firstStdout: false,
          firstStderr: true,
          secondStdout: true,
          secondStderr: true,
        },
      );

      expect(fs.readFileSync(outputFilePath, 'utf8')).toBe(
        convertedOutputContent,
      );
    });

    it('returns InvalidOutputPath when a directory occupies the derived output file path', () => {
      const inputFilePath = createSourceAudioFile('directory-conflict-track.aiff');
      const outputFilePath = path.join(sourceDirectory, 'directory-conflict-track.flac');
      const converter = new BearTunesConverter({
        forceOverwriteOutputFile: true,
      });

      fs.mkdirSync(outputFilePath);

      const result = converter.aiffToFlac(inputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidOutputPath,
      );
      expect(fs.statSync(outputFilePath).isDirectory()).toBe(true);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });
  });

  describe('symbolic link handling', () => {
    it('accepts an existing output directory that is a symbolic link to a directory', ({ skip }) => {
      const inputFilePath = createSourceAudioFile('linked-directory-track.aiff');
      const actualOutputDirectory = path.join(temporaryDirectory, 'actual-output');
      const linkedOutputDirectory = path.join(temporaryDirectory, 'linked-output');
      const outputFilePath = path.join(linkedOutputDirectory, 'linked-directory-track.flac');
      const converter = new BearTunesConverter();

      fs.mkdirSync(actualOutputDirectory);
      createSymlinkOrSkip(actualOutputDirectory, linkedOutputDirectory, 'dir', skip);

      const result = converter.aiffToFlac(inputFilePath, linkedOutputDirectory);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });
      expect(commandMocks.executeCommandSync).toHaveBeenCalledWith('flac', [
        '--verify',
        '-8',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);
      expect(fs.lstatSync(linkedOutputDirectory).isSymbolicLink()).toBe(true);
    });

    it('rejects an output path that is a symbolic link to a regular file', ({ skip }) => {
      const inputFilePath = createSourceAudioFile('linked-file-output-track.aiff');
      const actualOutputFilePath = path.join(temporaryDirectory, 'actual-output.flac');
      const linkedOutputFilePath = path.join(temporaryDirectory, 'linked-output.flac');
      const converter = new BearTunesConverter({
        forceOverwriteOutputFile: true,
      });

      fs.writeFileSync(actualOutputFilePath, 'Existing FLAC output');
      createSymlinkOrSkip(actualOutputFilePath, linkedOutputFilePath, 'file', skip);

      const result = converter.aiffToFlac(inputFilePath, linkedOutputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidOutputPath,
      );
      expect(fs.readFileSync(actualOutputFilePath, 'utf8')).toBe('Existing FLAC output');
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });

    it('rejects a broken symbolic link used as an output path', ({ skip }) => {
      const inputFilePath = createSourceAudioFile('broken-link-output-track.aiff');
      const missingTargetPath = path.join(temporaryDirectory, 'missing-output.flac');
      const linkedOutputFilePath = path.join(temporaryDirectory, 'broken-output.flac');
      const converter = new BearTunesConverter();

      createSymlinkOrSkip(missingTargetPath, linkedOutputFilePath, 'file', skip);

      const result = converter.aiffToFlac(inputFilePath, linkedOutputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidOutputPath,
      );
      expect(fs.lstatSync(linkedOutputFilePath).isSymbolicLink()).toBe(true);
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });

    it('accepts a symbolic link to a directory as the parent of a new output file', ({ skip }) => {
      const inputFilePath = createSourceAudioFile('linked-parent-output-track.aiff');
      const actualOutputDirectory = path.join(temporaryDirectory, 'actual-output');
      const linkedOutputDirectory = path.join(temporaryDirectory, 'linked-output');
      const outputFilePath = path.join(linkedOutputDirectory, 'custom-output.flac');
      const converter = new BearTunesConverter();

      fs.mkdirSync(actualOutputDirectory);
      createSymlinkOrSkip(actualOutputDirectory, linkedOutputDirectory, 'dir', skip);

      const result = converter.aiffToFlac(inputFilePath, outputFilePath);

      expect(result).toMatchObject({
        ok: true,
        outputPath: outputFilePath,
      });
      expect(commandMocks.executeCommandSync).toHaveBeenCalledWith('flac', [
        '--verify',
        '-8',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);
    });

    it('rejects a symbolic link occupying the derived output file path', ({ skip }) => {
      const inputFilePath = createSourceAudioFile('derived-link-output-track.aiff');
      const actualOutputFilePath = path.join(temporaryDirectory, 'actual-output.flac');
      const outputFilePath = path.join(sourceDirectory, 'derived-link-output-track.flac');
      const converter = new BearTunesConverter({
        forceOverwriteOutputFile: true,
      });

      fs.writeFileSync(actualOutputFilePath, 'Existing FLAC output');
      createSymlinkOrSkip(actualOutputFilePath, outputFilePath, 'file', skip);

      const result = converter.aiffToFlac(inputFilePath);

      expectConverterFailure(
        result,
        BearTunesConverterFailureCode.InvalidOutputPath,
      );
      expect(fs.readFileSync(actualOutputFilePath, 'utf8')).toBe('Existing FLAC output');
      expect(commandMocks.executeCommandSync).not.toHaveBeenCalled();
    });
  });
});
