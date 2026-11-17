// 關主頁的實際操作流程
import { test, expect, seedBase, setDocument, getDocument, listDocuments, staffLogin, expectNoErrors, NAMES } from "../helpers.js";

const D2_1 = "/station.html?game=d2&station=1";

test.beforeEach(async () => { await seedBase(); });

test("不在名單上的名字進不去", async ({ page }) => {
    await page.goto(D2_1);
    await page.locator(".gate input[name=name]").fill("亂打的名字");
    await page.locator(".gate button[type=submit]").click();
    await expect(page.locator(".gate .gate-error")).toContainText("名單裡沒有這個名字");
    await expect(page.locator(".gate")).toBeVisible();
});

test("名單上的人換到別關也進不去", async ({ page }) => {
    await page.goto("/station.html?game=d2&station=2");
    await page.locator(".gate input[name=name]").fill(NAMES.d2);
    await page.locator(".gate button[type=submit]").click();
    await expect(page.locator(".gate .gate-error")).toContainText("名單裡沒有這個名字");
});

test("單隊闖關：開始 → 過關 → 給讚 → 送出 → 自動空關", async ({ page }) => {
    await staffLogin(page, D2_1, NAMES.d2);
    await page.locator('#teamPickers select[data-team="0"]').selectOption("第2隊");
    await page.locator("#startBtn").click();
    await expect(page.locator("#activeTeams")).toHaveText("第2隊");

    // 闖關中：資料庫和其他人都看得到
    const busy = await getDocument("state/live");
    expect(busy.active.d2["1"].teams).toEqual(["第2隊"]);

    await page.locator('#resultInput button[data-level="0"]').click();
    await page.locator('#likesInput button[data-step="1"]').click();
    await page.locator("#submitBtn").click();

    await expect(page.locator("#idleView")).toBeVisible();
    await expect(page.locator("#records li").first()).toContainText("第2隊 +100");

    const records = await listDocuments("records_game");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ game: "d2", station: 1, teams: ["第2隊"], result: { level: 0 }, likes: { "第2隊": 1 }, by: NAMES.d2 });
    expect((await getDocument("state/live")).active?.d2?.["1"]).toBeUndefined();
    // 每一次新增都有修改紀錄
    expect(await listDocuments("audit")).toHaveLength(1);
    expectNoErrors(page);
});

test("沒選結果不能送出", async ({ page }) => {
    await staffLogin(page, D2_1, NAMES.d2);
    await page.locator("#startBtn").click();
    await page.locator("#submitBtn").click();
    await expect(page.locator("#toast")).toContainText("請先選擇結果");
    expect(await listDocuments("records_game")).toHaveLength(0);
});

test("取消闖關會改回空關，不會留下紀錄", async ({ page }) => {
    await staffLogin(page, D2_1, NAMES.d2);
    await page.locator("#startBtn").click();
    await page.locator("#cancelBtn").click();
    await expect(page.locator("#idleView")).toBeVisible();
    expect(await listDocuments("records_game")).toHaveLength(0);
});

test("兩隊對抗：平手各拿平均分", async ({ page }) => {
    await staffLogin(page, "/station.html?game=d3&station=1", NAMES.d3);
    await page.locator("#startBtn").click();
    await page.locator('#resultInput button[data-win="tie"]').click();
    await page.locator("#submitBtn").click();
    await expect(page.locator("#records li").first()).toContainText("第1隊 +75");
    await expect(page.locator("#records li").first()).toContainText("第2隊 +75");
    const [rec] = await listDocuments("records_game");
    expect(rec.result.ranks).toEqual([1, 1]);
});

test("刪除後可以復原", async ({ page }) => {
    await setDocument("records_game/r1", { game: "d2", station: 1, round: 1, teams: ["第3隊"], result: { level: 0 }, likes: {}, by: NAMES.d2, createdAt: Date.now() });
    await staffLogin(page, D2_1, NAMES.d2);
    await page.locator("#records [data-del]").click();
    await expect(page.locator("#records li.deleted")).toHaveCount(1);
    await expect.poll(async () => (await getDocument("records_game/r1")).deleted).toBe(true);

    await page.locator("#records [data-restore]").click();
    await expect(page.locator("#records li.deleted")).toHaveCount(0);
    await expect.poll(async () => (await getDocument("records_game/r1")).deleted).toBeUndefined();
});

test("修改自己那一關的紀錄", async ({ page }) => {
    await setDocument("records_game/r1", { game: "d2", station: 1, round: 1, teams: ["第3隊"], result: { level: 0 }, likes: {}, by: NAMES.d2, createdAt: Date.now() });
    await staffLogin(page, D2_1, NAMES.d2);
    await page.locator("#records [data-edit]").click();
    await page.locator('#record_fields select[data-team="0"]').selectOption("第4隊");
    await page.locator("#record_save").click();
    await expect(page.locator("#records li").first()).toContainText("第4隊");
    await expect.poll(async () => (await getDocument("records_game/r1")).teams).toEqual(["第4隊"]);
});

test("練習模式：資料寫到練習區，正式資料不受影響", async ({ page }) => {
    await setDocument("settings_global/global", { numTeams: 6, practiceMode: true });
    await staffLogin(page, D2_1, NAMES.d2);
    await expect(page.locator("#practiceBar")).toBeVisible();
    await page.locator("#startBtn").click();
    await page.locator('#resultInput button[data-level="0"]').click();
    await page.locator("#submitBtn").click();
    await expect(page.locator("#idleView")).toBeVisible();
    expect(await listDocuments("practice_records_game")).toHaveLength(1);
    expect(await listDocuments("records_game")).toHaveLength(0);
});

test("總控台鎖定輸入時，關主頁會被擋住", async ({ page }) => {
    await setDocument("settings_global/global", { numTeams: 6, games: { d2: { locked: true } } });
    await staffLogin(page, D2_1, NAMES.d2);
    await expect(page.locator(".overlay").filter({ hasText: "輸入已鎖定" })).toBeVisible();
});
