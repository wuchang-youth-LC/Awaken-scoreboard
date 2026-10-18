import { test } from "node:test";
import assert from "node:assert/strict";
import {
    withDefaults, teamNum, isValidTeam, formatTime, formatD2Value, clampInt,
    d2StationConfig, d2MaxVal, rankD2Station, d2Points, d2Likes,
    d3Standings, d3NextStation, d3Match, parseSchedule,
    campColumns, resolveBonusKey, computeTotals, UNCATEGORIZED
} from "../scoring.js";

const settings = (over = {}) => withDefaults({ numTeams: 4, numStations_d2: 2, ...over });

test("withDefaults：缺少或壞掉的數字會換回預設值", () => {
    const s = withDefaults({ d2_maxMin: NaN, d2_maxSec: null, numTeams: 8, d2_rules: { top1: 500, top2: NaN } });
    assert.equal(s.d2_maxMin, 59);
    assert.equal(s.d2_maxSec, 59);
    assert.equal(s.numTeams, 8);
    assert.deepEqual(s.d2_rules, { top1: 500, top2: 200, top3: 100, base: 50 });
    assert.deepEqual(s.d2_configs, {});
});

test("withDefaults：0 是合法設定，不會被當成沒設定", () => {
    const s = withDefaults({ d2_maxMin: 0, d2_maxSec: 30 });
    assert.equal(s.d2_maxMin, 0);
    assert.equal(d2MaxVal(s, { type: "time" }), 30);
});

test("隊伍名稱驗證", () => {
    const s = settings();
    assert.equal(teamNum("第12隊"), 12);
    assert.ok(isValidTeam("第4隊", s));
    assert.ok(!isValidTeam("第5隊", s), "超過隊伍數");
    assert.ok(!isValidTeam("第0隊", s));
    assert.ok(!isValidTeam(undefined, s));
});

test("格式化與數值限制", () => {
    assert.equal(formatTime(0), "00:00");
    assert.equal(formatTime(125), "02:05");
    assert.equal(formatD2Value(42, { type: "score", unit: "顆" }), "42 顆");
    assert.equal(formatD2Value(42, { type: "score", unit: "" }), "42");
    assert.equal(clampInt("70", 0, 59), 59);
    assert.equal(clampInt("-3", 0, 59), 0);
    assert.ok(Number.isNaN(clampInt("", 0, 59)));
});

test("D2 關卡設定：資料庫沒有這一關的設定時不會壞掉", () => {
    const s = settings({ d2_configs: { 1: { type: "score", unit: "分" } } });
    assert.deepEqual(d2StationConfig(s, 1), { type: "score", unit: "分" });
    assert.deepEqual(d2StationConfig(s, 16), { type: "time", unit: "" });
});

test("D2 上限：會用到設定的最大秒數", () => {
    const s = settings({ d2_maxMin: 5, d2_maxSec: 30 });
    assert.equal(d2MaxVal(s, { type: "time" }), 330);
    const ranked = rankD2Station([
        { station: 1, team: "第1隊", val: 330 },
        { station: 1, team: "第2隊", val: 331 }
    ], s, 1);
    assert.deepEqual(ranked.map(r => r.team), ["第1隊"]);
});

test("D2 計時關：每隊只取最快成績，同秒數同名次", () => {
    const s = settings();
    const records = [
        { station: 1, team: "第1隊", val: 90 },
        { station: 1, team: "第1隊", val: 60 },
        { station: 1, team: "第2隊", val: 60 },
        { station: 1, team: "第3隊", val: 100 },
        { station: 1, team: "第4隊", val: 200 },
        { station: 2, team: "第4隊", val: 10 },
        { station: 1, team: "第9隊", val: 1 },          // 不存在的隊伍
        { station: 1, team: "第3隊", val: -5 },         // 不合理的數值
        { station: 1, team: "第3隊", isLikeOnly: true, val: 1 }
    ];
    const ranked = rankD2Station(records, s, 1);
    assert.deepEqual(ranked.map(r => [r.team, r.val, r.rank]), [
        ["第1隊", 60, 1], ["第2隊", 60, 1], ["第3隊", 100, 2], ["第4隊", 200, 3]
    ]);
});

test("D2 計分關：分數越高越好", () => {
    const s = settings({ d2_configs: { 1: { type: "score" } } });
    const ranked = rankD2Station([
        { station: 1, team: "第1隊", val: 10 },
        { station: 1, team: "第2隊", val: 30 },
        { station: 1, team: "第2隊", val: 20 }
    ], s, 1);
    assert.deepEqual(ranked.map(r => [r.team, r.val, r.rank]), [["第2隊", 30, 1], ["第1隊", 10, 2]]);
});

test("D2 得分 = 名次分 + 讚數 x 每讚分數", () => {
    const s = settings({ d2_likePts: 10 });
    const records = [
        { station: 1, team: "第1隊", val: 60, likes: 2 },
        { station: 1, team: "第2隊", val: 60, likes: 1 },
        { station: 1, team: "第3隊", val: 70, likes: 0 },
        { station: 1, team: "第4隊", val: 80 },
        { station: 2, team: "第4隊", val: 30, likes: 3 }
    ];
    const pts = d2Points(records, s);
    assert.equal(pts["第1隊"].total, 300 + 20);
    assert.equal(pts["第2隊"].total, 300 + 10);
    assert.equal(pts["第3隊"].total, 200);
    assert.equal(pts["第4隊"].total, 100 + 300 + 30);
    assert.equal(d2Likes(records, s)["第4隊"], 3);
});

test("D3 戰績：勝多者前、同勝比敗少、同戰績同名次", () => {
    const s = settings({ d3_rankScores: { 1: 500, 2: 300, 3: 100 }, d3_likePts: 10 });
    const records = [
        { round: 1, station: 1, teamA: "第1隊", teamB: "第2隊", winner: "第1隊", loser: "第2隊", likesA: 1, likesB: 2 },
        { round: 1, station: 2, teamA: "第3隊", teamB: "第4隊", winner: "第3隊", likesA: 0, likesB: 0 }, // 舊資料沒有 loser
        { round: 2, station: 1, teamA: "第1隊", teamB: "第3隊", winner: "第1隊", loser: "第3隊" }
    ];
    const st = d3Standings(records, s);
    assert.deepEqual(st.map(e => [e.team, e.wins, e.losses, e.rank]), [
        ["第1隊", 2, 0, 1], ["第3隊", 1, 1, 2], ["第2隊", 0, 1, 3], ["第4隊", 0, 1, 3]
    ]);
    const t2 = st.find(e => e.team === "第2隊");
    assert.equal(t2.points, 100 + 20);
});

test("D3 下一關：依賽程表找出隊伍下一輪的關卡", () => {
    const s = settings({
        d3_maxRounds: 2,
        schedule: { 1: { 1: { a: "第1隊", b: "第2隊" } }, 2: { 3: { a: "第2隊", b: "第1隊" } } }
    });
    assert.deepEqual(d3NextStation([], s, "第1隊"), { round: 1, station: 1, done: false });
    const r1 = [{ round: 1, teamA: "第1隊", teamB: "第2隊", winner: "第1隊" }];
    assert.deepEqual(d3NextStation(r1, s, "第2隊"), { round: 2, station: 3, done: false });
    const r2 = [...r1, { round: 2, teamA: "第2隊", teamB: "第1隊", winner: "第2隊" }];
    assert.equal(d3NextStation(r2, s, "第1隊").done, true);
    assert.deepEqual(d3Match(s, 2, 3), { a: "第2隊", b: "第1隊" });
    assert.equal(d3Match(s, 5, 1), null);
});

test("賽程表解析：Excel 貼上的格式", () => {
    const text = "第1輪\t1\t3\t5\n\t2\t4\t6\n第2輪\t1\t2\t\n\t4\t5\t\n";
    assert.deepEqual(parseSchedule(text), {
        1: { 1: { a: "第1隊", b: "第2隊" }, 2: { a: "第3隊", b: "第4隊" }, 3: { a: "第5隊", b: "第6隊" } },
        2: { 1: { a: "第1隊", b: "第4隊" }, 2: { a: "第2隊", b: "第5隊" } }
    });
});

test("賽程表解析：格式錯誤時回傳空的（總控台會拒絕存入）", () => {
    assert.deepEqual(parseSchedule("隨便亂貼的文字\n1,2,3"), {});
});

test("大表欄位：支援全形逗號與多餘空白", () => {
    const s = settings({ cols_d1: "開幕式， 晚會 ,,生活秩序" });
    assert.deepEqual(campColumns(s)[0].cols, ["開幕式", "晚會", "生活秩序"]);
    assert.equal(campColumns(s)[1].day, "7/3");
});

test("加分歸類：對不上的欄位進「未分類」，NPC 依日期歸到當天 NPC 欄", () => {
    const cols = campColumns(settings());
    assert.equal(resolveBonusKey({ reason: "7/2_晚會" }, cols), "7/2_晚會");
    assert.equal(resolveBonusKey({ reason: "手動調整" }, cols), UNCATEGORIZED);
    assert.equal(resolveBonusKey({ reason: "7/4_神秘任務", npc: "小明" }, cols), "7/4_NPC");
    assert.equal(resolveBonusKey({ reason: "7/2_神秘任務", npc: "小明" }, cols), UNCATEGORIZED, "7/2 沒有 NPC 欄");
});

test("總分：遊戲成績、加分、未分類都會算進總分", () => {
    const s = settings({ d3_rankScores: { 1: 50 } });
    const d2 = [{ station: 1, team: "第1隊", val: 60, likes: 1 }];
    const d3 = [{ round: 1, station: 1, teamA: "第1隊", teamB: "第2隊", winner: "第1隊", loser: "第2隊" }];
    const bonus = [
        { team: "第1隊", reason: "7/2_晚會", val: 30 },
        { team: "第1隊", reason: "手動調整", val: 5 },
        { team: "第1隊", reason: "7/2_晚會", val: "abc" },
        { team: "第99隊", reason: "7/2_晚會", val: 1000 }
    ];
    const t = computeTotals(s, d2, d3, bonus);
    const row = t.rows.find(r => r.team === "第1隊");
    assert.equal(t.d2Key, "7/3_大地(D2)");
    assert.equal(t.d3Key, "7/4_大地(D3)");
    assert.equal(row.cells["7/3_大地(D2)"], 300 + 10);
    assert.equal(row.cells["7/4_大地(D3)"], 50);
    assert.equal(row.cells["7/2_晚會"], 30);
    assert.equal(row.uncategorized, 5);
    assert.equal(row.total, 310 + 50 + 30 + 5);
    assert.equal(t.uncategorizedRecords.length, 1);
    assert.deepEqual(t.rows.map(r => r.team), ["第1隊", "第2隊", "第3隊", "第4隊"]);
});

test("總分：一筆資料都沒有時，大家都是 0", () => {
    const t = computeTotals(settings(), [], [], []);
    assert.ok(t.rows.every(r => r.total === 0));
});
