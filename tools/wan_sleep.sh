#!/usr/bin/env bash
# Going to sleep and waking up, with the local Wan 2.2 tool — see tools/wan_clips.sh. Pictures from
# tools/wan_prep.py: normal (sitting), drowsy (sitting, eyes closed), sleep (curled up asleep).
#   normal_to_drowsy    sit → eyes close, head nods                    17 frames
#   drowsy_loop         nodding off and catching itself                25 → 24-frame loop
#   drowsy_to_normal    woken while dozing: eyes open, sit up          17 frames
#   drowsy_to_sleep     lies down and curls up                         25 frames
#   sleep_loop          asleep: slow breathing, tail twitch            25 → 24-frame loop
#   sleep_loop_dream    asleep, a dream: paws twitch, a smile          25 → 24-frame loop (same picture)
#   sleep_to_normal     wakes, stretches, sits as before               25 frames
# usage: bash tools/wan_sleep.sh [seed] [clip …]   (no clips: all)
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
KEEP='畫面裡只有這隻狐狸，沒有枕頭、沒有被子、沒有手、沒有任何特效符號（沒有 Z 字、沒有泡泡）。鏡頭完全固定不動，背景始終是純綠色，主體大小不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
run() { # input  suffix  length  prompt  [end-image]
  local end=()
  [ $# -ge 5 ] && end=(--end "$5")
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$1" --length "$3" --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "$2" --prompt "$4" "${end[@]}" 2>&1 | tail -3
}
cd "$COMFY/tivot_wan" || exit 1
want normal_to_drowsy && { echo "=== normal_to_drowsy $(date +%T)"
  run "$IN/normal.png" _to_drowsy 17 "${FOX}牠坐著，漸漸覺得好睏，眼睛慢慢閉上，頭輕輕往下點。動作自然流暢。$KEEP" "$IN/drowsy.png"; }
want drowsy_loop && { echo "=== drowsy_loop $(date +%T)"
  run "$IN/drowsy.png" _loop 25 "${FOX}牠閉著眼睛坐著打瞌睡，頭慢慢往下垂，又輕輕抬起來，身體微微搖晃，耳朵放鬆。最後回到開始的姿勢。$KEEP"; }
want drowsy_to_normal && { echo "=== drowsy_to_normal $(date +%T)"
  run "$IN/drowsy.png" _to_normal 17 "${FOX}牠原本閉眼打瞌睡，被叫醒了，睜開眼睛、抬起頭，恢復平常乖乖坐好的樣子。動作自然流暢。$KEEP" "$IN/normal.png"; }
want drowsy_to_sleep && { echo "=== drowsy_to_sleep $(date +%T)"
  run "$IN/drowsy.png" _to_sleep 25 "${FOX}牠閉著眼睛，慢慢趴下來，把身體捲成一團，用大尾巴圍住自己，安穩地睡著了。動作自然流暢。$KEEP" "$IN/sleep.png"; }
want sleep_loop && { echo "=== sleep_loop $(date +%T)"
  run "$IN/sleep.png" _loop 25 "${FOX}牠捲成一團安穩地睡著，身體隨著慢慢的呼吸輕輕起伏，尾巴尖偶爾輕輕動一下，耳朵偶爾抖一下。最後回到開始的姿勢。$KEEP"; }
want sleep_loop_dream && { echo "=== sleep_loop_dream $(date +%T)"
  run "$IN/sleep.png" _loop_dream 25 "${FOX}牠捲成一團睡著，正在做美夢，嘴角露出微笑，小腳掌輕輕抽動了幾下，耳朵抖一抖，然後又安穩地睡。最後回到開始的姿勢。$KEEP"; }
want sleep_to_normal && { echo "=== sleep_to_normal $(date +%T)"
  run "$IN/sleep.png" _to_normal 25 "${FOX}牠睡醒了，睜開眼睛，抬起頭，伸了個懶腰，然後坐起來，恢復平常乖乖坐好的樣子。動作自然流暢。$KEEP" "$IN/normal.png"; }
echo "=== all done $(date +%T)"
