#!/usr/bin/env bash
# tools/wan_tailless.sh, again and again until a pass makes nothing new (clips it skipped because their tail-less
# pictures weren't in yet get made on the next), then the roots of them all (tools/tail_pics.py, tail_roots.py).
cd "$(dirname "$0")/.."
while :; do
  before=$(ls assets/fox/clips_notail | wc -l)
  bash tools/wan_tailless.sh
  after=$(ls assets/fox/clips_notail | wc -l)
  echo "##### pass: $before → $after clips"
  [ "$after" -le "$before" ] && break
done
python tools/tail_pics.py && python tools/tail_roots.py
echo "##### done $(date +%T)"
