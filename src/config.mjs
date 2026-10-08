import * as path from 'node:path';
import process from 'node:process';

export const PYTHON_VENV_DIRECTORY = '.venv';

export const PYTHON_EXECUTABLE = process.platform === 'win32'
  ? path.join(PYTHON_VENV_DIRECTORY, 'Scripts', 'python.exe')
  : path.join(PYTHON_VENV_DIRECTORY, 'bin', 'python');

export const CACHE_DIR = path.join(process.cwd(), '.cache');

export const BROWSER_PROFILE_DIR = path.join(
  CACHE_DIR,
  'playwright-profile',
);
export const USER_AGENT_CACHE_FILE = path.join(
  CACHE_DIR,
  'user-agent.json',
);
