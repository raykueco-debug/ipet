#!/usr/bin/env bash
# Eating, with the local Wan 2.2 tool — see tools/wan_clips.sh. Only the fox is in the picture: the bowl is a
# separate layer the app puts in front of its mouth, so any food can go in it without new clips.
#   normal_to_eat    sit → lean down to a bowl that isn't drawn          25 frames, ends on eat.png
#   (eat.png: GPT sheet assets/source/gpt/grid_01.png — Wan alone never leaned down far enough)
#   eat_loop         munching with the head down                          25 → 24-frame loop
#   eat_to_normal    head up, lick the lips, sit as before                25 frames
# usage: bash tools/wan_eat.sh [seed]
set -u
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1
export TIVOT_GEN=512x512 TIVOT_FIT=1.0
IPET="$(cd "$(dirname "$0")/.." && pwd)"
COMFY="$HOME/Desktop/ComfyUI-master"
SEED="${1:-7}"
IN="$IPET/assets/fox/wan_in"
OUT="$IPET/assets/fox/clips"
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），坐在純綠色背景前的原地。'
KEEP='畫面裡只有這隻狐狸，沒有碗、沒有食物、沒有手、沒有任何特效符號。四隻腳留在原地。鏡頭完全固定不動，背景始終是純綠色，主體大小與位置不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
run() { # input  suffix  prompt  [end-image]
  local end=()
  [ $# -ge 4 ] && end=(--end "$4")
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$1" --length 25 --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "$2" --prompt "$3" "${end[@]}" 2>&1 | tail -3
}
cd "$COMFY/tivot_wan" || exit 1
echo "=== normal_to_eat $(date +%T)"
run "$IN/normal.png" _to_eat "${FOX}牠開心地低下頭，把臉湊向自己腳前方地上的位置，像要吃面前碗裡的食物，眼睛瞇起來。動作自然流暢。$KEEP" "$IN/eat.png"
echo "=== eat_loop $(date +%T)"
run "$IN/eat.png" _loop "${FOX}牠低著頭，開心地一口一口吃著面前的食物，嘴巴咀嚼、頭輕輕上下點動，耳朵放鬆，尾巴開心地慢慢搖。最後回到開始的姿勢。$KEEP"
echo "=== eat_to_normal $(date +%T)"
run "$IN/eat.png" _to_normal "${FOX}牠吃飽了，抬起頭，滿足地舔一舔嘴巴，然後恢復平常乖乖坐好的樣子。動作自然流暢。$KEEP" "$IN/normal.png"
echo "=== all done $(date +%T)"
