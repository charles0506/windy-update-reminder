# Windy 預報更新提醒（userscript）

在 `windy.com` 頁面右下角顯示各國天氣模型的上次執行時間與下次更新倒數。

| 模型 | 國家/地區 | 執行週期 | 發布延遲（估計） |
|---|---|---|---|
| ECMWF | 🇪🇺 歐洲 | 6 小時 | 6.5 小時 |
| GFS | 🇺🇸 美國 | 6 小時 | 4.5 小時 |
| NAM | 🇺🇸 美國 | 6 小時 | 3.5 小時 |
| ICON | 🇩🇪 德國 | 6 小時 | 3.75 小時 |
| MSM | 🇯🇵 日本 | 3 小時 | 2.5 小時 |
| UKMO | 🇬🇧 英國 | 6 小時 | 4.5 小時 |

## 安裝（可自動更新）

需要 Tampermonkey 或 Violentmonkey 之類的使用者腳本管理器。
點這個網址就會跳出安裝畫面，之後有新版會自動更新：

https://raw.githubusercontent.com/charles0506/windy-update-reminder/main/windy-update-reminder.user.js

開 windy.com，右下角會出現小面板（點一下展開／收合）。

## 重要前提

Windy **沒有**公開「模型上次更新時間」的頁面元素或 API。
這裡的時間是依各模型**執行週期 + 一般發布延遲反推的估計值**，不是實際時間戳，僅供參考。
發布延遲是估計值，各家實際會浮動，可能差一兩小時。

要調準確度就改 `windy-update-reminder.user.js` 裡的 `MODELS` 陣列（`cycleHours` / `delayHours`），也可以自行新增模型。改版要調高 `@version`，管理器才會偵測到更新。

執行時間以 **UTC** 顯示（例如 `08/23 06Z`），倒數則是本地時間差。
