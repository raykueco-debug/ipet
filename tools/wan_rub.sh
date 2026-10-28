#!/usr/bin/env bash
# Being petted: a loop on the "love" picture (eyes closed, happy), so it chains with normal_to_love /
# love_to_normal. The player plays it while a finger keeps rubbing circles on the fox's head.
# No hand in the picture — the fox only reacts to it. See tools/wan_clips.sh.
# usage: bash tools/wan_rub.sh [seed]
set -u
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1
export TIVOT_GEN=512x512 TIVOT_FIT=1.0
IPET="$(cd "$(dirname "$0")/.." && pwd)"
SEED="${1:-7}"
IN="$IPET/assets/fox/wan_in"
OUT="$IPET/assets/fox/clips"
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），坐在純綠色背景前的原地。'
KEEP='畫面裡只有這隻狐狸，看不到手，沒有任何特效符號。四隻腳留在原地。鏡頭完全固定不動，背景始終是純綠色，主體大小與位置不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
cd "$HOME/Desktop/ComfyUI-master/tivot_wan" || exit 1
echo "=== love_loop_rub $(date +%T)"
./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IN/love.png" --length 25 --fps 16 --seed "$SEED" \
  --out "$OUT" --suffix _loop_rub 2>&1 --prompt "${FOX}牠閉著眼睛、很享受地被摸頭，頭隨著看不見的撫摸慢慢地畫圓揉動，耳朵往後壓低，臉頰往上蹭，尾巴開心地慢慢搖。最後回到開始的姿勢。$KEEP" | tail -3
echo "=== all done $(date +%T)"
