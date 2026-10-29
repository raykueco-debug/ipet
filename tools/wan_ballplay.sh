#!/usr/bin/env bash
# Playing with the ball, with the local Wan 2.2 tool — see tools/wan_walk.sh. The ball is NOT in the clips (it
# is ball.js's own layer, kicked by the player when the move lands); the fox moves from its standing side-on
# picture (walk / walk_r) into a move's picture and back. Pictures: GPT sheet assets/source/gpt/play_01.png
# (tools/grid_split.py, facing left; the _r ones are those pictures flipped).
#   walk_to_<move> / <move>_to_walk           facing left     17 frames each
#   walk_r_to_<move>_r / <move>_r_to_walk_r   facing right
# moves: pounce (crouch, leap, land pinning the ball), swipe (a paw bats it), bat (lies down, both paws bat it),
#        header (jumps, bumps it with the head), tail (turns, sweeps it with the tail)
# usage: bash tools/wan_ballplay.sh [seed] [move …]   (no moves: all)
set -u
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1
export TIVOT_GEN=512x512 TIVOT_FIT=1.0
IPET="$(cd "$(dirname "$0")/.." && pwd)"
COMFY="$HOME/Desktop/ComfyUI-master"
SEED="${1:-7}"
shift 2>/dev/null
MOVES="${*:-pounce swipe bat header tail}"
IN="$IPET/assets/fox/wan_in"
OUT="$IPET/assets/fox/clips"
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），在純綠色背景前的原地。'
KEEP='畫面裡只有這隻狐狸，沒有球、沒有任何物品、沒有手、沒有任何特效符號。鏡頭完全固定不動，背景始終是純綠色，主體大小不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
declare -A GO=(
  [pounce]='壓低身體、屁股翹高扭一扭，然後往前一撲，落地時兩隻前腳往前按住地面'
  [swipe]='站著舉起一隻前腳，往前用力一揮，像在拍打前面的東西'
  [bat]='往前趴下來，兩隻前腳往前伸，開心地撥弄前面的東西'
  [header]='往上一跳，抬起頭用額頭往上頂，像在頂上面的東西'
  [tail]='轉半圈，用大尾巴往前一掃，回頭看著掃出去的東西'
)
declare -A BACK=(
  [pounce]='抬起頭、收回前腳，站好'
  [swipe]='放下前腳，站好'
  [bat]='撐起身體站起來，站好'
  [header]='落地，站好'
  [tail]='轉回來，站好'
)
run() { # input  suffix  prompt  end-image
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$1" --length 17 --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "$2" --prompt "$3" --end "$4" 2>&1 | tail -3
}
cd "$COMFY/tivot_wan" || exit 1
for m in $MOVES; do
  for d in walk walk_r; do
    side=左; r=; [ $d = walk_r ] && { side=右; r=_r; }
    echo "=== ${d}_to_$m$r $(date +%T)"
    run "$IN/$d.png" "_to_$m$r" "${FOX}牠側身朝畫面${side}邊站著，${GO[$m]}，玩得很開心。動作自然流暢。$KEEP" "$IN/$m$r.png"
    echo "=== $m${r}_to_$d $(date +%T)"
    run "$IN/$m$r.png" "_to_$d" "${FOX}牠側身朝畫面${side}邊，${BACK[$m]}，恢復側身站著的樣子。動作自然流暢。$KEEP" "$IN/$d.png"
  done
done
echo "=== all done $(date +%T)"
