import { test } from "node:test";
import assert from "node:assert/strict";
import { rosterKey, normalizeName, parseNames, sessionMatches, sessionLabel } from "../roster.js";

test("名單代號", () => {
    assert.equal(rosterKey("d2", 3), "d2_3");
    assert.equal(rosterKey("d3", 12), "d3_12");
    assert.equal(rosterKey("npc", 0), "npc");
});

test("名字整理：去掉多餘空白", () => {
    assert.equal(normalizeName("  王小明 "), "王小明");
    assert.equal(normalizeName("Amy   Lin"), "Amy Lin");
    assert.equal(normalizeName(undefined), "");
});

test("名單解析：支援逗號、全形逗號、頓號、換行，並去除重複", () => {
    assert.deepEqual(parseNames("王小明, 李大華，陳美美、王小明\n張三\r\n\n"), ["王小明", "李大華", "陳美美", "張三"]);
    assert.deepEqual(parseNames(""), []);
});

test("登入身分是否符合這個頁面", () => {
    const s = { role: "d2", station: 3, name: "王小明" };
    assert.ok(sessionMatches(s, "d2", 3));
    assert.ok(!sessionMatches(s, "d2", 4), "不同關");
    assert.ok(!sessionMatches(s, "d3", 3), "不同天");
    assert.ok(!sessionMatches(null, "d2", 3));
    assert.ok(sessionMatches({ role: "npc", station: 0, name: "阿華" }, "npc", 1), "NPC 不看關卡");
});

test("登入身分顯示文字", () => {
    assert.equal(sessionLabel({ role: "d3", station: 2, name: "小明" }), "D3 關主・第 2 關・小明");
    assert.equal(sessionLabel({ role: "npc", station: 0, name: "阿華" }), "NPC・阿華");
});
