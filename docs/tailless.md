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
- 全部 WAN 跑完後：python tools/tail_pics.py → python tools/tail_roots.py → 抽查 → commit。WAN 用 tools/wan_tailless.sh（經 tools/notail_shim.py）。
