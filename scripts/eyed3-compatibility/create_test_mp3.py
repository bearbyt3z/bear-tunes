import json
import subprocess
import sys
import wave
from pathlib import Path

import eyed3
from eyed3.core import Date


eyed3.log.setLevel('ERROR')

TEST_METADATA_FILE = Path(__file__).resolve().with_name('test_metadata.json')


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


def write_test_metadata(mp3_path, metadata):
    audio = eyed3.load(str(mp3_path))

    require(
        audio is not None,
        'eyeD3 failed to load the generated test MP3.',
    )

    audio.initTag()

    audio.tag.artist = metadata['artist']
    audio.tag.title = metadata['title']

    year, month, day = (
        int(part)
        for part in metadata['releaseDate'].split('-')
    )
    audio.tag.release_date = Date(year, month, day)

    audio.tag.genre = metadata['genre']
    audio.tag.audio_file_url = metadata['audioFileUrl']
    audio.tag.publisher = metadata['publisher']['name']
    audio.tag.publisher_url = metadata['publisher']['url']
    audio.tag.album = metadata['album']['title']
    audio.tag.album_artist = metadata['album']['artist']
    audio.tag.track_num = (
        metadata['album']['trackNumber'],
        metadata['album']['trackTotal'],
    )

    audio.tag.cd_id = metadata['musicCdId'].encode('ascii')

    for description, text in metadata['textFrames'].items():
        audio.tag.user_text_frames.set(
            text,
            description,
        )

    for comment in metadata['comments']:
        audio.tag.comments.set(
            comment['text'],
            comment['description'],
            comment['language'].encode('ascii'),
        )

    audio.tag.save()


def create_test_mp3(output_directory):
    output_directory = Path(output_directory)

    with TEST_METADATA_FILE.open(encoding='utf-8') as metadata_file:
        metadata = json.load(metadata_file)

    mp3_path = generate_test_mp3(output_directory)
    write_test_metadata(mp3_path, metadata)

    return mp3_path


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(
            'Usage: create_test_mp3.py output_directory',
            file=sys.stderr,
        )
        sys.exit(1)

    create_test_mp3(sys.argv[1])
