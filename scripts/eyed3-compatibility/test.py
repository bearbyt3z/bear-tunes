import json
import platform
import subprocess
import sys
import tempfile
from pathlib import Path


WORK_DIR = Path('/work')
REPLACEMENT_SCRIPT = WORK_DIR / 'eyed3-display-plugin-replacement.py'
PATTERN_FILE = WORK_DIR / 'eyed3-display-plugin-pattern.txt'
TEST_MP3_GENERATOR = WORK_DIR / 'scripts/eyed3-compatibility/create_test_mp3.py'


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def get_package_version(package_name):
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


def validate_output(output):
    require(
        output['artists'] == 'Compatibility Test Artist',
        'Unexpected artists value.',
    )
    require(
        output['title'] == 'Compatibility Test Track',
        'Unexpected title value.',
    )
    require(
        output['released'] == '2025-09-11',
        'Unexpected release date.',
    )
    require(
        output['genre'] == 'Progressive House',
        'Unexpected genre.',
    )
    require(
        output['url'] == 'https://example.com/audio.mp3',
        'Unexpected audio URL.',
    )
    require(
        output['publisher']['name'] == 'Compatibility Label',
        'Unexpected publisher name.',
    )
    require(
        output['publisher']['url'] == 'https://example.com/label',
        'Unexpected publisher URL.',
    )
    require(
        output['album']['title'] == 'Compatibility Album',
        'Unexpected album title.',
    )
    require(
        output['album']['artists'] == 'Compatibility Album Artist',
        'Unexpected album artist.',
    )
    require(
        output['album']['trackNumber'] == '2',
        'Unexpected track number.',
    )
    require(
        output['album']['trackTotal'] == '4',
        'Unexpected track total.',
    )
    require(
        float(output['details']['duration']) > 0,
        'Expected a positive duration.',
    )

    require(
        output['musicCdId'] == 'TEST-MCDI-123',
        'Unexpected music CD ID.',
    )

    require(
        output['textFrames'] == {
            'INITIALKEY': 'Abm',
            'CATALOGNUMBER': 'CATNUM123',
            'CATALOG #': 'CATNUM123',
            'TEST,FRAME': 'Value, with comma',
            'ESCAPED,FRAME': 'Value\\, with escaped comma',
        },
        'Unexpected text frames.',
    )

    require(
        output['comments'] == [
            {
                'description': 'Test comment',
                'language': 'eng',
                'text': 'For promotional use',
            },
            {
                'description': 'Test comment',
                'language': 'epo',
                'text': 'Por reklama uzo',
            },
            {
                'description': 'Test comment with comma',
                'language': 'eng',
                'text': 'Comment, with comma',
            },
        ],
        'Unexpected comments.',
    )

    require(
        '\u0003' not in str(output),
        'Unexpected ETX character in replacement output.',
    )


def main():
    require(
        REPLACEMENT_SCRIPT.is_file(),
        f'Missing replacement script: {REPLACEMENT_SCRIPT}',
    )
    require(
        PATTERN_FILE.is_file(),
        f'Missing pattern file: {PATTERN_FILE}',
    )

    python_version = platform.python_version()
    eyed3_version = get_package_version('eyeD3')

    print(f'Python: {python_version}')
    print(f'eyeD3: {eyed3_version}')

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
        validate_output(output)

    print('Replacement output validated successfully.')
    print('Test completed successfully.')


if __name__ == '__main__':
    main()
