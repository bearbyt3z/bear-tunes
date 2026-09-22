#!/usr/bin/env bash

set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run the eyeD3 compatibility test." >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd -- "$script_dir/../.." && pwd)
image_name='bear-tunes-eyed3-compatibility'

cleanup() {
  docker image rm "$image_name" >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "Building eyeD3 compatibility test image..."

docker build \
  --tag "$image_name" \
  "$script_dir"

echo "Running eyeD3 compatibility test..."

docker run --rm \
  --volume "$repo_dir:/work:ro" \
  --workdir /work \
  "$image_name"
