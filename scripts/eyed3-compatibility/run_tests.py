"""Run all eyeD3 compatibility tests."""

import subprocess
import sys
from pathlib import Path


TESTS_DIR = Path(__file__).resolve().parent

TESTS = (
    TESTS_DIR / 'test_display_plugin_replacement.py',
)


def main():
    """Run all eyeD3 compatibility tests."""
    for test_path in TESTS:
        print(f'Running {test_path.name}...', flush=True)
        subprocess.run(
            [sys.executable, str(test_path)],
            check=True,
        )

    print('All eyeD3 compatibility tests passed.')


if __name__ == '__main__':
    main()
