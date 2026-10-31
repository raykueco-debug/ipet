#!/usr/bin/env bash
# All the pet's clips made again without the tail (docs/tailless.md): every tools/wan_*.sh as it is, but calling
# tools/notail_shim.py in place of tivot_wan.py — tail-less pictures in, assets/fox/clips_notail out, no tail in the
# prompts, made ones skipped (so it can be stopped and run again). The actions and their loops: the ones that were
# made (a clip there in assets/fox/clips), as they were.
# usage: bash tools/wan_tailless.sh            (hours: ~1.5 min a clip)
set -u
IPET="$(cd "$(dirname "$0")/.." && pwd)"
SHIM="$IPET/tools/notail_shim.py"
shimmed() { sed "s#tivot_wan.py#$SHIM#g" "$IPET/tools/$1" > "$IPET/tools/_notail_$1"; echo "$IPET/tools/_notail_$1"; } # (beside the real one: it finds the project from where it is)
cd "$IPET/assets/fox/clips"
ACTS="$(ls -d normal_to_* | sed 's/^normal_to_//' | tr '\n' ' ')"
LOOPS="$(ls -d *_loop | sed 's/_loop$//' | tr '\n' ' ')"
export ACTS LOOPS
for what in all talk moods2 home; do bash "$(shimmed wan_clips.sh)" 7 $what; done
for s in wan_actions.sh wan_walk.sh wan_look.sh wan_eat.sh wan_sleep.sh wan_ready.sh wan_rub.sh wan_ballplay.sh wan_run.sh; do
  echo "##### $s $(date +%T)"
  bash "$(shimmed $s)" 7
done
rm -f "$IPET"/tools/_notail_*.sh
echo "##### all done $(date +%T)"
