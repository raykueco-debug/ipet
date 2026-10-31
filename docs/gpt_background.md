# 小狐飛多遠：背景分層（給 GPT）

一則一行（ChatGPT 輸入框按 Enter 就送出），一次一個版本。背景大多是綠色，所以這張用洋紅底 #FF00FF，不用綠底。
收件後：
1. `python tools/greenkey.py assets/source/B01_background.png assets/source/B01_keyed.png --magenta`
2. `python tools/slice_bands.py assets/source/B01_keyed.png assets/bg clouds far trees ground`

`fling.js` 看到 `assets/bg/<名字>.webp` 就換掉程式畫的那一層（雲、遠山、樹、地面），由遠到近捲得越來越快。

## B01

請交 B01：小遊戲「小狐飛多遠」的橫向捲動背景，可愛卡通風（跟小狐同一個Q版畫風、賽璐珞上色、圓潤簡單的形狀、明亮柔和的顏色，不要寫實、不要細碎紋理），橫式寬圖，整張底色是純洋紅色 #FF00FF，畫四條上下排開、一樣寬的橫長條，條與條之間留洋紅色空隙，每一條左右都要能無縫重複接續，全部沒有角色、動物、文字、太陽或任何符號：1 最上面：幾朵圓滾滾的白色棉花雲排成一排；2 遠山：淡藍綠色的圓圓山丘連綿起伏，底部平直；3 中景：一排圓圓胖胖的卡通樹（棒棒糖樹和圓錐松樹交錯、綠色深淺不同），樹幹著地、底部平直；4 最下面：地面的橫切面，上緣是一排圓潤的草叢邊、點綴幾朵小花，下面是暖棕色泥土帶幾顆小石頭，填滿整條。一次只要一個版本。

## B02 起跳的小樹（名字：tree_crown tree_base）

B01 驗收通過，很可愛。請交 B02，同樣的畫風、同樣純洋紅色 #FF00FF 底：小狐起跳用的一棵小樹，分成左右兩個分開的東西（中間留大片洋紅色空隙）：左邊是小樹的樹冠，一團圓滾滾蓬鬆的亮綠色葉子球、上面有幾片小葉子翹起來、可以有一兩顆紅色小果實，沒有樹幹；右邊是這棵小樹的根部，一小截短短的暖棕色樹幹底部帶幾條小樹根、旁邊一小叢草，底部平直。沒有角色、文字或任何符號，一次只要一個版本。

收件後去背（--magenta），左半切成 `assets/bg/tree_crown.webp`；右半是個平頂樹樁，把樹樁上半截（y 510 以上、x 1600–1862）擦掉只留樹根和草，切成 `assets/bg/tree_base.webp`。
中間會彎的樹幹由 `fling.js` 的 drawTree() 畫：從樹根的切口（寬度 TREE_AT.w）往上漸細接到樹冠，顏色取自樹樁。

## 萬聖節（B03 背景、B04 起跳小樹；`?bg=halloween`，10 月 15 日起自動換）

B03、B04 跟 B01、B02 同樣的要求，改成夜晚配色（深紫、深藍、橘色南瓜），底色用純綠 #00FF00（萬聖節版畫面裡沒有亮綠色）。
- B03（雲、遠山、黑森林與南瓜燈、南瓜草地）：`greenkey.py` 去背 → `slice_bands.py assets/source/B03_keyed.png assets/bg/halloween clouds far trees ground`。地面那條草叢和南瓜比較高，所以 LOOKS.halloween.lip 是 0.64。
- B04（紫色樹冠帶小南瓜、樹樁根部和笑臉南瓜燈）：`greenkey.py --any-colour` 去背；左半切成 `assets/bg/halloween/tree_crown.webp`；右半把樹樁上半截（y 482 以上、x 1652–1872）擦掉，切成 `tree_base.webp`；樹樁 y 440–480 那段樹皮拉直、上下鏡像接起來，存成 `tree_trunk.webp`。切口的位置寫在 LOOKS.halloween.tree。
- 月亮、遠方的蝙蝠群、糖果、雲上的夜色由 `fling.js` 畫。
