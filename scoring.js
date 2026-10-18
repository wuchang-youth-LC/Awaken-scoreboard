// 所有計分與排名邏輯都集中在這裡，展示頁、NPC 頁、總控台共用同一套
// 這個檔案不連資料庫，所以可以用 `npm test` 直接測試

import { CAMP, DEFAULT_COLUMNS, DEFAULT_SETTINGS, D2_COLUMN, D3_COLUMN, NPC_COLUMN } from "./config.js";

export const UNCATEGORIZED = "未分類";

const NUMERIC_KEYS = Object.keys(DEFAULT_SETTINGS).filter(k => typeof DEFAULT_SETTINGS[k] === "number");

// 把資料庫的設定補上預設值；壞掉的數字（NaN、空值）一律換回預設
export function withDefaults(raw = {}) {
    const s = { ...DEFAULT_SETTINGS, ...raw };
    for (const k of NUMERIC_KEYS) {
        if (!Number.isFinite(s[k])) s[k] = DEFAULT_SETTINGS[k];
    }
    const rules = { ...DEFAULT_SETTINGS.d2_rules, ...(raw.d2_rules || {}) };
    for (const k of Object.keys(rules)) {
        if (!Number.isFinite(rules[k])) rules[k] = DEFAULT_SETTINGS.d2_rules[k];
    }
    s.d2_rules = rules;
    for (const k of ["d2_status", "d3_status", "d2_configs", "d3_currRounds", "schedule", "d3_rankScores"]) {
        if (!s[k] || typeof s[k] !== "object") s[k] = {};
    }
    return s;
}

// ---------- 隊伍 ----------

export const teamName = i => `第${i}隊`;

export function teamNum(name) {
    const m = String(name ?? "").match(/\d+/);
    return m ? parseInt(m[0], 10) : NaN;
}

export function teamList(n) {
    return Array.from({ length: n }, (_, i) => teamName(i + 1));
}

export function isValidTeam(name, s) {
    const n = teamNum(name);
    return Number.isInteger(n) && n >= 1 && n <= s.numTeams && name === teamName(n);
}

// ---------- 格式 ----------

export function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60), sec = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatD2Value(val, conf) {
    return conf.type === "time" ? formatTime(val) : `${val}${conf.unit ? " " + conf.unit : ""}`;
}

// 把輸入值轉成 min~max 之間的整數；不是數字回傳 NaN
export function clampInt(value, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return NaN;
    return Math.min(Math.max(n, min), max);
}

// 同分同名次：1, 1, 2, 3 ...
function denseRank(sorted, sameAsPrev) {
    let rank = 0;
    return sorted.map((item, i) => {
        if (i === 0 || !sameAsPrev(item, sorted[i - 1])) rank++;
        return { ...item, rank };
    });
}

// ---------- D2 自由闖關 ----------

export function d2StationConfig(s, station) {
    const c = s.d2_configs[station];
    return { type: c && c.type === "score" ? "score" : "time", unit: (c && c.unit) || "" };
}

export function d2MaxVal(s, conf) {
    return conf.type === "time" ? s.d2_maxMin * 60 + s.d2_maxSec : s.d2_maxScore;
}

export function isValidD2Val(val, s, conf) {
    return Number.isFinite(val) && val >= 0 && val <= d2MaxVal(s, conf);
}

// 某一關的排名：每隊只取最佳成績，計時越少越好、計分越多越好
export function rankD2Station(records, s, station) {
    const conf = d2StationConfig(s, station);
    const isTime = conf.type === "time";
    const best = {};
    for (const r of records) {
        if (r.station !== station || r.isLikeOnly) continue;
        if (!isValidTeam(r.team, s) || !isValidD2Val(r.val, s, conf)) continue;
        const cur = best[r.team];
        if (!cur || (isTime ? r.val < cur.val : r.val > cur.val)) best[r.team] = r;
    }
    const sorted = Object.values(best)
        .sort((a, b) => (isTime ? a.val - b.val : b.val - a.val) || teamNum(a.team) - teamNum(b.team))
        .map(r => ({ team: r.team, val: r.val, record: r }));
    return denseRank(sorted, (a, b) => a.val === b.val);
}

export function d2RankPoints(rank, s) {
    const r = s.d2_rules;
    return rank === 1 ? r.top1 : rank === 2 ? r.top2 : rank === 3 ? r.top3 : r.base;
}

export function d2Likes(records, s) {
    const likes = Object.fromEntries(teamList(s.numTeams).map(t => [t, 0]));
    for (const r of records) {
        if (likes[r.team] !== undefined && r.likes > 0) likes[r.team] += r.likes;
    }
    return likes;
}

// 每隊 D2 得分 = 各關名次分 + 讚數 x 每讚分數
export function d2Points(records, s) {
    const out = Object.fromEntries(teamList(s.numTeams).map(t => [t, { rankPoints: 0, likes: 0, total: 0 }]));
    for (let st = 1; st <= s.numStations_d2; st++) {
        for (const e of rankD2Station(records, s, st)) out[e.team].rankPoints += d2RankPoints(e.rank, s);
    }
    const likes = d2Likes(records, s);
    for (const t of Object.keys(out)) {
        out[t].likes = likes[t];
        out[t].total = out[t].rankPoints + likes[t] * s.d2_likePts;
    }
    return out;
}

// ---------- D3 PK 對抗 ----------

export function d3Loser(r) {
    return r.loser ?? (r.winner === r.teamA ? r.teamB : r.teamA);
}

// 勝場多的在前，勝場相同比敗場少
export function d3Standings(records, s) {
    const st = Object.fromEntries(teamList(s.numTeams).map(t => [t, { team: t, wins: 0, losses: 0, likes: 0 }]));
    for (const r of records) {
        if (st[r.winner]) st[r.winner].wins++;
        const loser = d3Loser(r);
        if (st[loser]) st[loser].losses++;
        if (st[r.teamA] && r.likesA > 0) st[r.teamA].likes += r.likesA;
        if (st[r.teamB] && r.likesB > 0) st[r.teamB].likes += r.likesB;
    }
    const sorted = Object.values(st).sort((a, b) => b.wins - a.wins || a.losses - b.losses || teamNum(a.team) - teamNum(b.team));
    return denseRank(sorted, (a, b) => a.wins === b.wins && a.losses === b.losses).map(e => {
        const rankPoints = Number(s.d3_rankScores[e.rank]) || 0;
        return { ...e, rankPoints, points: rankPoints + e.likes * s.d3_likePts };
    });
}

// 這隊下一輪要去哪一關（依賽程表）
export function d3NextStation(records, s, team) {
    let lastRound = 0;
    for (const r of records) {
        if ((r.teamA === team || r.teamB === team) && r.round > lastRound) lastRound = r.round;
    }
    if (lastRound >= s.d3_maxRounds) return { round: lastRound, station: null, done: true };
    const round = lastRound + 1;
    const matches = s.schedule[round] || {};
    for (const station of Object.keys(matches)) {
        const m = matches[station];
        if (m.a === team || m.b === team) return { round, station: parseInt(station, 10), done: false };
    }
    return { round, station: null, done: false };
}

export function d3Match(s, round, station) {
    const m = (s.schedule[round] || {})[station];
    return m ? { a: m.a, b: m.b } : null;
}

// 從 Excel 貼上的賽程表解析：
// 第1輪  1  3  5 ...   ← 隊伍 A（第 N 欄 = 第 N 關）
//        2  4  6 ...   ← 隊伍 B
export function parseSchedule(text) {
    const lines = String(text).split(/\r?\n/).map(l => l.trimEnd());
    const schedule = {};
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!(line.startsWith("第") && line.includes("輪"))) continue;
        const roundMatch = line.split("\t")[0].match(/\d+/);
        if (!roundMatch) continue;
        const round = parseInt(roundMatch[0], 10);
        const colsA = line.split("\t");
        const colsB = (lines[i + 1] || "").split("\t");
        const matches = {};
        for (let col = 1; col < colsA.length; col++) {
            const a = (colsA[col] || "").trim(), b = (colsB[col] || "").trim();
            if (!a || !b) continue;
            matches[col] = {
                a: /^\d+$/.test(a) ? teamName(a) : a,
                b: /^\d+$/.test(b) ? teamName(b) : b
            };
        }
        if (Object.keys(matches).length) schedule[round] = matches;
    }
    return schedule;
}

// ---------- 總積分大表 ----------

export function splitColumns(raw) {
    return String(raw).split(/[,，]/).map(c => c.trim()).filter(Boolean);
}

export function campColumns(s) {
    return CAMP.days.map((day, i) => {
        const cols = splitColumns(s[`cols_d${i + 1}`] ?? DEFAULT_COLUMNS[i]);
        return { day, cols, keys: cols.map(c => `${day}_${c}`) };
    });
}

// 手動 / NPC 加分要放進哪一欄；對不上的放「未分類」，不會再默默消失
export function resolveBonusKey(r, columns) {
    const reason = String(r.reason ?? "");
    if (columns.some(d => d.keys.includes(reason))) return reason;
    if (r.npc) {
        const day = reason.split("_")[0];
        const d = columns.find(c => c.day === day && c.cols.includes(NPC_COLUMN));
        if (d) return `${day}_${NPC_COLUMN}`;
    }
    return UNCATEGORIZED;
}

export function computeTotals(s, recordsD2, recordsD3, recordsBonus) {
    const columns = campColumns(s);
    const keys = columns.flatMap(d => d.keys);
    const d2Key = keys.find(k => k.endsWith("_" + D2_COLUMN)) || null;
    const d3Key = keys.find(k => k.endsWith("_" + D3_COLUMN)) || null;

    const rows = {};
    for (const t of teamList(s.numTeams)) {
        rows[t] = { team: t, cells: Object.fromEntries(keys.map(k => [k, 0])), uncategorized: 0, total: 0 };
    }

    if (d2Key) {
        const d2 = d2Points(recordsD2, s);
        for (const t of Object.keys(d2)) rows[t].cells[d2Key] += d2[t].total;
    }
    if (d3Key) {
        for (const e of d3Standings(recordsD3, s)) rows[e.team].cells[d3Key] += e.points;
    }

    const uncategorizedRecords = [];
    for (const r of recordsBonus) {
        const row = rows[r.team];
        const val = Number(r.val);
        if (!row || !Number.isFinite(val)) continue;
        const key = resolveBonusKey(r, columns);
        if (key === UNCATEGORIZED) {
            row.uncategorized += val;
            uncategorizedRecords.push(r);
        } else {
            row.cells[key] += val;
        }
    }

    for (const row of Object.values(rows)) {
        row.total = keys.reduce((sum, k) => sum + row.cells[k], 0) + row.uncategorized;
    }

    return {
        columns, keys, d2Key, d3Key,
        rows: Object.values(rows).sort((a, b) => teamNum(a.team) - teamNum(b.team)),
        uncategorizedRecords
    };
}
