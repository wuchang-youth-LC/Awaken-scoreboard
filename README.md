# Awaken 營會計分系統

武昌青年營會用的即時計分網頁。純靜態網頁 + Firebase（Firestore、Authentication），不需要編譯。

需求與設計決定寫在 [docs/需求規劃.md](docs/需求規劃.md)。

## 頁面

| 網址 | 用途 | 誰在用 | 登入方式 |
|---|---|---|---|
| `index.html` | 學員頁：地圖，以及可開關的關卡狀態、各隊大地得分 | 學員（手機） | 不用登入 |
| `staff.html` | 工作人員入口：選自己的關卡或「場內加分」 | 關主、計分組、牧者 | — |
| `station.html?game=d2&station=3` | 關主頁（D2 第 3 關） | 關主 | 輸入名字（要在名單上） |
| `npc.html` | 場內加分 | 計分組、牧者 | 輸入名字（要在名單上） |
| `super_dashboard.html` | 總控台：總積分、大地遊戲、加分紀錄、名單、設定 | 計分組管理員 | Email + 密碼 |

把 `staff.html` 的網址傳給工作人員就好，其他頁面都從那裡進去。

## 檔案

- `config.js`：**每年要改的地方**，Firebase 設定、營會年份與日期、預設計分項目
- `games.js`：大地遊戲的類型、給分、總積分（不連資料庫，有測試）
- `scoring.js`：隊伍、計分項目、加分歸類等共用邏輯（不連資料庫，有測試）
- `roster.js`：工作人員名單的共用邏輯（有測試）
- `store.js`：資料存取（練習模式、刪除可復原、修改紀錄、各關即時狀態）
- `auth.js`：登入（關主用名字、管理員用帳號密碼）
- `firebase.js`、`ui.js`、`record-form.js`：連線與各頁共用的小工具
- `style.css`：配色在最上面的 `:root`；淺色主題是 `body.light`（戶外用的頁面）
- `firestore.rules`：資料庫安全規則
- `assets/`、`bg.jpg`、`map.jpg`、`map_2.jpg`：海報素材與地圖

## 每年換營會

1. 在 GitHub 上把上一年的版本打 tag（例如 `git tag -a 2027 -m "2027 營會版本"`）
2. 用團隊帳號開新的 Firebase 專案：
   - Firestore 選 `asia-east1`、正式版模式
   - Authentication 開啟「匿名」和「電子郵件/密碼」，新增管理員帳號
   - 註冊網頁應用程式，把設定貼進 `config.js`，並改 `.firebaserc` 的專案名稱
   - 把管理員的 UID 填進 `firestore.rules` 的 `adminUids()`，執行 `firebase deploy --only firestore:rules`
3. 改 `config.js` 的營會年份、名稱、日期
4. 換 `bg.jpg`、地圖、`assets/` 裡的素材（`tools/make_assets.py` 可以從海報裁圖），調整 `style.css` 的配色
5. 登入總控台設定：隊數、計分項目、D2 / D3 的關卡與分數、賽程表、工作人員名單
6. 關主訓時打開「練習模式」，結束後清空練習資料

## 測試

需要 Node.js 20 以上。

```
npm test                      # 計分邏輯
node tools/check-imports.mjs  # 各檔案的 import 是否對得上
```

安全規則改過之後，要對真的資料庫實測（第一次先在 `tools/rules-test` 執行 `npm install`）。
先在總控台把「測試關主」加進 D2 第 1 關的名單，再執行：

```
node tools/rules-test/test.mjs 測試關主
```

剛部署完規則要等大約一分鐘才會完全生效，太快測會誤判。

## 本機預覽

```
node tools/serve.mjs
```

然後開 http://localhost:5179/staff.html 。
