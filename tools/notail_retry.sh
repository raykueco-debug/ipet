#!/usr/bin/env bash
# The tail-less clips Wan grew the tail back in (by eye: docs/tailless.md), made again with other seeds. Each try is
# kept in assets/fox/wan_tries_notail/<clip>/<seed>/ to pick the best of; the last one made stays in clips_notail.
# usage: bash tools/notail_retry.sh "seed1 seed2" clip1 clip2 ...
cd "$(dirname "$0")/.."
SEEDS="$1"; shift
for seed in $SEEDS; do
  for c in "$@"; do mkdir -p assets/fox/wan_tries_notail/$c; [ -d assets/fox/clips_notail/$c ] && mv assets/fox/clips_notail/$c assets/fox/wan_tries_notail/$c/prev_$seed; done
  NOTAIL_SEED=$seed bash tools/wan_tailless.sh
  for c in "$@"; do [ -d assets/fox/clips_notail/$c ] && cp -r assets/fox/clips_notail/$c assets/fox/wan_tries_notail/$c/$seed; done
  echo "##### seed $seed done $(date +%T)"
done
