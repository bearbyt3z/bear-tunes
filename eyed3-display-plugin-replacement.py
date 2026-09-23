#!/opt/pipx/venvs/eyed3/bin/python

import sys

import eyed3


def get_nested_attribute_value(obj, *attributes):
    """Return a nested attribute value as text suitable for pattern replacement.

    Attributes are resolved in the order provided. Missing attributes and
    ``None`` values are replaced with an empty string.

    Boolean values are converted to lowercase ``true`` or ``false`` so they
    can be used as JSON boolean literals. Numeric values are preserved,
    including zero. Other empty values are replaced with an empty string,
    while strings and other non-empty values are converted with ``str()``.

    A boolean placeholder must not be enclosed in quotes in the pattern file
    when the resulting value is expected to remain a JSON boolean.
    """
    value = obj

    for attribute in attributes:
        if value is None:
            return ''

        value = getattr(value, attribute, None)

    if value is None:
        return ''

    if isinstance(value, bool):
        return 'true' if value else 'false'

    if isinstance(value, (int, float)):
        return str(value)

    if not value:
        return ''

    return str(value)


# Validate command-line arguments
if len(sys.argv) != 3:
    print(
        'Error: Exactly two arguments are required: pattern file and audio file\n'
        f'Usage: {sys.argv[0]} pattern_file audio_file',
        file=sys.stderr,
    )
    sys.exit(1)

# Load pattern file
pattern_file_path = sys.argv[1]

try:
    with open(pattern_file_path) as f:
        pattern = f.read()
except OSError as error:
    print(
        f'Error: Unable to read pattern file: {error}',
        file=sys.stderr,
    )
    sys.exit(2)

if not pattern.strip():
    print(
        'Error: Pattern file is empty',
        file=sys.stderr,
    )
    sys.exit(2)

# Suppress eyeD3 warnings such as "Non standard genre name: ..."
eyed3.log.setLevel('ERROR')

# Load audio file
audio_file_path = sys.argv[2]

try:
    audio = eyed3.load(audio_file_path)
except OSError as error:
    print(
        f'Error: Unable to load audio file: {error}',
        file=sys.stderr,
    )
    sys.exit(3)

if audio is None:
    print(
        f'Error: Unsupported audio file type: {audio_file_path}',
        file=sys.stderr,
    )
    sys.exit(3)

# Metadata replacements
metadata_replacements = {
    # Track metadata
    '%artist%': ('tag', 'artist'),
    '%title%': ('tag', 'title'),
    '%release-date%': ('tag', 'release_date'),
    '%genre%': ('tag', 'genre'),
    '%audio-file-url%': ('tag', 'audio_file_url'),
    '%comments%': ('tag', 'comments'),
    '%music-cd-id%': ('tag', 'cd_id'),

    # Publisher/Label metadata
    '%publisher%': ('tag', 'publisher'),
    '%publisher-url%': ('tag', 'publisher_url'),

    # Album metadata
    '%album%': ('tag', 'album'),
    '%album-artist%': ('tag', 'album_artist'),
    '%track%': ('tag', 'track_num', 'count'),
    '%track-total%': ('tag', 'track_num', 'total'),

    # Track length in seconds
    '$length()': ('info', 'time_secs'),
}

for placeholder, attributes in metadata_replacements.items():
    pattern = pattern.replace(
        placeholder,
        get_nested_attribute_value(audio, *attributes),
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
