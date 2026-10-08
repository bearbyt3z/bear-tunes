import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

import {
  PYTHON_EXECUTABLE,
  PYTHON_VENV_DIRECTORY
} from '#config';

const requirementsFile = process.argv[2] ?? 'python-requirements.txt';

if (!existsSync(requirementsFile)) {
  throw new Error(`Requirements file not found: ${requirementsFile}`);
}

execFileSync(
  'python3',
  ['-m', 'venv', PYTHON_VENV_DIRECTORY],
  { stdio: 'inherit' },
);

execFileSync(
  PYTHON_EXECUTABLE,
  ['-m', 'pip', 'install', '-r', requirementsFile],
  { stdio: 'inherit' },
);

execFileSync(
  'npx',
  ['playwright', 'install', 'chromium'],
  { stdio: 'inherit' },
);
