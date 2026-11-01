#!/usr/bin/env bash
# Some of the pet's clips (with their tail) made again after their pictures were fixed (assets/fox/wan_in/<pose>.png):
# every tools/wan_*.sh as it is, through tools/plain_redo_shim.py, which makes only the clips named and puts them in
# place of the old ones (kept frames, exits… as theirs were; the old ones in assets/fox/wan_tries_plain).
# usage: bash tools/plain_redo.sh clip1 clip2 …      (~2 min a clip)
set -u
IPET="$(cd "$(dirname "$0")/.." && pwd)"
SHIM="$IPET/tools/plain_redo_shim.py"
export REDO="$*"
shimmed() { sed -e "s#tivot_wan.py#$SHIM#g"   -e 's#^for a in ${ACTS-.*; do$#& [[ -v GO[$a] ]] || continue;#'   -e 's#^for a in ${LOOPS:-}; do$#& [[ -v HOLD[$a] ]] || continue;#'   "$IPET/tools/$1" > "$IPET/tools/_redo_$1"; echo "$IPET/tools/_redo_$1"; }
cd "$IPET/assets/fox/clips"
ACTS="$(ls -d normal_to_* | sed 's/^normal_to_//' | tr '\n' ' ')"
LOOPS="$(ls -d *_loop | sed 's/_loop$//' | tr '\n' ' ')"
export ACTS LOOPS
for s in wan_actions.sh; do bash "$(shimmed $s)" 7; done
rm -f "$IPET"/tools/_redo_*.sh
echo "##### all done $(date +%T)"
