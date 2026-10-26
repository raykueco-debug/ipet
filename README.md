# iPet 小狐（網頁原型）

iPhone 電子寵物的網頁版原型（PWA）。小狐每滿一週多長一條尾巴，最多九尾。

## 第一次設定

```bash
pip install -r requirements.txt
```

```bash
python tools/get_models.py
```

第二個指令會下載 Kokoro 英文語音模型（約 132 MB）到 `models/`。

## 執行

```bash
python server.py
```

- 聲音試聽和設定：http://localhost:8000/voices.html（目前小狐只說英文：af_heart 加上「小狐狸」變聲）

- 兒童端：http://localhost:8000
- 家長端：http://localhost:8000/parent.html（配對碼和兒童端「設定」裡顯示的一樣）
- iPhone（同一個 Wi-Fi）：`http://<電腦 IP>:8000`，在 Safari 分享選單選「加入主畫面」

設計文件：[docs/design.md](docs/design.md)

測試參數：
- `?week=5`：直接預覽第 5 週（5 條尾巴）
- `?speed=1440`：時間加速，現實 1 分鐘＝遊戲 1 天

## 素材（全部來自 GPT 協作 session）

| 路徑 | 內容 |
|---|---|
| `assets/source/` | GPT 交付的原始九宮格 |
| `assets/fox/*.png` | D01 表情（含 1 條尾巴），無尾素材缺時的備援 |
| `assets/fox/cub/` `teen/` `adult/` | 無尾身體（B01…），依成長階段 |
| `assets/fox/tail/t1..t9.png` | 單條尾巴（T01），App 會依週數扇形疊 N 條並擺動 |
| `assets/fox/anim.json` | WAN 動畫對應表（見下方） |

切九宮格：

```bash
python tools/slice_grid.py assets/source/<grid>.png assets/fox/cub happy smile surprised puzzled playful sulky sleepy angry normal
```

輸出為 512×512 透明 PNG，角色水平置中、腳底對齊同一條基準線。

## WAN 動畫接口

動畫做好後放進 `assets/fox/anim/`，並在 `anim.json` 登記即可，不用改程式。沒有登記的表情會顯示靜態圖。

```json
{
  "happy":       { "frames": "assets/fox/anim/happy/%03d.png", "count": 24, "fps": 12, "loop": true },
  "cub/playful": { "video": "assets/fox/anim/cub_playful.mov", "loop": false }
}
```

- 鍵名可以是表情名（套用到所有階段），或「階段/表情」（只套用到該階段）。
- **逐格序列（建議）**：透明 PNG 或 WebP，畫布與錨點必須和靜態圖相同（512²、腳底基準線一致），才能和尾巴層對齊。
- **影片**：iOS Safari 只支援 HEVC with alpha（.mov）的透明影片。WAN 輸出的影片沒有透明背景，要先去背再轉成逐格序列。
- 身體動畫要用**無尾身體**來跑，尾巴的擺動由 App 負責。
- 表情名稱：happy, smile, surprised, puzzled, playful, sulky, sleepy, angry, normal
