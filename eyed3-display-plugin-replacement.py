#!/opt/pipx/venvs/eyed3/bin/python

import sys

import eyed3


# Validate command-line arguments
if len(sys.argv) < 3:
    print(
        'Error: Pattern file and/or audio file parameters are missing\n'
        f'Usage: {argv[0]} pattern_file audio_file',
        file=sys.stderr,
    )
    sys.exit(1)

# Load pattern file
pattern_file_path = sys.argv[1]
with open(pattern_file_path) as f:
    pattern = f.read()

if len(pattern) < 6:
    print(
        'Error: Pattern file have to be specified as the first parameter',
        file=sys.stderr,
    )
    sys.exit(2)

# Suppress eyeD3 warnings such as "Non standard genre name: ..."
eyed3.log.setLevel('ERROR')

# Load audio file
audio = eyed3.load(sys.argv[2])

# Track metadata
pattern = pattern.replace(
    '%artist%',
    str(audio.tag and audio.tag.artist or ''),
)

pattern = pattern.replace(
    '%title%',
    str(audio.tag and audio.tag.title or ''),
)

pattern = pattern.replace(
    '%release-date%',
    str(audio.tag and audio.tag.release_date or ''),
)

pattern = pattern.replace(
    '%genre%',
    str(audio.tag and audio.tag.genre or ''),
)

pattern = pattern.replace(
    '%audio-file-url%',
    str(audio.tag and audio.tag.audio_file_url or ''),
)

pattern = pattern.replace(
    '%comments%',
    str(audio.tag and audio.tag.comments or ''),
)

pattern = pattern.replace(
    '%music-cd-id%',
    str(audio.tag and audio.tag.cd_id or ''),
)

pattern = pattern.replace(
    '%publisher%',
    str(audio.tag and audio.tag.publisher or ''),
)

pattern = pattern.replace(
    '%publisher-url%',
    str(audio.tag and audio.tag.publisher_url or ''),
)

# Album metadata
pattern = pattern.replace(
    '%album%',
    str(audio.tag and audio.tag.album or ''),
)

pattern = pattern.replace(
    '%album-artist%',
    str(audio.tag and audio.tag.album_artist or ''),
)

pattern = pattern.replace(
    '%track%',
    str(audio.tag and audio.tag.track_num.count or ''),
)

pattern = pattern.replace(
    '%track-total%',
    str(audio.tag and audio.tag.track_num.total or ''),
)

# Track length in seconds
pattern = pattern.replace(
    '$length()',
    str(audio.info and audio.info.time_secs or ''),
)

# User-defined text frames
user_text_frames = ''
for frame in audio.tag and audio.tag.user_text_frames or []:
    user_text_frames += f'"{frame.description}": "{frame.text}"\\, '

pattern = pattern.replace(
    '%texts,output="#d": "#t"\\,%',
    user_text_frames,
)

# Replace escaped commas in the pattern
pattern = pattern.replace('\\,', ',')

print(pattern)
