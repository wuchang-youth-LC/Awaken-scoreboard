// 2027 新版大地遊戲：每一關選一種類型，依結果直接給分（不再用排行榜）
// 這個檔案不連資料庫，可以用 `npm test` 測試
//
// 一筆紀錄 records_game：
//   { game: "d2", station: 3, round: 1, teams: ["第1隊", "第2隊"],
//     result: { level: 0 } 或 { ranks: [1, 2] }, likes: { "第1隊": 2 },
//     by: "關主名字", createdAt, deleted: false }

import { D2_COLUMN, D3_COLUMN } from "./config.js";
import { withDefaults, teamList, teamNum, isValidTeam, campColumns, resolveBonusKey, UNCATEGORIZED } from "./scoring.js";

export const GAME_IDS = ["d2", "d3"];
export const GAME_LABELS = { d2: "D2", d3: "D3" };
export const GAME_COLUMNS = { d2: D2_COLUMN, d3: D3_COLUMN };

// 遊戲類型
//   solo   單隊闖關：過關就加分，可以分幾個等級
//   versus 多隊對抗：2～4 隊，依名次給分
//   coop   多隊合作：一起達到第幾個標準，每隊都拿對應的分數
export const GAME_TYPES = {
    solo: { label: "單隊闖關", minTeams: 1, maxTeams: 1 },
    versus: { label: "多隊對抗", minTeams: 2, maxTeams: 4 },
    coop: { label: "多隊合作", minTeams: 2, maxTeams: 4 }
};

const DEFAULT_LEVELS = {
    solo: [{ label: "過關", pts: 100 }],
    coop: [{ label: "標準一", pts: 50 }, { label: "標準二", pts: 100 }, { label: "標準三", pts: 150 }]
};
const DEFAULT_RANK_PTS = [100, 50, 30, 10];
const DEFAULT_GAME = { numStations: 10, maxRounds: 1, maxLikes: 3, likePts: 10, published: false };

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// ---------- 設定 ----------

export function normalizeStation(raw = {}) {
    const type = GAME_TYPES[raw.type] ? raw.type : "solo";
    const t = GAME_TYPES[type];
    const teamsPerMatch = clamp(num(raw.teamsPerMatch, t.minTeams), t.minTeams, t.maxTeams);
    const station = {
        name: String(raw.name ?? "").trim(),
        place: String(raw.place ?? "").trim(),
        type,
        teamsPerMatch
    };
    if (type === "versus") {
        station.rankPts = Array.from({ length: teamsPerMatch }, (_, i) => num(raw.rankPts?.[i], DEFAULT_RANK_PTS[i]));
        // 全部平手時每隊拿幾分；沒設定就取名次分的平均
        station.tiePts = Number.isFinite(raw.tiePts) ? raw.tiePts : null;
    } else {
        const levels = Array.isArray(raw.levels) && raw.levels.length ? raw.levels : DEFAULT_LEVELS[type];
        station.levels = levels.map((l, i) => ({ label: String(l?.label ?? "").trim() || `等級 ${i + 1}`, pts: num(l?.pts, 0) }));
    }
    return station;
}

export function gameConfig(settings, game) {
    const raw = settings?.games?.[game] || {};
    const numStations = Math.max(1, num(raw.numStations, DEFAULT_GAME.numStations));
    const stations = {};
    for (let st = 1; st <= numStations; st++) stations[st] = normalizeStation(raw.stations?.[st]);
    return {
        numStations,
        maxRounds: Math.max(1, num(raw.maxRounds, DEFAULT_GAME.maxRounds)),
        maxLikes: Math.max(0, num(raw.maxLikes, DEFAULT_GAME.maxLikes)),
        likePts: num(raw.likePts, DEFAULT_GAME.likePts),
        published: raw.published === true,
        locked: raw.locked === true,
        stations
    };
}

export function stationLabel(station, cfg) {
    const extra = [cfg?.name, cfg?.place].filter(Boolean).join("・");
    return extra ? `第 ${station} 關・${extra}` : `第 ${station} 關`;
}

// 賽程表：schedule[game][round][station] = ["第1隊", "第2隊"]
export function scheduledTeams(settings, game, round, station) {
    const teams = settings?.schedule?.[game]?.[round]?.[station];
    return Array.isArray(teams) ? teams : null;
}

// ---------- 單筆紀錄 ----------

// 檢查一筆紀錄合不合理，回傳錯誤訊息；沒問題回傳 null
export function validateRecord(record, cfg, numTeams) {
    const teams = record.teams;
    if (!Array.isArray(teams) || teams.length !== cfg.teamsPerMatch) return `這一關需要 ${cfg.teamsPerMatch} 隊`;
    if (teams.some(t => !isValidTeam(t, { numTeams }))) return "有不存在的隊伍";
    if (new Set(teams).size !== teams.length) return "隊伍不能重複";

    const result = record.result || {};
    if (cfg.type === "versus") {
        const ranks = result.ranks;
        if (!Array.isArray(ranks) || ranks.length !== teams.length) return "請選擇每一隊的名次";
        if (ranks.some(r => !Number.isInteger(r) || r < 1 || r > teams.length)) return "名次不正確";
        if (!ranks.includes(1)) return "至少要有一隊第 1 名";
    } else {
        const level = result.level;
        if (level !== null && !(Number.isInteger(level) && level >= 0 && level < cfg.levels.length)) return "請選擇結果";
    }

    const likes = record.likes || {};
    for (const [team, n] of Object.entries(likes)) {
        if (!teams.includes(team) || !Number.isInteger(n) || n < 0) return "讚數不正確";
    }
    return null;
}

// 這筆紀錄每隊拿到幾分（不含讚）
export function recordPoints(record, cfg) {
    const teams = record.teams || [];
    const result = record.result || {};
    const out = {};

    if (cfg.type === "versus") {
        const ranks = result.ranks || [];
        const allTied = ranks.length > 1 && ranks.every(r => r === ranks[0]);
        teams.forEach((team, i) => {
            if (allTied && cfg.tiePts !== null) { out[team] = cfg.tiePts; return; }
            // 同名次的隊伍平分它們佔掉的名次分：兩隊並列第 1，各拿（第 1 名 + 第 2 名）÷ 2
            const better = ranks.filter(r => r < ranks[i]).length;
            const same = ranks.filter(r => r === ranks[i]).length;
            let sum = 0;
            for (let pos = better; pos < better + same; pos++) sum += cfg.rankPts[pos] ?? 0;
            out[team] = Math.round(sum / same);
        });
        return out;
    }

    const pts = Number.isInteger(result.level) ? (cfg.levels[result.level]?.pts ?? 0) : 0;
    teams.forEach(team => { out[team] = pts; });
    return out;
}

export function resultText(record, cfg) {
    const result = record.result || {};
    if (cfg.type === "versus") {
        const ranks = result.ranks || [];
        if (ranks.length > 1 && ranks.every(r => r === ranks[0])) return "平手";
        return (record.teams || []).map((t, i) => `${t} 第${ranks[i]}名`).join("、");
    }
    return Number.isInteger(result.level) ? (cfg.levels[result.level]?.label ?? "") : "未達成";
}

export const activeRecords = records => records.filter(r => !r.deleted);

// ---------- 整場遊戲 ----------

// 每隊在這場遊戲的得分 = 各關得分 + 讚數 x 每讚分數
// 單隊闖關同一關玩很多次，只算最高分的那一次（讚數每次都算）
export function gamePoints(records, settings, game) {
    const s = withDefaults(settings);
    const g = gameConfig(settings, game);
    const out = Object.fromEntries(teamList(s.numTeams).map(t => [t, { points: 0, likes: 0, total: 0, stations: {} }]));

    for (const r of activeRecords(records)) {
        if (r.game !== game) continue;
        const cfg = g.stations[r.station];
        if (!cfg || validateRecord(r, cfg, s.numTeams)) continue;

        const pts = recordPoints(r, cfg);
        for (const team of r.teams) {
            const row = out[team];
            const prev = row.stations[r.station];
            if (cfg.type === "solo") row.stations[r.station] = Math.max(prev ?? 0, pts[team]);
            else row.stations[r.station] = (prev ?? 0) + pts[team];
            row.likes += Math.min(r.likes?.[team] || 0, g.maxLikes);
        }
    }
    for (const row of Object.values(out)) {
        row.points = Object.values(row.stations).reduce((a, b) => a + b, 0);
        row.total = row.points + row.likes * g.likePts;
    }
    return out;
}

// ---------- 總積分大表 ----------

// live: true  → 大地分數即時算進去（加分介面給牧者、計分組看）
// live: false → 只有按下「公布」的場次才算進正式總分
export function computeCampTotals(settings, gameRecords, bonusRecords, { live = false } = {}) {
    const s = withDefaults(settings);
    const columns = campColumns(s);
    const keys = columns.flatMap(d => d.keys);

    const rows = {};
    for (const t of teamList(s.numTeams)) {
        rows[t] = { team: t, cells: Object.fromEntries(keys.map(k => [k, 0])), pending: {}, uncategorized: 0, total: 0 };
    }

    const gameKeys = {};
    for (const game of GAME_IDS) {
        const key = keys.find(k => k.endsWith("_" + GAME_COLUMNS[game])) || null;
        gameKeys[game] = key;
        if (!key) continue;
        const counted = live || gameConfig(settings, game).published;
        const pts = gamePoints(gameRecords, settings, game);
        for (const t of Object.keys(pts)) {
            if (counted) rows[t].cells[key] += pts[t].total;
            else rows[t].pending[key] = pts[t].total;   // 還沒公布：先記著，不算進總分
        }
    }

    const uncategorizedRecords = [];
    for (const r of activeRecords(bonusRecords)) {
        const row = rows[r.team];
        const val = Number(r.val);
        if (!row || !Number.isFinite(val)) continue;
        const key = resolveBonusKey(r, columns);
        if (key === UNCATEGORIZED) { row.uncategorized += val; uncategorizedRecords.push(r); }
        else row.cells[key] += val;
    }

    for (const row of Object.values(rows)) {
        row.total = keys.reduce((sum, k) => sum + row.cells[k], 0) + row.uncategorized;
    }

    return {
        columns, keys, gameKeys,
        rows: Object.values(rows).sort((a, b) => teamNum(a.team) - teamNum(b.team)),
        uncategorizedRecords
    };
}

// ---------- 修改紀錄 ----------

// 每次新增、修改、刪除、復原都留一筆，匯出時當明細
export function auditEntry(action, collection, id, before, after, by, at = Date.now()) {
    return { action, collection, recordId: id, before: before ?? null, after: after ?? null, by: by || "", at };
}

export const AUDIT_LABELS = { create: "新增", update: "修改", delete: "刪除", restore: "復原" };

// ---------- 總控台設定用的文字格式 ----------

// 「過關=100, 完美過關=150」→ [{ label, pts }]
export function parseLevels(text) {
    return String(text ?? "").split(/[,，\n]+/).map(s => s.trim()).filter(Boolean).map(s => {
        const m = s.match(/^(.*?)\s*[=＝:：]\s*(-?\d+)$/);
        return m && m[1].trim() ? { label: m[1].trim(), pts: parseInt(m[2], 10) } : null;
    }).filter(Boolean);
}
export const formatLevels = levels => (levels || []).map(l => `${l.label}=${l.pts}`).join(", ");

// 「100, 50, 30」→ [100, 50, 30]
export function parseNumberList(text) {
    return String(text ?? "").split(/[,，\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);
}

// 從 Excel 貼上的賽程表：每一輪的第一列開頭是「第1輪」，
// 同一欄往下是同一關的隊伍（兩隊對抗就兩列、四隊對抗就四列），第 N 欄 = 第 N 關
export function parseScheduleTeams(text) {
    const lines = String(text ?? "").split(/\r?\n/).map(l => l.trimEnd());
    const schedule = {};
    let round = null, rows = [];
    const flush = () => {
        if (round === null) return;
        const matches = {};
        const width = Math.max(0, ...rows.map(r => r.length));
        for (let c = 0; c < width; c++) {
            const teams = rows.map(r => (r[c] || "").trim()).filter(Boolean).map(v => (/^\d+$/.test(v) ? `第${v}隊` : v));
            if (teams.length) matches[c + 1] = teams;
        }
        if (Object.keys(matches).length) schedule[round] = matches;
    };
    for (const line of lines) {
        const cols = line.split("\t");
        const head = cols[0].trim();
        const m = head.startsWith("第") && head.includes("輪") ? head.match(/\d+/) : null;
        if (m) {
            flush();
            round = parseInt(m[0], 10);
            rows = [cols.slice(1)];
        } else if (round !== null && line.trim()) {
            rows.push(cols.slice(1));
        }
    }
    flush();
    return schedule;
}

// ---------- 學員頁 ----------

// 學員頁現在顯示哪一場、開放哪些區塊（總控台設定）。預設只開地圖
export function studentConfig(settings) {
    const raw = settings?.student || {};
    return {
        game: GAME_IDS.includes(raw.game) ? raw.game : GAME_IDS[0],
        map: raw.map !== false,
        stations: raw.stations === true,
        scores: raw.scores === true
    };
}
