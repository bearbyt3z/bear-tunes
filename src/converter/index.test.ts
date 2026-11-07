import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BearTunesConverter,
  LameQuality,
  Mp3BitrateMode,
  Mp3ChannelMode,
  ReplayGainMode,
} from './index.js';

interface MockCommandOutput {
  stdout: Buffer | undefined;
  stderr: Buffer | undefined;
  status: number;
  signal: NodeJS.Signals | null;
};

interface MockPipelineCommand {
  commandName: string;
  args: readonly string[];
};

interface MockPipelineCaptureOptions {
  firstStdout?: boolean;
  firstStderr?: boolean;
  secondStdout?: boolean;
  secondStderr?: boolean;
};

interface MockPipelineResult {
  first: MockCommandOutput;
  second: MockCommandOutput;
};

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
        '--force',
        '--output-name',
        outputFilePath,
        inputFilePath,
      ]);
      expect(commandMocks.executeCommandPipeline).not.toHaveBeenCalled();
      expect(fs.readFileSync(inputFilePath, 'utf8')).toBe(sourceFileContent);
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
});
