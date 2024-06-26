#!/opt/pipx/venvs/eyed3/bin/python

import sys
import eyed3

if len(sys.argv) < 3:
  print(f'Error: Pattern file and/or audio file parameters are missing\nUsage: {argv[0]} pattern_file audio_file', file=sys.stderr)
  sys.exit(1)

pattern_file_path = sys.argv[1]
with open(pattern_file_path) as f: pattern = f.read()

if len(pattern) < 6:
  print('Error: Pattern file have to be specified as the first parameter', file=sys.stderr)
  sys.exit(2)

eyed3.log.setLevel('ERROR') # prevent from printing warnings e.g.: Non standard genre name: ...

audio = eyed3.load(sys.argv[2])

pattern = pattern.replace('%artist%', str(audio.tag and audio.tag.artist or ''))
pattern = pattern.replace('%title%', str(audio.tag and audio.tag.title or ''))
pattern = pattern.replace('%release-date%', str(audio.tag and audio.tag.release_date or ''))
pattern = pattern.replace('%genre%', str(audio.tag and audio.tag.genre or ''))
pattern = pattern.replace('%audio-file-url%', str(audio.tag and audio.tag.audio_file_url or ''))
pattern = pattern.replace('%comments%', str(audio.tag and audio.tag.comments or ''))
pattern = pattern.replace('%music-cd-id%', str(audio.tag and audio.tag.cd_id or ''))
pattern = pattern.replace('%publisher%', str(audio.tag and audio.tag.publisher or ''))
pattern = pattern.replace('%publisher-url%', str(audio.tag and audio.tag.publisher_url or ''))

# Album entries:
pattern = pattern.replace('%album%', str(audio.tag and audio.tag.album or ''))
pattern = pattern.replace('%album-artist%', str(audio.tag and audio.tag.album_artist or ''))
pattern = pattern.replace('%track%', str(audio.tag and audio.tag.track_num.count or ''))
pattern = pattern.replace('%track-total%', str(audio.tag and audio.tag.track_num.total or ''))

pattern = pattern.replace('$length()', str(audio.info and audio.info.time_secs or ''))

user_text_frames = ''
for frame in audio.tag and audio.tag.user_text_frames or []:
  user_text_frames += f'"{frame.description}": "{frame.text}"\\, '

pattern = pattern.replace('%texts,output="#d": "#t"\\,%', user_text_frames)

pattern = pattern.replace('\\,', ',') # replace comma escapers in the pattern file

print(pattern)
