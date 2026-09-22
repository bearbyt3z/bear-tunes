import json
import platform
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import eyed3
from eyed3.core import Date

eyed3.log.setLevel('ERROR')

EXPECTED_PYTHON_VERSION = '3.7.17'
EXPECTED_EYED3_VERSION = '0.9.7'

WORK_DIR = Path('/work')
REPLACEMENT_SCRIPT = WORK_DIR / 'eyed3-display-plugin-replacement.py'
PATTERN_FILE = WORK_DIR / 'eyed3-display-plugin-pattern.txt'


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


def generate_test_mp3(output_directory):
    wav_path = output_directory / 'test.wav'
    mp3_path = output_directory / 'test.mp3'

    sample_rate = 44100
    duration_seconds = 0.15
    sample_count = int(sample_rate * duration_seconds)

    with wave.open(str(wav_path), 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b'\x00\x00' * sample_count)

    subprocess.run(
        [
            'lame',
            '--silent',
            str(wav_path),
            str(mp3_path),
        ],
        check=True,
    )

    return mp3_path


def write_test_metadata(mp3_path):
    audio = eyed3.load(str(mp3_path))

    require(
        audio is not None,
        'eyeD3 failed to load the generated test MP3.',
    )

    audio.initTag()

    audio.tag.artist = 'Compatibility Test Artist'
    audio.tag.title = 'Compatibility Test Track'
    audio.tag.release_date = Date(2025, 9, 11)
    audio.tag.genre = 'Progressive House'
    audio.tag.audio_file_url = 'https://example.com/audio.mp3'
    audio.tag.publisher = 'Compatibility Label'
    audio.tag.publisher_url = 'https://example.com/label'
    audio.tag.album = 'Compatibility Album'
    audio.tag.album_artist = 'Compatibility Album Artist'
    audio.tag.track_num = (2, 4)

    audio.tag.save()


def run_replacement(mp3_path):
    result = subprocess.run(
        [
            sys.executable,
            str(REPLACEMENT_SCRIPT),
            str(PATTERN_FILE),
            str(mp3_path),
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
        output['textFrames'] == {},
        'Expected no user text frames.',
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

    require(
        python_version == EXPECTED_PYTHON_VERSION,
        f'Expected Python {EXPECTED_PYTHON_VERSION}, '
        f'got {python_version}.',
    )
    require(
        eyed3_version == EXPECTED_EYED3_VERSION,
        f'Expected eyeD3 {EXPECTED_EYED3_VERSION}, '
        f'got {eyed3_version}.',
    )

    with tempfile.TemporaryDirectory() as temporary_directory:
        test_directory = Path(temporary_directory)

        print('Generating test MP3...')
        mp3_path = generate_test_mp3(test_directory)

        print('Writing test metadata...')
        write_test_metadata(mp3_path)

        print('Running eyed3-display-plugin-replacement.py...')
        output = run_replacement(mp3_path)

        print('Validating replacement output...')
        validate_output(output)

    print('Replacement output validated successfully.')
    print('Test completed successfully.')


if __name__ == '__main__':
    main()
