# 小狐飛多遠：森林朋友的圖（給 GPT）

每則都是一行（ChatGPT 輸入框按 Enter 就送出）。交件格式同 E 系列：3×3 九宮格、綠底 #00FF00、每格留白，一次一個版本。
收件後：`python tools/greenkey.py <grid.png> <keyed.png> --any-colour`（動物有綠色、黃色，不能用狐狸專用的去背），再 `python tools/slice_grid.py <keyed.png> assets/friends <九個名字>`，
最後把切出來的名字（不含 .png）加進 `assets/friends/index.json`，`fling.js` 會自動換掉 emoji／手繪版。

## F01 待機（名字：rabbit_idle frog_idle mushroom_idle bear_idle owl_idle boar_idle hedgehog_idle giraffe_idle squirrel_idle）

請交 F01：小遊戲裡的森林朋友，跟小狐同一個畫風（日系Q版、賽璐珞上色、細棕色線條、可愛），3×3 九宮格、綠底 #00FF00、每格留白、每格只有一隻、腳貼齊格子底部、全部側身臉朝畫面左邊，沒有地面、影子、文字或任何符號特效。順序：1 兔子坐著、2 青蛙蹲著、3 一朵紅色大香菇（有白點，可以有一張睡臉）、4 大熊仰躺在地上睡覺，圓滾滾的大肚子朝天挺著、四腳朝天、閉眼、5 貓頭鷹站著、6 山豬站著、7 刺蝟站著、8 長頸鹿站著，脖子往左前方探出、9 松鼠站著尾巴翹起。

## F02 被踩（同順序；名字：rabbit_hit frog_hit mushroom_hit bear_hit owl_hit boar_hit hedgehog_hit giraffe_hit squirrel_hit）

F01 驗收通過。請交 F02，格式與 F01 完全相同、同九隻同順序、同大小，這次是被小狐從上面踩到的那一刻：1 兔子被壓扁、眼睛＞＜、2 青蛙被壓扁往前彈、3 香菇傘被壓扁、4 大熊肚子被壓凹下去但還在睡、5 貓頭鷹張開翅膀在飛、腳爪往下伸（要抓東西的樣子，不要畫被抓的東西）、6 山豬全速奔跑、四腳離地、7 刺蝟嚇一跳、全身刺豎起來、8 長頸鹿把脖子往右前方用力甩出去（頭在右上）、9 松鼠被壓扁但很開心、尾巴蓬起來。臉的方向維持朝左（第 8 格頭甩到右邊沒關係）。

## F03 動作的另一格（名字：owl_alt boar_alt frog_alt rabbit_alt squirrel_alt + 後四格不用）

F02 驗收通過。請交 F03，格式相同，給程式交替用的第二格：1 貓頭鷹飛行翅膀往下拍到底（和 F02 第 5 格一上一下）、2 山豬奔跑四腳收攏在身體下面（和 F02 第 6 格交替成奔跑）、3 青蛙在空中往左跳、腿伸直、4 兔子在空中跳起、5 松鼠在空中跳起。6～9 格留空白綠底。

## 動態（程式做，不用畫）

- 待機：呼吸起伏。被踩：壓扁回彈、香菇彈簧、熊肚子回彈、刺蝟發抖、長頸鹿甩完搖晃、被撲飛的刺蝟翻滾飛走。
- 貓頭鷹拍翅、山豬奔跑：F02／F03 兩格交替。如果交替起來太跳，再用 WAN 做這兩個的循環（貓頭鷹飛行、山豬奔跑）。

## 萬聖節變裝 H01–H03（`assets/friends/halloween/`，名字同 F01–F03）

把 F01／F02／F03 原圖附上，請 GPT 畫同一張的變裝版：姿勢、大小、位置都一樣，九隻的服裝固定為：
兔子紫色巫師帽和小斗篷、青蛙吸血鬼披風和小獠牙、香菇換成睡臉南瓜、大熊惡魔角頭箍和橘色領結、貓頭鷹黑色巫師帽、山豬紅色海盜頭巾和黑眼罩、
刺蝟黑貓耳頭箍和小斗篷、長頸鹿橘紫條紋圍巾和蝙蝠翅膀、松鼠小南瓜帽。
香菇在萬聖節版不是南瓜，而是女巫大釜（H04）：南瓜和背景的南瓜混在一起。大釜是綠色魔藥，所以用洋紅底、`greenkey.py --magenta` 去背，兩格（待機、被踩）縮放到跟南瓜一樣寬，存成 mushroom_idle／mushroom_hit。
處理流程同 F 系列，輸出到 `assets/friends/halloween`，名字寫進那裡的 index.json。萬聖節時 `fling.js` 先載入一般的圖，再用這裡有的圖蓋過去。

## 小狐穿吸血鬼披風 V01（`assets/fox/halloween/`，萬聖節才穿）

C01 只畫披風本身，疊在小狐身上不自然，所以改請 GPT 連小狐一起重畫：附上 `assets/source/V01_reference.png`（遊戲裡的四個姿勢 A 飛躍、B 下撲、C 蹲著、D 背面跳），
3×3 綠底：1–3 是 A，披風飄動三幀；4–5 是 B，兩幀；6 是 C；7–9 是 D 背面，三幀。
去背用 `greenkey.py --any-colour`。每格縮放成跟對應的遊戲幀一樣高，放在 480px 方格裡的同一個位置：A 對齊頭頂和右邊，B、C 對齊腳底和右邊，D 對齊腳底和頭的中心；同一組的幾幀再以頭的位置對齊。
存成 air_0..2、dive_0..1、crouch_0（.webp），用在側面的姿勢。

會動的動畫（雲端蹦跳、結束時歡呼和開心）要跟沒有披風的版本同樣的幀數和動作，所以改成用 WAN 重做：
- V02：附上 `assets/source/V02_reference.png`（cheer、happy、back_crouch、back_air 這四張 WAN 起始圖，2×2 排好），請 GPT 照同樣的格子、同樣的位置畫上披風。
- 每格對齊原圖（耳尖和腳底同高、頭在同一個中心）後存到 `assets/fox/wan_in/halloween/`。
- `python tools/wan_cape.py`：用原本 clip 的提示詞加上披風的描述，同樣的長度、seed 和結尾圖重跑 WAN，輸出到 `assets/fox/clips_halloween/`。原本有抽幀的 clip 會抽同樣的那幾幀。
- 翻滾、被甩飛等其他動作還是一般的動畫。
