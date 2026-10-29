#!/usr/bin/env bash
# Following the ball with its head, with the local Wan 2.2 tool — see tools/wan_clips.sh. The player holds the
# ball up: the fox sits looking up (the picture look_up, the same as the look_up action: normal_to_look_up /
# look_up_to_normal get it there and back) and its head follows the ball.
#   look_up_loop_look_l / look_up_loop_look_r   from look_up to look_far_l / look_far_r (GPT sheet
#                     assets/source/gpt/look_01.png): the head and eyes turn to follow something to the left /
#                     right, still looking up — not played but scrubbed: fox2d.js shows the frame for
#                     where the ball is (frame 0 = the look_up picture)                 25 frames
#   look_up_to_walk / look_up_to_walk_r   up and off after the ball thrown: straight onto its feet, side-on
# usage: bash tools/wan_look.sh [seed] [clip …]   (no clips: all)
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
OUT="$IPET/assets/fox/clips"
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），在純綠色背景前的原地。'
KEEP='畫面裡只有這隻狐狸，沒有球、沒有手、沒有任何物品、沒有任何特效符號。鏡頭完全固定不動，背景始終是純綠色，主體大小不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
cd "$COMFY/tivot_wan" || exit 1
for d in l r; do
  side=左; [ $d = r ] && side=右
  want look_up_loop_look_$d || continue
  echo "=== look_up_loop_look_$d $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/look_up.png" --length 25 --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "_loop_look_$d" --end "$IN/look_far_$d.png" --prompt "${FOX}牠坐著抬頭往上看，滿臉期待，眼睛盯著上方慢慢往畫面${side}邊移動的東西，頭和眼睛一起慢慢轉向畫面${side}邊、仍然抬頭往上看，一直轉到最${side}邊停住。身體坐著不動，表情一直很期待開心。動作平順、等速。$KEEP" 2>&1 | tail -3
done
# off after the ball at once: from looking up, straight up onto its feet and side-on (no sitting back first)
SIDE='側身的時候，頭和臉始終是正側面、朝著前進的方向，不回頭、不轉頭看鏡頭。'
for d in walk walk_r; do
  side=左; [ $d = walk_r ] && side=右
  want look_up_to_$d || continue
  echo "=== look_up_to_$d $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/look_up.png" --length 25 --fps 16     --seed "$SEED" --out "$OUT" --suffix "_to_$d" --end "$IN/$d.png" --prompt "${FOX}牠原本坐著抬頭往上看，看到球飛出去，馬上興奮地站起來，把身體轉向畫面${side}邊，四隻腳站好準備衝出去。動作快速、自然流暢。$SIDE$KEEP" 2>&1 | tail -3
done
echo "=== all done $(date +%T)"
