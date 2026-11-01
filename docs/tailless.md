# 小狐的尾巴全部改由程式畫（2026-10-31 起）

目標：遊戲（fling）和飼養區的所有小狐動畫本身都**沒有尾巴**，尾巴全部由程式依尾巴數（1–9）畫上去：靜止時自然晃動、飛行或跑動時快速抖動。

## 已完成（飛行遊戲）
- 側面（跑、撲、蹲、飛躍、下撲；披風版靜態圖）：`tools/tail_cut.py` 把原本的尾巴擦掉 → `assets/fox/notail/`。
- 正面與背面（歡呼、開心、跳、驚訝、雲端起跳／落地）：GPT 畫無尾巴的起始圖（T01 一般、T02 披風）→ `assets/fox/wan_in/notail/`、`wan_in/halloween_notail/`，`tools/wan_notail.py` 用原本的提示詞（去掉尾巴）重跑 WAN → `assets/fox/clips_notail/`、`clips_halloween_notail/`。
- 尾巴根部：`tools/tail_roots.py` → `assets/fox/tail_roots.json`（逐幀；慢的用光流追蹤，快的用樣板比對）。
- 歡呼的第三隻腳：`tools/cheer_leg.py`（每次重跑 cheer_loop 後都要跑）。
- `fling.js` 的 `tails()`：側面主尾巴畫在身體前面、其餘在後面；正面全部在身體後面、展開較大；背面全部在身體前面。

## 進行中：飼養區全部動畫
1. 清點：`assets/fox/clips/` 241 段，起始／結尾圖在 `assets/fox/wan_in/*.png`（約 83 張）。
   尾巴本身是動作主角的不做無尾巴版（保留原尾巴，只在後面加程式尾巴）：chase_tail、hug_tail、shy、shiver、tail、tail_r。
   跑酷遊戲專用的 back_hang、back_pull 先不做。
2. GPT：無尾巴起始圖，**一律 3×3 九宮格**（省額度），原圖排好附上 → 對齊回 512 畫布 → `assets/fox/wan_in/notail/<名字>.png`。
3. WAN：照原本的 `tools/wan_*.sh` 重跑，但經過 `tools/notail_shim.py`（輸入圖換成 notail、輸出到 `clips_notail/`、提示詞去掉尾巴），之後照原 clip 的 meta 補抽幀（trimmed.kept）、鏡像（mirrored_from）、exits/near/speed。
4. 根部：原圖與無尾巴圖相減＝尾巴；離身體最近的尾巴點＝根部、尾巴重心方向＝角度；再逐幀追蹤。
5. `fox2d.js`：有 clips_notail 就用，並畫程式尾巴（同 fling 的 tails()）。

## 進度紀錄
（每完成一步在這裡記一行）
- 飛行遊戲一般版：完成（25a6a7e）。
- 飛行遊戲披風版：完成。
- 飼養區：GPT N01 完成並對齊（tools/notail_align.py，形狀比對對齊）；N02、N03、N04 完成。GPT 偶爾把姿勢畫成不同大小（paw、play_bow、ready），記在 assets/source/notail/redo.json，最後集中一張九宮格重畫。
- N05、N06 完成；N07 進行中。fox2d.js 已會優先載入 clips_notail 並畫程式尾巴（Fox2D.tails(n)，app.js renderTails 傳入）；tools/tail_pics.py 算每張起始圖的根部，tools/tail_roots.py 追蹤到每一幀。
- N07 完成；N08（paw、play_bow、ready、ready_far_l/r 重畫）姿勢仍與原圖略有不同，但大小對上、無尾巴動畫之間互相一致，採用。
- WAN：tools/wan_tailless_until_done.sh 會一輪輪重跑到沒有新動畫，最後算根部。
- 尚未處理：chase_tail、hug_tail、shy、shiver、tail/tail_r（尾巴是動作主角）仍用原動畫，只有 1 條尾巴；接到這些動畫時尾巴數會跳。
- 全部 WAN 跑完後：python tools/tail_pics.py → python tools/tail_roots.py → 抽查 → commit。WAN 用 tools/wan_tailless.sh（經 tools/notail_shim.py）。
- 第一輪（11/1 03:00）：114 段；wan_actions 因 ACTS 含它不認得的動作而中斷（已修：wan_tailless.sh 只給每支腳本它自己的動作）。抽查：14 段轉場（躺下、起身、轉身到背面、跑跳）中途被 WAN 長回尾巴 → 移除重做；notail_shim.py 現在把「尾巴」加進 WAN 的反向提示詞。
- 第二輪（11/1 07:00）：223 段；26 段中途長回尾巴，用 tools/notail_retry.sh 以 seed 11、23 重做，每段三次（7/11/23）比對挑最乾淨的：18 段有乾淨版本。其餘 8 段（drowsy_to_sleep、eat_to_normal、play_bow_loop、sleep_belly_to_sleep、sleep_to_normal、walk_back_to_normal、walk_back_to_walk_front、walk_front_to_walk_back：側身轉向、躺下起身）再以 seed 31、47、59 重做。
- 第三輪結果：walk_back_to_normal（seed 47）乾淨；play_bow_loop 每個 seed 都在搖擺時舉起大尾巴 → 只留沒尾巴的 0–4 幀來回播（程式尾巴負責搖）。drowsy_to_sleep、eat_to_normal、sleep_belly_to_sleep、sleep_to_normal、walk_back_to_walk_front、walk_front_to_walk_back 仍有幾幀短暫露出尾巴（側身那幾幀），已選最少的版本。之後可改成「起始 → 側面無尾巴圖 → 結尾」兩段 WAN 來根治。
- 兩段式（tools/notail_split.py）：剩下 6 段改成「起始 → 側面無尾巴圖 → 結尾」兩段 WAN 再接起來（13＋12 幀），中間圖：walk_back↔walk_front 夾 walk、drowsy/sleep_belly→sleep 夾 rest、sleep→normal 夾 stretch、eat→normal 夾 lick。全部乾淨，換上（walk 兩段 seed 7、drowsy/sleep_belly seed 7、sleep_to_normal/eat_to_normal seed 11）。
- 手動錨定（11/1）：`python server.py` 後開 `/tools/tail_anchor.html`（可加 `?clip=<名字>`）。在畫面上拖尾根、拖線端圓點轉角度，只錨幾幀，中間直線補；存到 `assets/fox/tail_anchors.json`，fox2d.js 與 fling.js 載入時以它取代 tail_roots.py 找到的（`anchored()`）。每個錨點另可調尾巴大小（滾輪）與展開角度（Shift＋滾輪），存成 [x, y, 角度, 面向你, 大小, 展開]。重跑 tail_roots.py 不會蓋掉手動的。青色圈＝接續動畫的頭／尾幀錨點，方便對齊接不上的地方。
- 預設與限制（11/1）：單條尾巴沒手動錨定時一律斜 40 度（往身體外側）；尾巴碰到腳底線（每幀最低的不透明點）會自動轉上來，仍超出的部分裁掉。尾巴圖接到尾根的那一點可在工具裡設定（所有動畫共用，存在 tail_anchors.json 的 `_pivot`）。
- jump_joy 多一隻後腳（原圖就畫了三隻）：GPT 重畫 N09（只有這一格），notail_align.py N09 對齊，WAN 重跑 normal_to_jump_joy、jump_joy_loop、jump_joy_to_normal，尾根重算（11/1）。
- 11/1 晚：多尾暫停（轉身、躺下等視角變化的動畫，平面尾巴圖做不出透視）。fox2d.js、fling.js 的 MULTI = false：改回 WAN 原本有尾巴的動畫與圖，不再畫程式尾巴；無尾巴的動畫、尾根、錨定工具都保留，之後要再做時把 MULTI 打開。
