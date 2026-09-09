# bear-tunes

[![CI](https://github.com/bearbyt3z/bear-tunes/actions/workflows/ci.yml/badge.svg)](https://github.com/bearbyt3z/bear-tunes/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](./LICENSE)

A TypeScript CLI tool for organizing and enriching digital music libraries.

**bear-tunes** automates audio conversion, metadata lookup, tagging, file renaming, and artwork handling, with Beatport used as the primary metadata source.

## Features

* Process **MP3, FLAC, and AIFF** audio files.
* Recursively scan directory trees for supported audio files.
* Convert **AIFF → FLAC** and **FLAC → MP3**.
* Resolve track metadata from **Beatport**.
* Match local tracks with remote metadata using track and filename information.
* Write metadata to **ID3** and **FLAC tags**.
* Rename and organize files using metadata-driven patterns.
* Download and embed album artwork and additional image metadata.
* Handle ambiguous matches and significant duration differences interactively.
* Provide structured error handling and verbose logging.
* Run automated linting, type checking, and builds through GitHub Actions.

## How It Works

At a high level, bear-tunes processes each supported audio file through a metadata-driven pipeline:

```text
Input directory
      │
      ▼
Audio file detection
      │
      ├── MP3 ───────────────┐
      ├── FLAC ──────────────┤
      └── AIFF → FLAC ───────┤
                             ▼
                     Metadata resolution
                             │
                             ▼
                     Beatport data provider
                             │
                             ▼
                    Tagging & metadata update
                             │
                             ▼
                       File renaming
                             │
                             ▼
                     Artwork processing
                             │
                             ▼
                       Organized output
```

The application separates the main processing responsibilities into dedicated modules such as the **processor**, **converter**, **tagger**, **renamer**, and **data provider** layers.

## Tech Stack

* **TypeScript**
* **Node.js 20+**
* **Zod** for runtime data validation
* **Playwright** for browser-based data retrieval
* **Winston** for logging
* **eyeD3** for MP3 metadata handling
* **FLAC / metaflac** for FLAC metadata and audio processing
* **LAME** for MP3 encoding
* **GitHub Actions** for continuous integration

## Requirements

### Runtime

* Node.js **20 or newer**
* npm
* Python 3 with the `eyeD3` package
* `flac`
* `metaflac`
* `lame`

The project invokes some audio and metadata tools as external processes, so they must be available in the system `PATH`.

## Installation

Clone the repository and install the Node.js dependencies:

```bash
git clone https://github.com/bearbyt3z/bear-tunes.git
cd bear-tunes
npm ci
```

Install the Playwright browser required by the project:

```bash
npm run setup
```

Build the application:

```bash
npm run build
```

## Usage

The CLI accepts an optional input directory and an optional output directory:

```bash
npm run start -- [input-directory] [output-directory]
```

For example:

```bash
npm run start -- ./music ./organized
```

When no input directory is provided, the current working directory is used.

The application recursively scans the input directory and processes supported audio files.

### Development shortcut

Build the project and start the CLI in one command:

```bash
npm run build-start -- ./music ./organized
```

## File Organization

By default, bear-tunes uses metadata-driven patterns for filenames and directories.

The default filename pattern is:

```text
%artists% - %title%
```

The default directory pattern is:

```text
%genre%/%artists%
```

This allows processed files to be organized using metadata rather than their original filenames.

## Development

Available npm scripts include:

```bash
npm run lint
npm run typecheck
npm run build
npm run check
```

`npm run check` runs the project's main quality gates:

```text
lint → typecheck → build
```

The same checks are executed automatically in GitHub Actions for pushes to `master` and for pull requests.

## Project Structure

```text
src/
├── converter/        Audio format conversion
├── data-provider/    External metadata providers (e.g. Beatport)
├── logger/           Application logging
├── normalizer/       Metadata normalization
├── processor/        Main processing pipeline
├── renamer/          File and directory organization
├── shared-types/     Shared domain models and validation
├── tagger/           Audio metadata reading and writing
└── tools/            Shared utilities and integrations

.github/
└── workflows/        Continuous integration

eyed3-display-plugin.py
                      MP3 metadata extraction helper
```

## Notes

bear-tunes currently relies on Beatport as its metadata provider. When metadata cannot be matched confidently, the application may ask for user confirmation rather than silently applying an uncertain match.

The AIFF processing pipeline converts the source file to FLAC and removes the original AIFF file after a successful conversion. Make sure you have a backup when processing files that should be preserved unchanged.

## License

This project is licensed under the GNU General Public License v3.0 or later. See the [LICENSE](./LICENSE) file for details.
