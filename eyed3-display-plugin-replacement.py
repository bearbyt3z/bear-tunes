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


def get_music_cd_id(audio):
    """Return the music CD ID decoded as ASCII text.

    Returns an empty string when the audio tag does not contain a music CD ID.
    """
    value = audio.tag and audio.tag.cd_id

    if value is None:
        return ''

    return value.decode('ascii')


def find_unescaped_character(text, character, start=0):
    """Find the first unescaped occurrence of a character in text.

    Backslash escapes the following character. Escaped occurrences of
    ``character`` are ignored.

    Args:
        text: Text to search.
        character: Character to find.
        start: Index at which to start the search.

    Returns:
        The index of the first unescaped occurrence, or ``-1`` when the
        character is not found.
    """
    escaped = False

    for index in range(start, len(text)):
        current = text[index]

        if escaped:
            escaped = False
            continue

        if current == '\\':
            escaped = True
            continue

        if current == character:
            return index

    return -1


def split_unescaped(text, separator=','):
    """Split text at unescaped separator characters.

    A backslash escapes the following character, so escaped separators are
    preserved as part of the surrounding text.

    Args:
        text: Text to split.
        separator: Character used as the separator.

    Returns:
        A list of text segments split at unescaped separators.
    """
    parts = []
    start = 0
    escaped = False

    for index, current in enumerate(text):
        if escaped:
            escaped = False
            continue

        if current == '\\':
            escaped = True
            continue

        if current == separator:
            parts.append(text[start:index])
            start = index + 1

    parts.append(text[start:])

    return parts


def parse_frame_tag_parameters(tag_expression):
    """Parse parameters from an eyeD3 display-plugin frame tag.

    Parameters are separated by unescaped commas and their names and values
    are separated by the first unescaped equals sign.

    Args:
        tag_expression: Frame tag expression containing its parameters.

    Returns:
        A mapping of parameter names to their raw values.
    """
    parameters = {}

    for parameter in split_unescaped(tag_expression)[1:]:
        separator_index = find_unescaped_character(parameter, '=')

        if separator_index == -1:
            continue

        parameters[parameter[:separator_index]] = parameter[separator_index + 1:]

    return parameters


def unescape_pattern_text(text):
    """Unescape display-plugin pattern text using eyeD3 escape sequences.

    Supported escape sequences are ``\\\\``, ``\\%``, ``\\$``, ``\\,``, ``\\(``,
    ``\\)``, ``\\=``, ``\\n``, and ``\\t``.

    Args:
        text: Pattern text containing display-plugin escape sequences.

    Returns:
        The unescaped pattern text.

    Raises:
        ValueError: If the text contains an incomplete or unsupported escape
            sequence.
    """
    escape_sequences = {
        '\\': '\\',
        '%': '%',
        '$': '$',
        ',': ',',
        '(': '(',
        ')': ')',
        '=': '=',
        'n': '\n',
        't': '\t',
    }

    result = ''
    index = 0

    while index < len(text):
        if text[index] != '\\':
            result += text[index]
            index += 1
            continue

        if index + 1 >= len(text):
            raise ValueError('Pattern ends with an incomplete escape sequence')

        escape_character = text[index + 1]

        if escape_character not in escape_sequences:
            raise ValueError(
                f'Unknown pattern escape sequence: \\{escape_character}',
            )

        result += escape_sequences[escape_character]
        index += 2

    return result


def replace_frame_placeholders(text, replacements):
    """Replace display-plugin frame placeholders in output text.

    Each placeholder is replaced with the corresponding frame value without
    interpreting the surrounding output format.

    Args:
        text: Output pattern containing frame placeholders.
        replacements: Ordered pairs of placeholder names and their values.

    Returns:
        The output pattern with all provided placeholders replaced.
    """
    if not replacements:
        return text

    placeholder, value = replacements[0]
    replacement = '' if value is None else str(value)

    return replacement.join(
        replace_frame_placeholders(part, replacements[1:])
        for part in text.split(placeholder)
    )


def replace_frame_tag(
    pattern,
    tag_name,
    frames,
    get_replacements,
    default_output,
):
    """Replace a frame collection tag using its display-plugin output pattern.

    This mechanism is inspired by eyeD3's original display plugin. It resolves
    the tag's ``output`` and ``separation`` parameters and replaces display-plugin
    placeholders such as ``#d``, ``#l``, and ``#t``.

    The helper does not assume JSON or any other output format. The surrounding
    structure remains fully controlled by the pattern file.

    Args:
        pattern: Full display-plugin pattern text.
        tag_name: Name of the frame collection tag, such as ``texts`` or
            ``comments``.
        frames: Frame collection to render.
        get_replacements: Function returning placeholder/value pairs for a frame.
        default_output: Output pattern used when the tag does not provide an
            ``output`` parameter.

    Returns:
        The pattern with all matching frame collection tags replaced.
    """
    tag_marker = f'%{tag_name}'
    search_from = 0

    while True:
        tag_start = pattern.find(tag_marker, search_from)

        if tag_start == -1:
            return pattern

        tag_end = find_unescaped_character(
            pattern,
            '%',
            tag_start + len(tag_marker),
        )

        if tag_end == -1:
            return pattern

        tag_expression = pattern[tag_start + 1:tag_end]
        parameters = parse_frame_tag_parameters(tag_expression)

        output_pattern = unescape_pattern_text(
            parameters.get('output', default_output),
        )
        separation = unescape_pattern_text(
            parameters.get('separation', '\\n'),
        )

        outputs = []

        for frame in frames:
            outputs.append(
                replace_frame_placeholders(
                    output_pattern,
                    get_replacements(frame),
                ),
            )

        replacement = separation.join(outputs)

        pattern = (
            pattern[:tag_start]
            + replacement
            + pattern[tag_end + 1:]
        )

        search_from = tag_start + len(replacement)


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

# Music CD ID
pattern = pattern.replace(
    '%music-cd-id%',
    get_music_cd_id(audio),
)

# User-defined text frames
pattern = replace_frame_tag(
    pattern,
    'texts',
    audio.tag and audio.tag.user_text_frames or [],
    lambda frame: (
        ('#d', frame.description),
        ('#t', frame.text),
    ),
    'UserTextFrame: [Description: #d] #t',
)

# Comments
pattern = replace_frame_tag(
    pattern,
    'comments',
    audio.tag and audio.tag.comments or [],
    lambda comment: (
        ('#d', comment.description),
        ('#l', comment.lang.decode('ascii')),
        ('#t', comment.text),
    ),
    'Comment: [Description: #d] [Lang: #l]: #t',
)

# Replace escaped commas in the pattern
pattern = pattern.replace('\\,', ',')

print(pattern)
