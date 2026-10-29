#!/usr/bin/env bash
# Running after the ball, with the local Wan 2.2 tool — see tools/wan_walk.sh. A bounding run in place on the
# standing side-on picture, so it fits everything walking does (turns, ball-play moves, sitting down):
#   walk_loop_run / walk_r_loop_run   bounding along, facing left / right   25 → 24-frame loop
# fox2d.js plays them (not the walk loops) while it chases the ball, and app.js moves the fox faster meanwhile.
# usage: bash tools/wan_run.sh [seed] [clip …]   (no clips: all)
set -u
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1
export TIVOT_GEN=512x512 TIVOT_FIT=1.0
IPET="$(cd "$(dirname "$0")/.." && pwd)"
COMFY="$HOME/Desktop/ComfyUI-master"
SEED="${1:-7}"
shift 2>/dev/null
ONLY=" $* "
want() { [ "$ONLY" = "  " ] || [[ "$ONLY" == *" $1 "* ]]; }
IN="$IPET/assets/fox/wan_in"
OUT="${OUT:-$IPET/assets/fox/clips}"
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），在純綠色背景前。'
KEEP='側身的時候，頭和臉始終是正側面、朝著前進的方向，不回頭、不轉頭看鏡頭。畫面裡只有這隻狐狸，沒有手、沒有碗、沒有玩具、沒有任何特效符號。鏡頭完全固定不動，背景始終是純綠色，主體大小不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
cd "$COMFY/tivot_wan" || exit 1
for d in walk walk_r; do
  side=左; [ $d = walk_r ] && side=右
  want ${d}_loop_run || continue
  echo "=== ${d}_loop_run $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/$d.png" --length 25 --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "_loop_run" --prompt "${FOX}牠側身朝畫面${side}邊，在原地全速奔跑，像兔子一樣一蹦一蹦地跳躍前進：後腳用力一蹬，身體向${side}拉長伸展，四隻腳同時離地騰空，然後前腳先落地、後腳再收到前面，再蹬地跳起，跳了兩下。耳朵往後貼，大尾巴在身後水平飄起，嘴巴開開很興奮。身體位置不前進、不移動，像在跑步機上。最後回到開始的姿勢。$KEEP" 2>&1 | tail -3
done
# running away from us, for the mini game (runner.js): the fox seen from behind, its tail(s) in full view
if want walk_back_loop_run; then
  echo "=== walk_back_loop_run $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/walk_back.png" --length 25 --fps 16     --seed "$SEED" --out "$OUT" --suffix "_loop_run" --prompt "${FOX}牠背對你，在原地全速往前跑，像小狗開心地奔跑一樣一蹦一蹦：後腳用力蹬地、前腳往前伸，身體一彈一彈地上下起伏，大尾巴在身後左右大大地甩動，耳朵往後貼。身體位置不前進、不移動、大小不變，像在跑步機上。最後回到開始的姿勢。$KEEP" 2>&1 | tail -3
fi
echo "=== all done $(date +%T)"
