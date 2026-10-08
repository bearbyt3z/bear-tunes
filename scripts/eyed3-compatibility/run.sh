#!/usr/bin/env bash

set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run the eyeD3 compatibility test." >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd -- "$script_dir/../.." && pwd)

image_name='bear-tunes-eyed3-compatibility'

python_version="${PYTHON_VERSION:-3.10.18}"
requirements_file="${REQUIREMENTS_FILE:-python-requirements.txt}"

python_venv_directory="$(
  cd "$repo_dir" &&
  node \
    --conditions=setup \
    --input-type=module \
    --eval 'import { PYTHON_VENV_DIRECTORY } from "#config"; process.stdout.write(PYTHON_VENV_DIRECTORY);'
)"

cleanup() {
  docker image rm "$image_name" >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "Building eyeD3 compatibility test image..."
docker build \
  --build-arg "PYTHON_VERSION=${python_version}" \
  --build-arg "REQUIREMENTS_FILE=${requirements_file}" \
  --build-arg "PYTHON_VENV_DIRECTORY=${python_venv_directory}" \
  --file "$script_dir/Dockerfile" \
  --tag "$image_name" \
  "$repo_dir"

echo "Running eyeD3 compatibility test suite..."
docker run --rm \
  "$image_name"
