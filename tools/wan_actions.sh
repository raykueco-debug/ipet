#!/usr/bin/env bash
# Idle actions from the sitting home pose ("normal"), with the local Wan 2.2 tool — see tools/wan_clips.sh.
# Each action is two clips that start / end on fixed pictures (tools/wan_prep.py, one shared canvas):
#   normal_to_<action>   home → action pose     17 frames (≈1 s at 16 fps)
#   <action>_to_normal   action pose → home     17 frames
# The home loop (normal_loop) stays its own clip, so it keeps looping; the player drops into an action now
# and then and comes back. Only the fox in the picture: no hands, bowls, toys or effect marks.
# usage: [ACTS="yawn tilt_left"] bash tools/wan_actions.sh [seed]
set -u
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1
export TIVOT_GEN=512x512 TIVOT_FIT=1.0
IPET="$(cd "$(dirname "$0")/.." && pwd)"
COMFY="$HOME/Desktop/ComfyUI-master"
SEED="${1:-7}"
IN="$IPET/assets/fox/wan_in"
OUT="$IPET/assets/fox/clips"
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），在純綠色背景前的原地。'
KEEP='畫面裡只有這隻狐狸，沒有手、沒有碗、沒有玩具、沒有任何特效符號。鏡頭完全固定不動，背景始終是純綠色，主體大小與位置不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
declare -A GO=(
  [look_around]='牠好奇地轉頭往後方張望，耳朵跟著轉動'
  [tilt_left]='牠可愛地把頭往一邊歪，好像在思考'
  [tilt_right]='牠可愛地把頭往另一邊歪，好像在聽什麼聲音'
  [look_up]='牠抬起頭往上看，好像看到天上有什麼東西'
  [yawn]='牠閉上眼睛、抬起頭，張大嘴巴打一個大大的哈欠'
  [stretch]='牠前腳往前伸、屁股翹高，舒服地伸一個大懶腰'
)
declare -A BACK=(
  [look_around]='牠把頭轉回前方，恢復平常乖乖坐好的樣子'
  [tilt_left]='牠把頭慢慢擺正，恢復平常乖乖坐好的樣子'
  [tilt_right]='牠把頭慢慢擺正，恢復平常乖乖坐好的樣子'
  [look_up]='牠把頭放低看回前方，恢復平常乖乖坐好的樣子'
  [yawn]='牠闔上嘴巴、睜開眼睛，恢復平常乖乖坐好的樣子'
  [stretch]='牠收回前腳、坐回原位，恢復平常乖乖坐好的樣子'
)
run() { # input  suffix  prompt  end-image
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$1" --length 17 --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "$2" --prompt "$3" --end "$4" 2>&1 | tail -3
}
cd "$COMFY/tivot_wan" || exit 1
for a in ${ACTS:-look_around tilt_left tilt_right look_up yawn stretch}; do
  echo "=== normal_to_$a $(date +%T)"
  run "$IN/normal.png" "_to_$a" "${FOX}牠原本平常地坐著，${GO[$a]}。動作自然流暢。$KEEP" "$IN/$a.png"
  echo "=== ${a}_to_normal $(date +%T)"
  run "$IN/$a.png" _to_normal "${FOX}${BACK[$a]}。動作自然流暢。$KEEP" "$IN/normal.png"
done
echo "=== all done $(date +%T)"
