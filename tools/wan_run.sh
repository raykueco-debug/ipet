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
# bounding away from us, pounce after pounce, for the mini game: from the crouch up into the air and down into
# the crouch again (pictures back_crouch / back_air, GPT sheet assets/source/gpt/back_03.png: the front legs together in the middle, just peeking out between the back legs)
if want back_crouch_to_back_air; then
  echo "=== back_crouch_to_back_air $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/back_crouch.png" --length 25 --fps 16     --seed "$SEED" --out "$OUT" --suffix "_to_back_air" --end "$IN/back_air.png" --prompt "${FOX}牠背對你壓低身體，後腳用力一蹬，往前上方高高撲跳起來，後腳收起、尾巴翹高，背對你。前腳併在身體中間、被身體擋住，只從兩條後腿之間露出一點點，不會伸到身體兩側。動作有力、自然流暢。$KEEP" 2>&1 | tail -3
fi
if want back_air_to_back_crouch; then
  echo "=== back_air_to_back_crouch $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/back_air.png" --length 25 --fps 16     --seed "$SEED" --out "$OUT" --suffix "_to_back_crouch" --end "$IN/back_crouch.png" --prompt "${FOX}牠背對你在空中，往前落地，身體壓低蓄力準備再撲，背對你。前腳併在身體中間、被身體擋住，只從兩條後腿之間露出一點點，不會伸到身體兩側。動作有力、自然流暢。$KEEP" 2>&1 | tail -3
fi
# sliding under the bars in the mini game: low in its crouch, gliding along on its belly, from behind
if want back_crouch_loop_slide; then
  echo "=== back_crouch_loop_slide $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/back_crouch.png" --length 25 --fps 16     --seed "$SEED" --out "$OUT" --suffix "_loop_slide" --prompt "${FOX}牠背對你，身體壓得很低、肚子貼著地面往前滑行，耳朵往後貼平，大尾巴往後水平拖著隨風飄動，身體微微左右晃，很開心。前腳併在身體中間、被身體擋住，只從兩條後腿之間露出一點點。身體位置不前進、大小不變。最後回到開始的姿勢。$KEEP" 2>&1 | tail -3
fi
# the mini game's mishaps, from behind, back to its crouch after: missed a ditch — down into it, the front paws on its
# edge, scrambling out (the ditch is the game's: it hides the fox's lower half meanwhile); tripped on something
if want back_crouch_to_back_crouch_fall; then
  echo "=== back_crouch_to_back_crouch_fall $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/back_crouch.png" --length 25 --fps 16     --seed "$SEED" --out "$OUT" --suffix "_to_back_crouch_fall" --end "$IN/back_crouch.png" --prompt "${FOX}牠背對你，一腳踩空往下掉，整個身體往下沉，只剩頭和兩隻前腳往上伸，前腳攀住上方的邊緣，然後用力撐起身體、後腳蹬著往上爬，爬回原本壓低的姿勢，甩甩頭。背對你。動作自然流暢。$KEEP" 2>&1 | tail -3
fi
if want back_crouch_to_back_crouch_trip; then
  echo "=== back_crouch_to_back_crouch_trip $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/back_crouch.png" --length 25 --fps 16     --seed "$SEED" --out "$OUT" --suffix "_to_back_crouch_trip" --end "$IN/back_crouch.png" --prompt "${FOX}牠背對你，被絆了一下，身體往前一顛、差點跌倒，屁股和尾巴往上一翹又落下，晃了晃站穩，回到原本壓低的姿勢。背對你。動作自然流暢、有點可愛的慌張。$KEEP" 2>&1 | tail -3
fi
echo "=== all done $(date +%T)"
