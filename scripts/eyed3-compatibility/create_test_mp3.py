import subprocess
import sys
import wave
from pathlib import Path

import eyed3
from eyed3.core import Date


eyed3.log.setLevel('ERROR')


def require(condition, message):
    if not condition:
        raise AssertionError(message)


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
    audio.tag.audio_file_url = '\u0003https://example.com/audio.mp3'
    audio.tag.publisher = 'Compatibility Label'
    audio.tag.publisher_url = 'https://example.com/label'
    audio.tag.album = 'Compatibility Album'
    audio.tag.album_artist = 'Compatibility Album Artist'
    audio.tag.track_num = (2, 4)

    audio.tag.cd_id = b'TEST-MCDI-123'

    audio.tag.user_text_frames.set(
        'Abm',
        'INITIALKEY',
    )
    audio.tag.user_text_frames.set(
        'CATNUM123',
        'CATALOGNUMBER',
    )
    audio.tag.user_text_frames.set(
        'CATNUM123',
        'CATALOG #',
    )
    audio.tag.user_text_frames.set(
        'Value, with comma',
        'TEST,FRAME',
    )
    audio.tag.user_text_frames.set(
        'Value\\, with escaped comma',
        'ESCAPED,FRAME',
    )

    audio.tag.comments.set(
        'For promotional use',
        'Test comment',
        b'eng',
    )
    audio.tag.comments.set(
        'Por reklama uzo',
        'Test comment',
        b'epo',
    )
    audio.tag.comments.set(
        'Comment, with comma',
        'Test comment with comma',
        b'eng',
    )

    audio.tag.save()


def create_test_mp3(output_directory):
    output_directory = Path(output_directory)
    mp3_path = generate_test_mp3(output_directory)
    write_test_metadata(mp3_path)
    return mp3_path


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(
            'Usage: create_test_mp3.py output_directory',
            file=sys.stderr,
        )
        sys.exit(1)

    create_test_mp3(sys.argv[1])
