# Windy 颱風各國預報路徑 + 模型更新時間（userscript）

在 `windy.com` 地圖上疊加各國氣象單位對同一個颱風的**預報路徑**，方便比較誰往哪走：

| 機構 | 顏色 | 資料來源 |
|---|---|---|
| 🇹🇼 台灣 中央氣象署 | 紅 | cwa.gov.tw 網頁公開資料（不需 API 金鑰） |
| 🇨🇳 中國 中央氣象台 | 橘 | typhoon.nmc.cn 公開 JSON |
| 🇯🇵 日本 氣象廳 | 藍 | jma.go.jp bosai 公開 JSON |
| 🤖 Google WN2（WeatherNext 2 集合平均） | 紫 | Google Weather Lab 公開 CSV（FNV3P2） |

- 每個預報點標示預報時間（台灣時間）和最大風速（kt，節）
- 面板可切換颱風（同時有多顆時）、勾選要顯示哪幾國、按「飛到颱風」縮放地圖
- 每 30 分鐘自動重新抓資料
- 面板下方有 ECMWF、GFS 的更新時間：直接讀 Windy 自己的模型清單檔（跟「關於這些數據」視窗同一份資料），顯示參考時間（ref）、幾小時前更新、下次預期更新時間。Windy 免費版 ECMWF/GFS 是每 12 小時更新一次
- 目前三家都沒有生效中的颱風時，面板會顯示「沒有生效中的颱風」

## 有新預報就紅字提醒

每次載入頁面時，腳本會把各氣象單位目前的預報發布時間記在瀏覽器裡（localStorage，存在 windy.com 底下）。下次開 Windy 時，如果某個單位的發布時間比上次記的新，那一列就會變**紅字**（「有新預報」），面板收合時標題旁也會出現紅色「● 有新預報」。

- 比較對象是「上次載入頁面時」的值，不是上次看過面板的值，所以重新整理一次紅字就會消失
- 開著頁面期間如果又出了新預報，也會即時變紅
- 颱風路徑用各單位的實際發布時間；ECMWF／GFS 用 Windy 實際收到資料的時間（minifest 的 update 欄位）
- 第一次安裝時沒有「上次」可比，不會紅

## Windy 預設值

腳本也會幫你把 Windy 調成這幾個預設：

- 地圖預設圖層：**降雨**（每次載入頁面時切過去；網址已指定圖層，例如 `?temp,...`，就尊重網址不覆蓋）
- 地點預報側欄預設分頁：**Meteogram**（每次打開側欄自動點一次，之後你自己切換不會被搶回去）
- 「比較不同預報模式」預設圖層分頁：**Clouds, Rain**（同樣只自動點一次）

分頁是靠網頁上的文字比對點的（Meteogram、Clouds），Windy 改版或介面語言改變時可能失效。

## 安裝（可自動更新）

需要 Tampermonkey 或 Violentmonkey 之類的使用者腳本管理器。
點這個網址就會跳出安裝畫面，之後有新版會自動更新：

https://raw.githubusercontent.com/charles0506/windy-update-reminder/main/windy-update-reminder.user.js

安裝時管理器會問是否允許連線到 `www.cwa.gov.tw`、`www.jma.go.jp`、`typhoon.nmc.cn`、`deepmind.google.com`，要允許，否則抓不到資料（這些網站不允許網頁直接跨域讀取，必須靠管理器的 `GM_xmlhttpRequest`）。

## 沒有 ECMWF

ECMWF（歐洲模式）的官方颱風路徑檔是 BUFR（氣象專用二進位）格式，不容易在瀏覽器裡解，所以**這個腳本不畫 ECMWF 路徑**。GFS 的路徑美國 NOAA 也不公開，所以同樣沒有。

## 資料來源與條款

- Google WeatherNext 2：1 小時內的即時資料受 [GDM 使用條款](https://storage.googleapis.com/weathernext-public/terms-of-use.pdf) 約束，超過 1 小時為 CC BY 4.0。腳本只在你自己的瀏覽器讀取，不轉存、不轉發。
- Google 的路徑用「現況位置差 5 度以內」對上同一顆颱風，兩顆颱風靠很近時可能對錯。

## 注意

- 風速：台灣、日本用 10 分鐘平均，中國原始單位是公尺/秒，腳本統一換算成 kt。
- 路徑資料格式是各單位網站內部使用的格式，網站改版時可能抓不到，面板會顯示該單位「抓取失敗」。
- 模型更新時間依賴 Windy 網頁內部的 `W.products[...].loadMinifest()`，Windy 改版時可能失效，面板會顯示「讀取失敗」。要加其他模型，在腳本的 `MODELS` 陣列加 `{ code, label, ident }`（ident 是 Windy 內部代號，例如 `icon`、`jmaMsm`）。
- 改版要調高 `@version`，管理器才會偵測到更新。
