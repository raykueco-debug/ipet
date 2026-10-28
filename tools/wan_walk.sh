#!/usr/bin/env bash
# Walking, with the local Wan 2.2 tool — see tools/wan_clips.sh. Pictures from tools/wan_prep.py:
# normal (sitting, facing us), walk (standing side-on, facing left), walk_r (walk flipped: facing right).
#   normal_to_walk / normal_to_walk_r   sit → stand up → turn side-on      25 frames
#   walk_loop / walk_r_loop             walking in place, facing left / right   25 → 24-frame loop
#   walk_to_normal / walk_r_to_normal   stop → turn to us → sit down       25 frames
#   walk_turn / walk_r_turn             turn round: left → right / right → left   17 frames
#   walk[_r]_loop_<face>               walk loops that do something with the face mid-stride (same anchor)
#   walk[_r]_loop_push                 standing: dip the head and push the ball with the nose (same anchor)
# Every change of direction is an animation: nothing is flipped in the player.
# The player moves the fox across the room while a walk loop plays.
# usage: bash tools/wan_walk.sh [seed] [clip …]   (no clips: all)
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
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），在純綠色背景前。'
KEEP='畫面裡只有這隻狐狸，沒有手、沒有碗、沒有玩具、沒有任何特效符號。鏡頭完全固定不動，背景始終是純綠色，主體大小不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
run() { # input  suffix  length  prompt  [end-image]
  local end=()
  [ $# -ge 5 ] && end=(--end "$5")
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$1" --length "$3" --fps 16 \
    --seed "$SEED" --out "$OUT" --suffix "$2" --prompt "$4" "${end[@]}" 2>&1 | tail -3
}
cd "$COMFY/tivot_wan" || exit 1
if want normal_to_walk; then
  echo "=== normal_to_walk $(date +%T)"
  run "$IN/normal.png" _to_walk 25 "${FOX}牠原本面向前方坐著，先站起來，再把身體轉向畫面左邊，四隻腳站好準備出發。動作自然流暢。$KEEP" "$IN/walk.png"
fi
if want normal_to_walk_r; then
  echo "=== normal_to_walk_r $(date +%T)"
  run "$IN/normal.png" _to_walk_r 25 "${FOX}牠原本面向前方坐著，先站起來，再把身體轉向畫面右邊，四隻腳站好準備出發。動作自然流暢。$KEEP" "$IN/walk_r.png"
fi
if want walk_loop; then
  echo "=== walk_loop $(date +%T)"
  run "$IN/walk.png" _loop 25 "${FOX}牠側身朝畫面左邊，在原地踏步走路，像在跑步機上一樣，四隻腳交替輕快地邁步，身體隨步伐輕輕上下起伏，尾巴跟著擺動。身體位置不前進、不移動。最後回到開始的姿勢。$KEEP"
fi
if want walk_to_normal; then
  echo "=== walk_to_normal $(date +%T)"
  run "$IN/walk.png" _to_normal 25 "${FOX}牠原本側身站著朝畫面左邊，停下腳步，把身體轉回面向前方，然後乖乖坐下。動作自然流暢。$KEEP" "$IN/normal.png"
fi
if want walk_r_to_normal; then
  echo "=== walk_r_to_normal $(date +%T)"
  run "$IN/walk_r.png" _to_normal 25 "${FOX}牠原本側身站著朝畫面右邊，停下腳步，把身體轉回面向前方，然後乖乖坐下。動作自然流暢。$KEEP" "$IN/normal.png"
fi
if want walk_turn; then
  echo "=== walk_turn $(date +%T)"
  run "$IN/walk.png" _turn 17 "${FOX}牠原本側身站著朝畫面左邊，原地轉身，變成側身朝畫面右邊站好。動作自然流暢。$KEEP" "$IN/walk_r.png"
fi
if want walk_r_loop; then
  echo "=== walk_r_loop $(date +%T)"
  run "$IN/walk_r.png" _loop 25 "${FOX}牠側身朝畫面右邊，在原地踏步走路，像在跑步機上一樣，四隻腳交替輕快地邁步，身體隨步伐輕輕上下起伏，尾巴跟著擺動。身體位置不前進、不移動。最後回到開始的姿勢。$KEEP"
fi
if want walk_r_turn; then
  echo "=== walk_r_turn $(date +%T)"
  run "$IN/walk_r.png" _turn 17 "${FOX}牠原本側身站著朝畫面右邊，原地轉身，變成側身朝畫面左邊站好。動作自然流暢。$KEEP" "$IN/walk.png"
fi
declare -A FACE=(
  [ahead]='走到一半把頭轉成正側面，看著前進的方向，再把臉轉回來'
  [happy]='走到一半開心地瞇起眼睛笑，再恢復原本的表情'
  [up]='走到一半抬頭往上看了一下，再把頭放回來'
  [back]='走到一半回頭看了一下身後，再把頭轉回來'
)
for f in ahead happy up back; do
  for d in walk walk_r; do
    side=左; [ $d = walk_r ] && side=右
    if want ${d}_loop_$f; then
      echo "=== ${d}_loop_$f $(date +%T)"
      run "$IN/$d.png" "_loop_$f" 25 "${FOX}牠側身朝畫面${side}邊，在原地踏步走路，像在跑步機上一樣，四隻腳交替輕快地邁步，${FACE[$f]}。身體位置不前進、不移動。最後回到開始的姿勢。$KEEP"
    fi
  done
done
# walking to / from the viewer (pictures walk_front, walk_back): for going deeper or nearer on the ground
if want walk_front_loop; then
  echo "=== walk_front_loop $(date +%T)"
  run "$IN/walk_front.png" _loop 25 "${FOX}牠面向你，在原地踏步走路，像在跑步機上一樣，四隻腳交替輕快地邁步，身體隨步伐輕輕起伏，尾巴擺動。身體位置不前進、不移動、大小不變。最後回到開始的姿勢。$KEEP"
fi
if want walk_back_loop; then
  echo "=== walk_back_loop $(date +%T)"
  run "$IN/walk_back.png" _loop 25 "${FOX}牠背對你，在原地踏步走路，像在跑步機上一樣，四隻腳交替輕快地邁步，大尾巴左右擺動。身體位置不前進、不移動、大小不變。最後回到開始的姿勢。$KEEP"
fi
if want normal_to_walk_front; then
  echo "=== normal_to_walk_front $(date +%T)"
  run "$IN/normal.png" _to_walk_front 25 "${FOX}牠原本坐著，站起來，抬起一隻前腳準備朝你走過來。動作自然流暢。$KEEP" "$IN/walk_front.png"
fi
if want walk_front_to_normal; then
  echo "=== walk_front_to_normal $(date +%T)"
  run "$IN/walk_front.png" _to_normal 25 "${FOX}牠停下腳步，乖乖坐下，恢復平常乖乖坐好的樣子。動作自然流暢。$KEEP" "$IN/normal.png"
fi
if want normal_to_walk_back; then
  echo "=== normal_to_walk_back $(date +%T)"
  run "$IN/normal.png" _to_walk_back 25 "${FOX}牠原本面向你坐著，站起來，轉身背對你，準備往遠處走。動作自然流暢。$KEEP" "$IN/walk_back.png"
fi
if want walk_back_to_normal; then
  echo "=== walk_back_to_normal $(date +%T)"
  run "$IN/walk_back.png" _to_normal 25 "${FOX}牠原本背對你站著，轉過身來面向你，然後乖乖坐下。動作自然流暢。$KEEP" "$IN/normal.png"
fi
# turning between side-on, toward the viewer and away (walking on, deeper or nearer): <from>_to_<to>
declare -A VIEW=([walk]='側身朝畫面左邊' [walk_r]='側身朝畫面右邊' [walk_front]='面向你' [walk_back]='背對你')
for pair in walk:walk_front walk_front:walk walk_r:walk_front walk_front:walk_r walk:walk_back walk_back:walk             walk_r:walk_back walk_back:walk_r walk_front:walk_back walk_back:walk_front; do
  f=${pair%%:*}; t=${pair##*:}
  if want ${f}_to_$t; then
    echo "=== ${f}_to_$t $(date +%T)"
    run "$IN/$f.png" "_to_$t" 17 "${FOX}牠原本${VIEW[$f]}站著，原地轉身，變成${VIEW[$t]}站好。四隻腳留在原地。動作自然流暢。$KEEP" "$IN/$t.png"
  fi
done
# nudging the ball: standing, a dip of the head and a push forward with the nose, back to standing
for d in walk walk_r; do
  side=左; [ $d = walk_r ] && side=右
  if want ${d}_loop_push; then
    echo "=== ${d}_loop_push $(date +%T)"
    run "$IN/$d.png" _loop_push 25 "${FOX}牠側身朝畫面${side}邊站著，低下頭，用鼻子和額頭往前輕輕一頂，像在頂地上的大球玩耍，然後抬起頭站好。四隻腳留在原地。最後回到開始的姿勢。$KEEP"
  fi
done
echo "=== all done $(date +%T)"
