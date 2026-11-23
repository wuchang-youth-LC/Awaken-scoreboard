// 場內加分頁（計分組、牧者）
import { test, expect, seedBase, setDocument, getDocument, listDocuments, staffLogin, expectNoErrors, NAMES } from "../helpers.js";

test.beforeEach(async () => { await seedBase(); });

test("不在名單上的名字進不去", async ({ page }) => {
    await page.goto("/npc.html");
    await page.locator(".gate input[name=name]").fill("亂打的名字");
    await page.locator(".gate button[type=submit]").click();
    await expect(page.locator(".gate .gate-error")).toContainText("名單裡沒有這個名字");
});

test("選隊伍 → 按常用分數就送出，隊伍總分即時更新", async ({ page }) => {
    await staffLogin(page, "/npc.html", NAMES.npc);
    const team3 = page.locator('#teamGrid button[data-team="第3隊"]');
    await expect(team3.locator("small")).toHaveText("0");

    await team3.click();
    await page.locator('#quickGrid button[data-val="20"]').click();

    await expect(page.locator("#history li").first()).toContainText("第3隊 +20");
    await expect(team3.locator("small")).toHaveText("20");
    // 送出後取消選取，避免下一筆加錯隊
    await expect(page.locator("#teamGrid button.picked")).toHaveCount(0);

    const [rec] = await listDocuments("records_bonus");
    expect(rec).toMatchObject({ team: "第3隊", val: 20, npc: NAMES.npc });
    expect(rec.reason).toMatch(/^7\/\d_/);
    expectNoErrors(page);
});

test("自訂分數（扣分）", async ({ page }) => {
    await staffLogin(page, "/npc.html", NAMES.npc);
    await page.locator('#teamGrid button[data-team="第1隊"]').click();
    await page.locator("#scoreInput").fill("-15");
    await page.locator("#submitBtn").click();
    await expect(page.locator("#history li").first()).toContainText("第1隊 -15");
});

test("沒選隊伍時分數按鈕不能按", async ({ page }) => {
    await staffLogin(page, "/npc.html", NAMES.npc);
    await expect(page.locator('#quickGrid button[data-val="20"]')).toBeDisabled();
});

test("刪除後可以復原", async ({ page }) => {
    await setDocument("records_bonus/b1", { team: "第2隊", reason: "7/2_晚會", val: 30, npc: NAMES.npc, timestamp: Date.now() });
    await staffLogin(page, "/npc.html", NAMES.npc);
    await page.locator("#history [data-del]").click();
    await expect(page.locator("#history li.deleted")).toHaveCount(1);
    await expect.poll(async () => (await getDocument("records_bonus/b1")).deleted).toBe(true);
    await page.locator("#history [data-restore]").click();
    await expect(page.locator("#history li.deleted")).toHaveCount(0);
});

test("看不到也刪不了別人送出的加分", async ({ page }) => {
    await setDocument("staff/npc", { names: [NAMES.npc, "另一位牧者"] });
    await setDocument("records_bonus/b1", { team: "第2隊", reason: "7/2_晚會", val: 30, npc: "另一位牧者", timestamp: Date.now() });
    await staffLogin(page, "/npc.html", NAMES.npc);
    await expect(page.locator("#history")).toContainText("還沒有紀錄");
    // 但隊伍總分有算進去
    await expect(page.locator('#teamGrid button[data-team="第2隊"] small')).toHaveText("30");
});

test("加分頁的總分即時包含還沒公布的大地分數", async ({ page }) => {
    await setDocument("records_game/r1", { game: "d2", station: 1, round: 1, teams: ["第5隊"], result: { level: 0 }, likes: {}, by: NAMES.d2, createdAt: Date.now() });
    await staffLogin(page, "/npc.html", NAMES.npc);
    await expect(page.locator('#teamGrid button[data-team="第5隊"] small')).toHaveText("100");
});

test("依總控台設定的時間自動選項目，手動改了就照手動的", async ({ page }) => {
    await seedBase({ bonusTimes: [{ minutes: 510, event: "早場" }, { minutes: 1140, event: "晚會" }] });
    await page.clock.setFixedTime(new Date("2027-07-03T19:30:00+08:00"));
    await staffLogin(page, "/npc.html", NAMES.npc);

    await expect(page.locator("#daySelect")).toHaveValue("7/3");
    await expect(page.locator("#eventSelect")).toHaveValue("晚會");
    await expect(page.locator("#autoHint")).toBeVisible();

    await page.locator("#eventSelect").selectOption("NPC");
    await expect(page.locator("#autoHint")).toBeHidden();
    await page.locator('#teamGrid button[data-team="第1隊"]').click();
    await page.locator('#quickGrid button[data-val="10"]').click();
    await expect(page.locator("#history li").first()).toContainText("7/3 NPC");
});

test("還沒到任何項目的時間，就用第一個項目", async ({ page }) => {
    await seedBase({ bonusTimes: [{ minutes: 1140, event: "晚會" }] });
    await page.clock.setFixedTime(new Date("2027-07-03T07:00:00+08:00"));
    await staffLogin(page, "/npc.html", NAMES.npc);
    await expect(page.locator("#eventSelect")).toHaveValue("早場");
    await expect(page.locator("#autoHint")).toBeHidden();
});
