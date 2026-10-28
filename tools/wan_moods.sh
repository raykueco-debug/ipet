#!/usr/bin/env bash
# 7 mood idle loops for the 2D fox with the local Wan 2.2 tool (ComfyUI-master/tivot_wan/tivot_wan.py).
# 25 frames generated with first = last = the sprite, the duplicate last frame dropped → a 24-frame loop at 16 fps.
# Output: assets/fox/wan_idle/<sprite file name>/frame_XX.webp (normal happy pet_happy surprised puzzled sulky angry) (keyed), sheet.jpg, preview.html, meta.json
# usage: bash tools/wan_moods.sh [seed]
set -u
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1  # the tool prints ▶ ✔ ✘; the cp950 console crashed on them
IPET="$(cd "$(dirname "$0")/.." && pwd)"
COMFY="$HOME/Desktop/ComfyUI-master"
SEED="${1:-7}"
OUT="$IPET/assets/fox/wan_idle"
FOX='一隻Q版的小狐狸（橘色的毛、米白色的臉頰和胸口、深褐色的耳尖與腳掌、蓬鬆的大尾巴有白色尾尖），坐在純綠色背景前的原地。'
KEEP='四隻腳都留在原地，不要站起來、不要走動、不要轉身、不要離開畫面中央。最後回到開始的姿勢。鏡頭完全固定不動，背景始終是純綠色，主體大小不變、肢體數量不變。動漫風格，賽璐珞上色，可愛。'
declare -A ART=(
  [normal]=assets/fox/t1/normal.png [happy]=assets/fox/t1/happy.png [love]=assets/fox/t1/d04/pet_happy.png
  [surprised]=assets/fox/t1/surprised.png [curious]=assets/fox/t1/puzzled.png [sad]=assets/fox/t1/sulky.png
  [angry]=assets/fox/t1/angry.png)
declare -A MOVE=(
  [normal]='牠平靜地呼吸，身體隨呼吸輕輕起伏，耳朵偶爾輕輕抖一下，尾巴緩慢地左右輕擺。臉部表情維持原圖的樣子。'
  [happy]='牠很開心地瞇眼笑著，身體隨著愉快的節奏左右輕輕搖擺、肩膀微微上下彈動，尾巴快速又開心地搖動，耳朵輕快地抖動。臉部表情維持開心的樣子。'
  [love]='牠陶醉又幸福地瞇著眼，頭像在撒嬌磨蹭一樣輕輕左右歪動，身體慢慢地左右搖，尾巴緩慢搖擺。臉部表情維持幸福的樣子。'
  [surprised]='牠驚訝地睜大眼睛、張著小嘴，耳朵豎得直直的，身體微微往後縮一下再回來，尾巴的毛蓬起來輕輕顫動。臉部表情維持驚訝的樣子。'
  [curious]='牠好奇地歪著頭，頭在歪向一邊的角度輕輕上下點動，耳朵轉動像在聆聽，尾巴慢慢擺動。臉部表情維持好奇的樣子。'
  [sad]='牠委屈又難過，小口小口地抽氣，肩膀隨著抽泣微微起伏，耳朵垂著輕輕顫抖，尾巴幾乎不動。臉部表情維持委屈的樣子。'
  [angry]='牠很生氣，身體繃緊、微微發抖，耳朵往後貼，尾巴的毛炸開並用力左右甩動。臉部表情維持生氣的樣子。'
)
cd "$COMFY/tivot_wan" || exit 1
for mood in normal happy love surprised curious sad angry; do
  echo "=== $mood $(date +%T)"
  ./../.venv/Scripts/python.exe tivot_wan.py --mode idle --files "$IPET/${ART[$mood]}" --length 25 --fps 16 \
    --seed "$SEED" --out "$OUT" --prompt "$FOX${MOVE[$mood]}$KEEP" 2>&1 | tail -4
done
echo "=== all done $(date +%T)"
