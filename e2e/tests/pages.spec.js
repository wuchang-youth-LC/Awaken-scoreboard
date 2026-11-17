// 每一頁都能打開、沒有錯誤、沒有超出螢幕，並存一張截圖
import { test, expect, seedBase, setDocument, staffLogin, adminLogin, expectNoOverflow, expectNoErrors, snap, NAMES } from "../helpers.js";

test.beforeEach(async () => {
    await seedBase();
    await setDocument("records_game/r1", { game: "d2", station: 1, round: 1, teams: ["第1隊"], result: { level: 0 }, likes: { "第1隊": 2 }, by: NAMES.d2, createdAt: Date.now() });
    await setDocument("records_bonus/b1", { team: "第2隊", reason: "7/2_晚會", val: 30, npc: NAMES.npc, timestamp: Date.now() });
    await setDocument("state/live", { active: { d2: { 2: { teams: ["第3隊"], by: "某關主" } } } });
});

test("學員頁", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.locator("#mapImg")).toBeVisible();
    await expect(page.locator("#stations .st-tile")).toHaveCount(4);
    await expect(page.locator("#stations .st-tile.busy")).toHaveCount(1);
    await expect(page.locator("#scores")).toContainText("第1隊");
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "學員頁");
});

test("工作人員入口", async ({ page }, info) => {
    await page.goto("/staff.html");
    await expect(page.locator("#d2 .entry")).toHaveCount(4);
    await expect(page.locator("#d3 .entry")).toHaveCount(3);
    await expect(page.locator("#d2 .entry").first()).toContainText("接力投球");
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "工作人員入口");
});

test("關主頁：登入畫面、空關、闖關中", async ({ page }, info) => {
    await page.goto("/station.html?game=d2&station=1");
    await expect(page.locator(".gate")).toBeVisible();
    await expectNoOverflow(page);
    await snap(page, info, "關主頁-登入");

    await staffLogin(page, "/station.html?game=d2&station=1", NAMES.d2);
    await expect(page.locator("#idleView")).toBeVisible();
    await expect(page.locator("#stationTitle")).toContainText("接力投球");
    await expectNoOverflow(page);
    await snap(page, info, "關主頁-空關");

    await page.locator("#startBtn").click();
    await expect(page.locator("#activeView")).toBeVisible();
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "關主頁-闖關中");
});

test("關主頁：兩隊對抗", async ({ page }, info) => {
    await staffLogin(page, "/station.html?game=d3&station=1", NAMES.d3);
    await page.locator("#startBtn").click();
    await expect(page.locator("#resultInput button[data-win]")).toHaveCount(3);
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "關主頁-對抗");
});

test("場內加分頁", async ({ page }, info) => {
    await staffLogin(page, "/npc.html", NAMES.npc);
    await expect(page.locator("#teamGrid button")).toHaveCount(6);
    await expect(page.locator("#history")).toContainText("第2隊");
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "場內加分");
});

test("總控台：每個分頁", async ({ page }, info) => {
    await adminLogin(page);
    for (const [tab, name] of [["score-panel", "總積分"], ["d2-panel", "D2"], ["d3-panel", "D3"], ["bonus-panel", "加分紀錄"], ["staff-panel", "工作人員"], ["setup-panel", "設定"]]) {
        await page.locator(`.tab[data-tab="${tab}"]`).click();
        await expect(page.locator(`#${tab}`)).toBeVisible();
        await expectNoOverflow(page);
        await snap(page, info, `總控台-${name}`);
    }
    await page.locator('.tab[data-tab="d2-panel"]').click();
    await page.locator('#d2-panel [data-act="settings"]').click();
    await expect(page.locator("#modal_game")).toBeVisible();
    await snap(page, info, "總控台-關卡設定");
    expectNoErrors(page);
});
