// 營會設定：每年換營會時，主要改這個檔案就好
// （隊數、關卡數、計分規則等可以在總控台裡改，存在資料庫）

export const firebaseConfig = {
    apiKey: "AIzaSyAV8VfWE6kInFbsoB9shrbcDm9dfJYrOno",
    authDomain: "awaken-2027.firebaseapp.com",
    projectId: "awaken-2027",
    storageBucket: "awaken-2027.firebasestorage.app",
    messagingSenderId: "445933860545",
    appId: "1:445933860545:web:0246ddf05c50bc2b688640"
};

export const CAMP = {
    name: "2027 Awaken",
    theme: "ALL IN",
    // 營會每一天，順序對應資料庫的 cols_d1 ~ cols_d4
    days: ["7/2", "7/3", "7/4", "7/5"]
};

// 系統保留欄位：大表中名稱相同的欄位會自動填入遊戲成績
export const D2_COLUMN = "大地(D2)";
export const D3_COLUMN = "大地(D3)";
export const NPC_COLUMN = "NPC";

// 每天的預設計分項目（總控台沒設定時使用）
export const DEFAULT_COLUMNS = [
    "開幕式,大破冰,小隊時間,晚會,講員額外,額外增減,生活秩序",
    "早場,大破冰,晚會,NPC,大地(D2),講員額外,額外增減,生活秩序",
    "早場,晚場,NPC,大地(D3),講員額外,額外增減,生活秩序",
    "早場,小隊任務,見證,講員,講員額外,額外增減,生活秩序"
];

export const DEFAULT_SETTINGS = {
    numTeams: 15,
    numStations_d2: 15,
    numStations_d3: 10,
    d2_maxMin: 59,
    d2_maxSec: 59,
    d2_maxScore: 999,
    d2_maxLikes: 3,
    d2_likePts: 10,
    d2_rules: { top1: 300, top2: 200, top3: 100, base: 50 },
    d3_maxRounds: 7,
    d3_maxLikes: 3,
    d3_likePts: 10,
    d3_rankScores: {},
    d2_status: {},
    d3_status: {},
    d2_configs: {},
    d3_currRounds: {},
    schedule: {},
    d2_locked: false,
    d2_hidden: false,
    d3_locked: false,
    d3_hidden: false
};
