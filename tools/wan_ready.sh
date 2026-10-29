#!/usr/bin/env bash
# Ready for the ball, with the local Wan 2.2 tool — see tools/wan_clips.sh. The player takes the ball up: the fox
# drops into a ready-to-pounce crouch facing us (the picture "ready", GPT sheet assets/source/gpt/ready_01.png),
# its head following the ball; thrown, it bursts off from the crouch straight into its run — nothing between.
#   normal_to_ready / walk_to_ready / walk_r_to_ready   down into the crouch (sitting, or standing side-on)
#   ready_loop_look_l / ready_loop_look_r   the head turns after the ball to far left / far right (pictures
#                     ready_far_l / ready_far_r) — scrubbed by fox2d.js, not played (frame 0 = ready)
#   ready_to_walk / ready_to_walk_r   bursting off after the ball thrown, to side-on (the run goes on from there)
#   ready_to_normal   the ball put away: sits up again
# 25 frames each, thinned after (tools/clip_trim.py).
# usage: bash tools/wan_ready.sh [seed] [clip …]   (no clips: all)
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
SIDE='側身的時候，頭和臉始終是正側面、朝著前進的方向，不回頭、不轉頭看鏡頭。'
READY='面向你壓低身體準備撲：前腳往前伸低低地趴在地上，屁股和尾巴高高翹起，滿臉興奮期待，眼睛閃閃發亮，抬頭往上看'
run() { # input  suffix  end-image  prompt
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$1" --length 25 --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "$2" --end "$3" --prompt "$4" 2>&1 | tail -3
}
cd "$COMFY/tivot_wan" || exit 1
want normal_to_ready && { echo "=== normal_to_ready $(date +%T)"
  run "$IN/normal.png" _to_ready "$IN/ready.png" "${FOX}牠原本乖乖坐著，看到有人拿起球，馬上興奮地${READY}。動作快速、自然流暢。$KEEP"; }
for d in walk walk_r; do
  side=左; [ $d = walk_r ] && side=右
  want ${d}_to_ready && { echo "=== ${d}_to_ready $(date +%T)"
    run "$IN/$d.png" _to_ready "$IN/ready.png" "${FOX}牠原本側身朝畫面${side}邊站著，看到有人拿起球，馬上轉過來${READY}。動作快速、自然流暢。$KEEP"; }
done
for d in l r; do
  side=左; [ $d = r ] && side=右
  want ready_loop_look_$d && { echo "=== ready_loop_look_$d $(date +%T)"
    run "$IN/ready.png" "_loop_look_$d" "$IN/ready_far_$d.png" "${FOX}牠${READY}，眼睛盯著上方往畫面${side}邊移動的東西，頭和眼睛一起慢慢轉向畫面${side}邊、仍然抬頭往上看。身體、前腳和翹起的屁股都不動，只有頭在轉。動作平順、等速。$KEEP"; }
done
for d in walk walk_r; do
  side=左; [ $d = walk_r ] && side=右
  want ready_to_$d && { echo "=== ready_to_$d $(date +%T)"
    run "$IN/ready.png" "_to_$d" "$IN/$d.png" "${FOX}牠原本${READY}，球一丟出去，牠後腳一蹬，立刻轉身朝畫面${side}邊衝出去追，變成側身朝畫面${side}邊、四隻腳著地準備奔跑。動作非常快、有力、自然流暢。$SIDE$KEEP"; }
done
want ready_to_normal && { echo "=== ready_to_normal $(date +%T)"
  run "$IN/ready.png" _to_normal "$IN/normal.png" "${FOX}牠原本${READY}，球被收起來了，牠放鬆下來，坐回去，恢復平常乖乖坐好的樣子。動作自然流暢。$KEEP"; }
echo "=== all done $(date +%T)"
