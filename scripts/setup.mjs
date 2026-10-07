import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

const requirementsFile = process.argv[2] ?? 'python-requirements.txt';

if (!existsSync(requirementsFile)) {
  throw new Error(`Requirements file not found: ${requirementsFile}`);
}

execFileSync(
  'python3',
  ['-m', 'venv', '.venv'],
  { stdio: 'inherit' },
);

execFileSync(
  './.venv/bin/python',
  ['-m', 'pip', 'install', '-r', requirementsFile],
  { stdio: 'inherit' },
);

execFileSync(
  'npx',
  ['playwright', 'install', 'chromium'],
  { stdio: 'inherit' },
);
