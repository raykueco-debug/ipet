#!/usr/bin/env bash
# 2D fox clips with the local Wan 2.2 tool (ComfyUI-master/tivot_wan/tivot_wan.py), built to chain seamlessly.
#
# Every clip begins and ends on a fixed picture (Wan first/last-frame), all pictures on one shared canvas
# (tools/wan_prep.py → assets/fox/wan_in/<mood>.png), so any clip can follow any other at a boundary:
#   <mood>_loop          mood → mood       25 generated, duplicate last dropped → 24-frame loop
#   normal_to_<mood>     normal → mood     17 frames (≈1 s at 16 fps), entering a mood
#   <mood>_to_normal     mood → normal     17 frames, leaving it
# A change from mood A to mood B plays A_to_normal then normal_to_B ("normal" is the hub).
# Output: assets/fox/clips/<clip>/frame_XX.webp (keyed) + meta.json; check them in anichk (tools/anichk).
# usage: bash tools/wan_clips.sh [seed] [loops|transitions|all]
set -u
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1  # the tool prints ▶ ✔ ✘; the cp950 console crashed on them
export TIVOT_GEN=512x512 TIVOT_FIT=1.0      # keep wan_prep.py's framing exactly (no re-crop, no re-scale)
IPET="$(cd "$(dirname "$0")/.." && pwd)"
COMFY="$HOME/Desktop/ComfyUI-master"
SEED="${1:-7}"
WHAT="${2:-all}"
IN="$IPET/assets/fox/wan_in"
OUT="$IPET/assets/fox/clips"
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），坐在純綠色背景前的原地。'
KEEP='四隻腳都留在原地，不要站起來、不要走動、不要轉身、不要離開原本的位置。鏡頭完全固定不動，背景始終是純綠色，主體大小與位置不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
declare -A NAME=([normal]=平常 [happy]=開心 [love]=幸福 [surprised]=驚訝 [curious]=好奇 [sad]=委屈 [angry]=生氣)
declare -A MOVE=(
  [normal]='牠平靜地呼吸，身體隨呼吸輕輕起伏，耳朵偶爾輕輕抖一下，尾巴緩慢地左右輕擺。臉部表情維持原圖的樣子。最後回到開始的姿勢。'
  [happy]='牠很開心地瞇眼笑著，身體隨著愉快的節奏左右輕輕搖擺、肩膀微微上下彈動，尾巴快速又開心地搖動，耳朵輕快地抖動。臉部表情維持開心的樣子。最後回到開始的姿勢。'
  [love]='牠幸福地瞇著眼微笑，頭輕輕左右歪動，身體慢慢地左右搖，尾巴緩慢搖擺。臉部表情維持幸福的樣子。最後回到開始的姿勢。'
  [surprised]='牠驚訝地睜大眼睛、張著小嘴，耳朵豎得直直的，身體微微往後縮一下再回來，尾巴的毛蓬起來輕輕顫動。臉部表情維持驚訝的樣子。最後回到開始的姿勢。'
  [curious]='牠好奇地歪著頭，頭在歪向一邊的角度輕輕上下點動，耳朵轉動像在聆聽，尾巴慢慢擺動。臉部表情維持好奇的樣子。最後回到開始的姿勢。'
  [sad]='牠委屈又難過，小口小口地抽氣，肩膀隨著抽泣微微起伏，耳朵垂著輕輕顫抖，尾巴幾乎不動。臉部表情維持委屈的樣子。最後回到開始的姿勢。'
  [angry]='牠很生氣，身體繃緊、微微發抖，耳朵往後貼，尾巴的毛炸開並用力左右甩動。臉部表情維持生氣的樣子。最後回到開始的姿勢。'
)
run() { # input-image  name-suffix  length  prompt  [end-image]
  local end=()
  [ $# -ge 5 ] && end=(--end "$5")
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$1" --length "$3" --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "$2" --prompt "$4" "${end[@]}" 2>&1 | tail -3
}
cd "$COMFY/tivot_wan" || exit 1
if [ "$WHAT" != transitions ]; then
  for m in normal happy love surprised curious sad angry; do
    echo "=== ${m}_loop $(date +%T)"
    run "$IN/$m.png" _loop 25 "$FOX${MOVE[$m]}$KEEP"
  done
fi
if [ "$WHAT" != loops ]; then
  for m in happy love surprised curious sad angry; do
    echo "=== normal_to_$m $(date +%T)"
    run "$IN/normal.png" "_to_$m" 17 "${FOX}牠從平常的表情與姿勢，自然、流暢地轉變成${NAME[$m]}的表情與姿勢。$KEEP" "$IN/$m.png"
    echo "=== ${m}_to_normal $(date +%T)"
    run "$IN/$m.png" _to_normal 17 "${FOX}牠從${NAME[$m]}的表情與姿勢，自然、流暢地慢慢恢復成平常的表情與姿勢。$KEEP" "$IN/normal.png"
  done
fi
echo "=== all done $(date +%T)"
