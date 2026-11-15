import { test } from "node:test";
import assert from "node:assert/strict";
import {
    normalizeStation, gameConfig, stationLabel, scheduledTeams, validateRecord, recordPoints, resultText,
    gamePoints, computeCampTotals, auditEntry
} from "../games.js";

const solo = normalizeStation({ type: "solo", levels: [{ label: "過關", pts: 100 }, { label: "完美過關", pts: 150 }] });
const versus2 = normalizeStation({ type: "versus", teamsPerMatch: 2, rankPts: [100, 40] });
const versus4 = normalizeStation({ type: "versus", teamsPerMatch: 4, rankPts: [100, 60, 30, 10] });
const coop = normalizeStation({ type: "coop", teamsPerMatch: 2 });

const settings = (over = {}) => ({
    numTeams: 4,
    games: {
        d2: { numStations: 2, likePts: 10, maxLikes: 3, stations: { 1: solo, 2: coop } },
        d3: { numStations: 1, likePts: 10, maxLikes: 3, stations: { 1: versus2 } }
    },
    ...over
});

test("關卡設定：沒設定時有合理的預設值", () => {
    const st = normalizeStation();
    assert.equal(st.type, "solo");
    assert.equal(st.teamsPerMatch, 1);
    assert.deepEqual(st.levels, [{ label: "過關", pts: 100 }]);
    assert.equal(normalizeStation({ type: "亂打" }).type, "solo");
});

test("關卡設定：對抗關的隊數限制在 2～4，名次分數補滿", () => {
    const st = normalizeStation({ type: "versus", teamsPerMatch: 9, rankPts: [200] });
    assert.equal(st.teamsPerMatch, 4);
    assert.deepEqual(st.rankPts, [200, 50, 30, 10]);
    assert.equal(st.tiePts, null);
    assert.equal(normalizeStation({ type: "versus", teamsPerMatch: 1 }).teamsPerMatch, 2);
});

test("場次設定：空的資料庫也能運作", () => {
    const g = gameConfig({}, "d2");
    assert.equal(g.numStations, 10);
    assert.equal(g.published, false);
    assert.equal(g.stations[10].type, "solo");
    assert.equal(gameConfig(undefined, "d3").maxLikes, 3);
});

test("關卡顯示名稱", () => {
    assert.equal(stationLabel(3, { name: "接力投球", place: "籃球場" }), "第 3 關・接力投球・籃球場");
    assert.equal(stationLabel(3, { name: "", place: "" }), "第 3 關");
});

test("賽程表查詢", () => {
    const s = { schedule: { d3: { 2: { 1: ["第1隊", "第3隊"] } } } };
    assert.deepEqual(scheduledTeams(s, "d3", 2, 1), ["第1隊", "第3隊"]);
    assert.equal(scheduledTeams(s, "d3", 9, 1), null);
    assert.equal(scheduledTeams({}, "d2", 1, 1), null);
});

test("紀錄檢查：隊數、隊伍、名次、讚數", () => {
    assert.equal(validateRecord({ teams: ["第1隊"], result: { level: 0 } }, solo, 4), null);
    assert.equal(validateRecord({ teams: ["第1隊"], result: { level: null } }, solo, 4), null, "未過關也是合法結果");
    assert.ok(validateRecord({ teams: ["第1隊", "第2隊"], result: { level: 0 } }, solo, 4), "隊數不對");
    assert.ok(validateRecord({ teams: ["第9隊"], result: { level: 0 } }, solo, 4), "隊伍不存在");
    assert.ok(validateRecord({ teams: ["第1隊"], result: { level: 5 } }, solo, 4), "沒有這個等級");
    assert.ok(validateRecord({ teams: ["第1隊"], result: {} }, solo, 4), "沒選結果");
    assert.ok(validateRecord({ teams: ["第1隊", "第1隊"], result: { ranks: [1, 2] } }, versus2, 4), "隊伍重複");
    assert.ok(validateRecord({ teams: ["第1隊", "第2隊"], result: { ranks: [2, 2] } }, versus2, 4), "沒有第 1 名");
    assert.ok(validateRecord({ teams: ["第1隊", "第2隊"], result: { ranks: [1, 3] } }, versus2, 4), "名次超出範圍");
    assert.equal(validateRecord({ teams: ["第1隊", "第2隊"], result: { ranks: [1, 1] } }, versus2, 4), null, "平手合法");
    assert.ok(validateRecord({ teams: ["第1隊"], result: { level: 0 }, likes: { "第2隊": 1 } }, solo, 4), "讚給了沒參加的隊");
});

test("單隊闖關：依等級給分，未過關 0 分", () => {
    assert.deepEqual(recordPoints({ teams: ["第1隊"], result: { level: 1 } }, solo), { "第1隊": 150 });
    assert.deepEqual(recordPoints({ teams: ["第1隊"], result: { level: null } }, solo), { "第1隊": 0 });
});

test("兩隊對抗：贏、輸、平手", () => {
    const teams = ["第1隊", "第2隊"];
    assert.deepEqual(recordPoints({ teams, result: { ranks: [1, 2] } }, versus2), { "第1隊": 100, "第2隊": 40 });
    assert.deepEqual(recordPoints({ teams, result: { ranks: [2, 1] } }, versus2), { "第1隊": 40, "第2隊": 100 });
    assert.deepEqual(recordPoints({ teams, result: { ranks: [1, 1] } }, versus2), { "第1隊": 70, "第2隊": 70 }, "平手取平均");
});

test("兩隊對抗：可以另外指定平手分數", () => {
    const cfg = normalizeStation({ type: "versus", teamsPerMatch: 2, rankPts: [100, 40], tiePts: 50 });
    assert.deepEqual(recordPoints({ teams: ["第1隊", "第2隊"], result: { ranks: [1, 1] } }, cfg), { "第1隊": 50, "第2隊": 50 });
});

test("四隊對抗：部分並列時，平分佔掉的名次分", () => {
    const teams = ["第1隊", "第2隊", "第3隊", "第4隊"];
    // 第 1 名一隊、兩隊並列第 2（平分第 2、3 名的分數）、最後一隊第 4
    assert.deepEqual(recordPoints({ teams, result: { ranks: [1, 2, 2, 4] } }, versus4),
        { "第1隊": 100, "第2隊": 45, "第3隊": 45, "第4隊": 10 });
    assert.equal(resultText({ teams, result: { ranks: [1, 1, 1, 1] } }, versus4), "平手");
});

test("多隊合作：每隊都拿到達成標準的分數", () => {
    const teams = ["第1隊", "第2隊"];
    assert.deepEqual(recordPoints({ teams, result: { level: 2 } }, coop), { "第1隊": 150, "第2隊": 150 });
    assert.deepEqual(recordPoints({ teams, result: { level: null } }, coop), { "第1隊": 0, "第2隊": 0 });
    assert.equal(resultText({ teams, result: { level: 1 } }, coop), "標準二");
    assert.equal(resultText({ teams, result: { level: null } }, coop), "未達成");
});

test("整場得分：還沒玩的隊伍是 0 分（不會再有「一開始大家都第一名」）", () => {
    const pts = gamePoints([], settings(), "d3");
    assert.ok(Object.values(pts).every(p => p.total === 0));
});

test("整場得分：單隊闖關重複玩只算最高分，讚每次都算", () => {
    const records = [
        { game: "d2", station: 1, teams: ["第1隊"], result: { level: 0 }, likes: { "第1隊": 1 } },
        { game: "d2", station: 1, teams: ["第1隊"], result: { level: 1 }, likes: { "第1隊": 2 } },
        { game: "d2", station: 1, teams: ["第1隊"], result: { level: null } },
        { game: "d2", station: 2, teams: ["第1隊", "第2隊"], result: { level: 0 } },
        { game: "d3", station: 1, teams: ["第1隊", "第2隊"], result: { ranks: [1, 2] } }
    ];
    const pts = gamePoints(records, settings(), "d2");
    assert.equal(pts["第1隊"].points, 150 + 50);
    assert.equal(pts["第1隊"].likes, 3);
    assert.equal(pts["第1隊"].total, 200 + 30);
    assert.equal(pts["第2隊"].total, 50);
    assert.equal(pts["第3隊"].total, 0);
});

test("整場得分：已刪除、不合理的紀錄不算；讚數超過上限只算到上限", () => {
    const records = [
        { game: "d3", station: 1, teams: ["第1隊", "第2隊"], result: { ranks: [1, 2] }, deleted: true },
        { game: "d3", station: 1, teams: ["第1隊", "第9隊"], result: { ranks: [1, 2] } },
        { game: "d3", station: 5, teams: ["第1隊", "第2隊"], result: { ranks: [1, 2] } },
        { game: "d3", station: 1, teams: ["第3隊", "第4隊"], result: { ranks: [1, 2] }, likes: { "第3隊": 99 } }
    ];
    const pts = gamePoints(records, settings(), "d3");
    assert.equal(pts["第1隊"].total, 0);
    assert.equal(pts["第3隊"].total, 100 + 3 * 10);
    assert.equal(pts["第4隊"].total, 40);
});

test("總分：大地分數要「公布」後才算進正式總分，加分介面則即時顯示", () => {
    const games = [
        { game: "d2", station: 1, teams: ["第1隊"], result: { level: 0 } },
        { game: "d3", station: 1, teams: ["第1隊", "第2隊"], result: { ranks: [1, 2] } }
    ];
    const bonus = [
        { team: "第1隊", reason: "7/2_晚會", val: 30 },
        { team: "第1隊", reason: "7/2_晚會", val: 500, deleted: true },
        { team: "第2隊", reason: "對不上的項目", val: 5 }
    ];
    const row = (t, team) => t.rows.find(r => r.team === team);

    const official = computeCampTotals(settings(), games, bonus);
    assert.equal(row(official, "第1隊").total, 30, "還沒公布，只有加分");
    assert.equal(row(official, "第1隊").pending["7/3_大地(D2)"], 100);
    assert.equal(row(official, "第2隊").total, 5, "未分類的加分照樣算");
    assert.equal(official.uncategorizedRecords.length, 1);

    const live = computeCampTotals(settings(), games, bonus, { live: true });
    assert.equal(row(live, "第1隊").total, 30 + 100 + 100);
    assert.equal(row(live, "第2隊").total, 5 + 40);

    const s = settings();
    s.games.d2.published = true;
    const partly = computeCampTotals(s, games, bonus);
    assert.equal(row(partly, "第1隊").total, 30 + 100, "只公布 D2");
    assert.equal(row(partly, "第1隊").cells["7/4_大地(D3)"], 0);
});

test("修改紀錄的格式", () => {
    const e = auditEntry("delete", "records_game", "abc", { station: 1 }, null, "小明", 123);
    assert.deepEqual(e, { action: "delete", collection: "records_game", recordId: "abc", before: { station: 1 }, after: null, by: "小明", at: 123 });
});

import { parseLevels, formatLevels, parseNumberList, parseScheduleTeams } from "../games.js";

test("設定文字：等級與分數", () => {
    assert.deepEqual(parseLevels("過關=100， 完美過關 : 150\n亂打, =5"), [{ label: "過關", pts: 100 }, { label: "完美過關", pts: 150 }]);
    assert.equal(formatLevels([{ label: "過關", pts: 100 }, { label: "完美", pts: 150 }]), "過關=100, 完美=150");
    assert.deepEqual(parseNumberList("100, 50，30 abc"), [100, 50, 30]);
});

test("賽程表：兩隊與四隊都能解析", () => {
    assert.deepEqual(parseScheduleTeams("第1輪\t1\t3\n\t2\t4\n第2輪\t1\t2\n\t3\t4\n"), {
        1: { 1: ["第1隊", "第2隊"], 2: ["第3隊", "第4隊"] },
        2: { 1: ["第1隊", "第3隊"], 2: ["第2隊", "第4隊"] }
    });
    assert.deepEqual(parseScheduleTeams("第1輪\t1\n\t2\n\t3\n\t4"), { 1: { 1: ["第1隊", "第2隊", "第3隊", "第4隊"] } });
    assert.deepEqual(parseScheduleTeams("亂貼的文字"), {});
});
