# Windy 颱風各國預報路徑 + 模型更新時間（userscript）

在 `windy.com` 地圖上疊加各國氣象單位對同一個颱風的**預報路徑**，方便比較誰往哪走：

| 機構 | 顏色 | 資料來源 |
|---|---|---|
| 🇹🇼 台灣 中央氣象署 | 紅 | cwa.gov.tw 網頁公開資料（不需 API 金鑰） |
| 🇨🇳 中國 中央氣象台 | 橘 | typhoon.nmc.cn 公開 JSON |
| 🇯🇵 日本 氣象廳 | 藍 | jma.go.jp bosai 公開 JSON |

- 每個預報點標示預報時間（台灣時間）和最大風速（kt，節）
- 面板可切換颱風（同時有多顆時）、勾選要顯示哪幾國、按「飛到颱風」縮放地圖
- 每 30 分鐘自動重新抓資料
- 面板下方另有各天氣模型（ECMWF/GFS/NAM/ICON/MSM/UKMO）的更新時間，那是依週期推算的**估計值**，不是 Windy 官方時間
- 目前三家都沒有生效中的颱風時，面板會顯示「沒有生效中的颱風」

## 安裝（可自動更新）

需要 Tampermonkey 或 Violentmonkey 之類的使用者腳本管理器。
點這個網址就會跳出安裝畫面，之後有新版會自動更新：

https://raw.githubusercontent.com/charles0506/windy-update-reminder/main/windy-update-reminder.user.js

安裝時管理器會問是否允許連線到 `www.cwa.gov.tw`、`www.jma.go.jp`、`typhoon.nmc.cn`，要允許，否則抓不到資料（這些網站不允許網頁直接跨域讀取，必須靠管理器的 `GM_xmlhttpRequest`）。

## 注意

- 風速：台灣、日本用 10 分鐘平均，中國原始單位是公尺/秒，腳本統一換算成 kt。
- 路徑資料格式是各單位網站內部使用的格式，網站改版時可能抓不到，面板會顯示該單位「抓取失敗」。
- 模型更新時間的週期與延遲在腳本裡的 `MODELS` 陣列，可自行調整。改版要調高 `@version`，管理器才會偵測到更新。
