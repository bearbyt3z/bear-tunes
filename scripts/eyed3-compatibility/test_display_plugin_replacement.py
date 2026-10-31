"""Test the eyeD3 display plugin replacement against a generated MP3 fixture."""

import importlib.util
import json
import platform
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace


WORK_DIR = Path('/work')

REPLACEMENT_SCRIPT = WORK_DIR / 'eyed3-display-plugin-replacement.py'
PATTERN_FILE = WORK_DIR / 'eyed3-display-plugin-pattern.txt'

# The generator is read from the repository mounted at /work.
TEST_MP3_GENERATOR = WORK_DIR / 'scripts/eyed3-compatibility/create_test_mp3.py'
TEST_METADATA_FILE = WORK_DIR / 'scripts/eyed3-compatibility/test_metadata.json'


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def get_package_version(package_name):
    """Return the installed package version reported by pip."""
    result = subprocess.run(
        [sys.executable, '-m', 'pip', 'show', package_name],
        check=True,
        capture_output=True,
        text=True,
    )

    for line in result.stdout.splitlines():
        name, separator, value = line.partition(':')
        if name == 'Version' and separator:
            return value.strip()

    raise RuntimeError(
        f'Unable to determine installed version of {package_name}.'
    )


def run_replacement(mp3_path):
    """Run the display plugin replacement script and parse its JSON output."""
    result = subprocess.run(
        [
            sys.executable,
            str(REPLACEMENT_SCRIPT),
            str(PATTERN_FILE),
            str(mp3_path),
            '--escape-backslashes',
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        raise RuntimeError(
            'eyed3-display-plugin-replacement.py failed '
            f'with exit code {result.returncode}.',
        )

    if result.stderr:
        print(result.stderr, file=sys.stderr, end='')

    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        print(result.stdout)
        raise RuntimeError(
            'eyed3-display-plugin-replacement.py produced invalid JSON.',
        ) from error

    print(json.dumps(output, indent=2))

    return output


def validate_duration_ms_conversion():
    """Verify conversion of eyeD3 duration from seconds to milliseconds."""
    spec = importlib.util.spec_from_file_location(
        'eyed3_display_plugin_replacement',
        str(REPLACEMENT_SCRIPT),
    )

    if spec is None or spec.loader is None:
        raise RuntimeError(
            'Unable to load eyed3-display-plugin-replacement.py.',
        )

    replacement_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(replacement_module)

    test_cases = [
        (184.376, '184376'),
        (184.3766, '184377'),
    ]

    for duration_seconds, expected_duration_ms in test_cases:
        audio = SimpleNamespace(
            info=SimpleNamespace(time_secs=duration_seconds),
        )

        actual_duration_ms = replacement_module.get_duration_ms(audio)

        require(
            actual_duration_ms == expected_duration_ms,
            f'Expected {duration_seconds} seconds to produce '
            f'{expected_duration_ms} milliseconds, '
            f'got {actual_duration_ms}.',
        )


def validate_output(output, metadata):
    """Validate replacement output against the compatibility test fixture."""
    require(
        output['artists'] == metadata['artist'],
        'Unexpected artists value.',
    )
    require(
        output['title'] == metadata['title'],
        'Unexpected title value.',
    )
    require(
        output['released'] == metadata['releaseDate'],
        'Unexpected release date.',
    )
    require(
        output['genre'] == metadata['genre'],
        'Unexpected genre.',
    )
    require(
        output['url'] == metadata['audioFileUrl'].replace('\u0003', ''),
        'Unexpected audio URL.',
    )
    require(
        output['publisher']['name'] == metadata['publisher']['name'],
        'Unexpected publisher name.',
    )
    require(
        output['publisher']['url'] == metadata['publisher']['url'],
        'Unexpected publisher URL.',
    )
    require(
        output['album']['title'] == metadata['album']['title'],
        'Unexpected album title.',
    )
    require(
        output['album']['artists'] == metadata['album']['artist'],
        'Unexpected album artist.',
    )
    require(
        output['album']['trackNumber'] == str(metadata['album']['trackNumber']),
        'Unexpected track number.',
    )
    require(
        output['album']['trackTotal'] == str(metadata['album']['trackTotal']),
        'Unexpected track total.',
    )

    duration_ms = output['details']['durationMs']

    require(
        isinstance(duration_ms, int)
        and not isinstance(duration_ms, bool)
        and duration_ms > 0,
        'Expected a positive integer duration in milliseconds.',
    )

    require(
        output['musicCdId'] == metadata['musicCdId'],
        'Unexpected music CD ID.',
    )

    require(
        output['textFrames'] == metadata['textFrames'],
        'Unexpected text frames.',
    )

    require(
        output['comments'] == metadata['comments'],
        'Unexpected comments.',
    )

    require(
        '\u0003' not in str(output),
        'Unexpected ETX character in replacement output.',
    )


def main():
    """Run the complete eyeD3 compatibility test."""
    require(
        REPLACEMENT_SCRIPT.is_file(),
        f'Missing replacement script: {REPLACEMENT_SCRIPT}',
    )
    require(
        PATTERN_FILE.is_file(),
        f'Missing pattern file: {PATTERN_FILE}',
    )

    require(
        TEST_METADATA_FILE.is_file(),
        f'Missing test metadata file: {TEST_METADATA_FILE}',
    )

    python_version = platform.python_version()
    eyed3_version = get_package_version('eyeD3')

    print(f'Python: {python_version}')
    print(f'eyeD3: {eyed3_version}')

    print('Validating duration conversion...')
    validate_duration_ms_conversion()
    print('Duration conversion validation passed.')

    with TEST_METADATA_FILE.open(encoding='utf-8') as metadata_file:
        metadata = json.load(metadata_file)

    with tempfile.TemporaryDirectory() as temporary_directory:
        test_directory = Path(temporary_directory)

        print('Generating test MP3...')
        subprocess.run(
            [
                sys.executable,
                str(TEST_MP3_GENERATOR),
                str(test_directory),
            ],
            check=True,
        )

        mp3_path = test_directory / 'test.mp3'

        print('Running eyed3-display-plugin-replacement.py...')
        output = run_replacement(mp3_path)

        print('Validating replacement output...')
        validate_output(output, metadata)

    print('Replacement output validated successfully.')
    print('Test completed successfully.')


if __name__ == '__main__':
    main()
