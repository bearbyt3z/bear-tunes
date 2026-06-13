abstract class PipelineCommandFailedError extends Error {
  readonly commandName: string;
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;

  protected constructor(
    message: string,
    commandName: string,
    status: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
  ) {
    super(message);
    this.name = new.target.name;
    this.commandName = commandName;
    this.status = status;
    this.signal = signal;
    this.stderr = stderr;
  }
}

export class FirstPipelineCommandFailedError extends PipelineCommandFailedError {
  constructor(
    message: string,
    commandName: string,
    status: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
  ) {
    super(message, commandName, status, signal, stderr);
  }
}

export class SecondPipelineCommandFailedError extends PipelineCommandFailedError {
  constructor(
    message: string,
    commandName: string,
    status: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
  ) {
    super(message, commandName, status, signal, stderr);
  }
}
