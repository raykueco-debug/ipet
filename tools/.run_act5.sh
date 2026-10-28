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
  [paw]='牠開心地舉起一隻前腳，往前輕輕一撥，像在撥弄地上的小球'
  [lick]='牠滿足地伸出小舌頭舔一舔鼻子'
  [scratch]='牠坐著抬起一隻腳，舒服地搔搔耳朵後面，眼睛瞇起來'
  [chase_tail]='牠站起來轉身，開心地追著自己的大尾巴繞圈'
  [belly]='牠開心地往後一倒，翻過身來肚子朝上，四隻腳在空中扭動'
  [sneeze]='牠皺起鼻子、眼睛緊緊閉起來，準備打一個小噴嚏'
  [play_bow]='牠興奮地前腳趴低、屁股翹高、尾巴搖來搖去，邀你一起玩'
  [sniff]='牠站起來轉向畫面左邊，低下頭用鼻子聞聞地上'
  [wave]='牠開心地舉起一隻前腳，對你揮揮手打招呼'
  [jump_joy]='牠開心得跳起來，四隻腳離地，笑得眼睛都瞇起來'
  [nod]='牠閉上眼睛微笑，下巴往下點一點，像在說「對」'
  [shake_no]='牠閉上眼睛，把頭轉向一邊輕輕搖頭，嘟著嘴像在說「不是」'
  [think]='牠抬起一隻前腳放在下巴，眼睛往上看，好像在思考'
  [shake_dry]='牠站起來用力甩動全身的毛，毛蓬蓬地散開，眼睛緊閉（沒有水滴）'
  [bored]='牠慢慢趴下來，把下巴靠在交疊的前腳上，有點無聊地看著你'
  [hug_tail]='牠把自己蓬鬆的大尾巴抱到胸前，幸福地抱緊'
  [shy]='牠害羞地臉紅，用大尾巴遮住半張臉，只露出眼睛偷看'
  [clap]='牠開心地把兩隻前腳合在一起拍拍手'
  [peekaboo]='牠用兩隻前腳遮住眼睛玩躲貓貓，再偷偷微笑'
  [blow_kiss]='牠把一隻前腳放到嘴邊，閉上眼睛嘟起嘴送出一個飛吻'
  [hungry]='牠把兩隻前腳放在肚子上，耳朵垂下來，可憐兮兮地看著你，肚子好餓'
  [shiver]='牠縮起身體、毛蓬起來，用尾巴圍住自己，冷得微微發抖'
  [proud]='牠得意地挺起胸膛、抬高下巴，閉著眼睛自信地微笑'
  [dance]='牠用後腳站起來，舉起前腳，開心地扭來扭去跳舞'
  [beg]='牠用後腳站起來，把前腳合在胸前，眨著閃亮的大眼睛撒嬌'
  [roll]='牠往旁邊一倒，側躺著開心地打滾，笑得好開心'
  [sit_back]='牠轉過身背對你坐著，抬頭望向遠方的森林'
  [rest]='牠轉向畫面左邊，慢慢趴下來放鬆休息，頭還抬著'
  [look_back]='牠站起來轉向畫面左邊，再回頭看著你微笑'
  [stretch_up]='牠用後腳站起來，兩隻前腳高高舉過頭頂伸懶腰，眼睛閉起來'
  [look_down_l]='牠把身體轉向左邊一點，好奇地低頭看地上'
  [look_down_r]='牠把身體轉向右邊一點，好奇地低頭看地上'
)
declare -A BACK=(
  [look_around]='牠把頭轉回前方，恢復平常乖乖坐好的樣子'
  [tilt_left]='牠把頭慢慢擺正，恢復平常乖乖坐好的樣子'
  [tilt_right]='牠把頭慢慢擺正，恢復平常乖乖坐好的樣子'
  [look_up]='牠把頭放低看回前方，恢復平常乖乖坐好的樣子'
  [yawn]='牠闔上嘴巴、睜開眼睛，恢復平常乖乖坐好的樣子'
  [stretch]='牠收回前腳、坐回原位，恢復平常乖乖坐好的樣子'
  [paw]='牠把舉起的前腳放下，恢復平常乖乖坐好的樣子'
  [lick]='牠收回舌頭，恢復平常乖乖坐好的樣子'
  [scratch]='牠放下腳，抖抖耳朵，恢復平常乖乖坐好的樣子'
  [chase_tail]='牠停下來轉回前方，坐下，恢復平常乖乖坐好的樣子'
  [belly]='牠翻身坐起來，恢復平常乖乖坐好的樣子'
  [sneeze]='牠打完一個可愛的小噴嚏，甩甩頭，恢復平常乖乖坐好的樣子'
  [play_bow]='牠站直身體坐下，恢復平常乖乖坐好的樣子'
  [sniff]='牠抬起頭轉回前方坐下，恢復平常乖乖坐好的樣子'
  [wave]='牠把揮手的前腳放下，恢復平常乖乖坐好的樣子'
  [jump_joy]='牠落地坐好，恢復平常乖乖坐好的樣子'
  [nod]='牠抬起頭睜開眼睛，恢復平常乖乖坐好的樣子'
  [shake_no]='牠把頭轉回前方睜開眼睛，恢復平常乖乖坐好的樣子'
  [think]='牠放下前腳，恢復平常乖乖坐好的樣子'
  [shake_dry]='牠甩完毛，毛慢慢順下來，坐下，恢復平常乖乖坐好的樣子'
  [bored]='牠撐起身體坐起來，恢復平常乖乖坐好的樣子'
  [hug_tail]='牠把尾巴放回身後，恢復平常乖乖坐好的樣子'
  [shy]='牠把尾巴放下，恢復平常乖乖坐好的樣子'
  [clap]='牠放下前腳，恢復平常乖乖坐好的樣子'
  [peekaboo]='牠把前腳從眼睛上拿開，開心地看著你，恢復平常乖乖坐好的樣子'
  [blow_kiss]='牠放下前腳睜開眼睛，恢復平常乖乖坐好的樣子'
  [hungry]='牠放下前腳，恢復平常乖乖坐好的樣子'
  [shiver]='牠不再發抖，把尾巴放回身後，恢復平常乖乖坐好的樣子'
  [proud]='牠睜開眼睛，恢復平常乖乖坐好的樣子'
  [dance]='牠放下前腳坐好，恢復平常乖乖坐好的樣子'
  [beg]='牠放下前腳坐好，恢復平常乖乖坐好的樣子'
  [roll]='牠翻身坐起來，恢復平常乖乖坐好的樣子'
  [sit_back]='牠轉回來面向你坐好，恢復平常乖乖坐好的樣子'
  [rest]='牠撐起身體坐起來，轉回前方，恢復平常乖乖坐好的樣子'
  [look_back]='牠轉回前方坐下，恢復平常乖乖坐好的樣子'
  [stretch_up]='牠放下前腳坐好，恢復平常乖乖坐好的樣子'
  [look_down_l]='牠抬起頭轉回前方，恢復平常乖乖坐好的樣子'
  [look_down_r]='牠抬起頭轉回前方，恢復平常乖乖坐好的樣子'
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
