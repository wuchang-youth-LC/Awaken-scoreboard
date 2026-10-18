# Awaken 營會計分系統

武昌青年營會用的即時計分網頁。純靜態網頁 + Firebase Firestore，不需要編譯。

## 頁面

| 網址 | 用途 | 誰在用 |
|---|---|---|
| `index.html` | D2 自由闖關排行榜 | 投影 / 學員手機 |
| `index_2.html` | D3 PK 對抗排行榜 | 投影 / 學員手機 |
| `admin.html?station=3` | D2 關主輸入（第 3 關） | 關主 |
| `admin_2.html?station=3` | D3 關主輸入（第 3 關） | 關主 |
| `npc.html` | NPC 加分 | NPC |
| `super_dashboard.html` | 總控台、參數設定、總積分大表 | 總召 / 計分組 |

## 檔案

- `config.js`：**每年要改的地方**，包含 Firebase 設定、營會日期、預設計分項目
- `scoring.js`：所有計分與排名邏輯（不連資料庫，有測試）
- `firebase.js`：資料庫連線與共用操作
- `ui.js`：各頁共用的小工具
- `style.css`：配色在最上面的 `:root`，換海報時改這裡和 `bg.jpg`

## 每年換營會

1. 在 GitHub 上把上一年的版本打 tag（例如 `git tag -a 2027 -m "2027 營會版本"`）
2. 用團隊帳號開新的 Firebase 專案，註冊網頁應用程式，把設定貼進 `config.js`
3. 改 `config.js` 的營會名稱與日期
4. 換 `bg.jpg`、`map.jpg`、`map_2.jpg`，調整 `style.css` 的配色
5. 在總控台設定隊數、關卡數、計分規則、匯入 D3 賽程表

## 測試

需要 Node.js 20 以上：

```
npm test
```

## 本機預覽

ES module 不能直接雙擊 html 開啟，要用本機伺服器，例如：

```
npx serve .
```
